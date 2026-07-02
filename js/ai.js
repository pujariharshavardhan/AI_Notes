/**
 * ai.js – AI Tools, fully client-side. No API key, no server, no Netlify function.
 *  - Summarise    : local extractive summarisation (word-frequency sentence scoring)
 *  - Fix Grammar  : LanguageTool public API (free, keyless, CORS-enabled)
 *  - Generate Note: Wikipedia public API (free, keyless, CORS-enabled)
 *  - Expand Note  : reformats the note + pulls extra context from Wikipedia
 */
const AI = (() => {

  const STOPWORDS = new Set(
    ('a an the and or but if of to in on for with is are was were be been being this ' +
     'that these those it its as at by from not no so than then too very can will just ' +
     'should now also into over under out up down').split(' ')
  );

  function _splitSentences(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    return (cleaned.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean);
  }

  function _wordFreq(sentences) {
    const freq = {};
    sentences.forEach(s => {
      (s.toLowerCase().match(/[a-z']+/g) || []).forEach(w => {
        if (STOPWORDS.has(w) || w.length < 3) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    return freq;
  }

  /* ---------- Summarise (local, no network) ---------- */
  function summarize(plainText, maxSentences = 3) {
    const text = plainText.trim();
    if (!text) throw new Error('Note is empty – nothing to summarise.');

    const sentences = _splitSentences(text);
    if (sentences.length <= maxSentences) return text;

    const freq = _wordFreq(sentences);
    const scored = sentences.map((s, i) => {
      const words = s.toLowerCase().match(/[a-z']+/g) || [];
      const score = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / (words.length || 1);
      return { s, i, score };
    });

    const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences);
    top.sort((a, b) => a.i - b.i);
    return top.map(t => t.s).join(' ');
  }

  /* ---------- Wikipedia lookup (used by generate + expand) ---------- */
  async function _wikiSummary(topic) {
    let title = topic.trim();

    try {
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(title)}&limit=1`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.pages && searchData.pages.length) title = searchData.pages[0].title;
      }
    } catch (_) { /* fall back to the raw topic string */ }

    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error(`Couldn't find information about "${topic}".`);
    const data = await res.json();
    if (!data.extract) throw new Error(`Couldn't find information about "${topic}".`);
    return { title: data.title, extract: data.extract, url: data.content_urls?.desktop?.page || '' };
  }

  /* ---------- Generate Note ---------- */
  const SKIP_SECTIONS = new Set([
    'references', 'external links', 'see also', 'further reading', 'notes',
    'bibliography', 'sources', 'citations', 'footnotes', 'gallery',
  ]);

  /* Fetch the FULL plain-text article and split it into { lead, sections } */
  async function _wikiArticle(title) {
    const res = await fetch(
      'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext' +
      `&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data.query?.pages || {})[0];
    if (!page || !page.extract) return null;

    /* Article text uses "== Heading ==" markers between sections */
    const parts = page.extract.split(/\n==+\s*([^=\n]+?)\s*==+\n/);
    const lead = parts[0].trim();
    const sections = [];
    for (let i = 1; i < parts.length - 1; i += 2) {
      const heading = parts[i].trim();
      const body = parts[i + 1].trim();
      if (!body || SKIP_SECTIONS.has(heading.toLowerCase())) continue;
      sections.push({ heading, body });
    }
    return { title: page.title, lead, sections };
  }

  async function generateNote(topic) {
    if (!topic.trim()) throw new Error('Please enter a topic.');

    const { title, extract, url } = await _wikiSummary(topic);

    let article = null;
    try { article = await _wikiArticle(title); } catch (_) { /* fall back to short summary */ }
    const lead = (article && article.lead) || extract;

    const leadSentences = _splitSentences(lead);
    let note = `${article?.title || title}\n\n`;

    /* Introduction: first paragraph of the lead, capped at 4 sentences */
    const firstPara = lead.split(/\n\n+/)[0];
    const introSentences = _splitSentences(firstPara);
    const intro = introSentences.length > 4 ? introSentences.slice(0, 4).join(' ') : firstPara;
    note += `Introduction:\n${intro}\n\n`;

    /* Key points: the most informative sentences from the whole lead */
    const keyPoints = leadSentences.length > 3
      ? _splitSentences(summarize(lead, 5))
      : leadSentences;
    if (keyPoints.length) {
      note += 'Key Points:\n' + keyPoints.map(p => `- ${p}`).join('\n') + '\n\n';
    }

    /* Detailed sections: heading + the 2 most informative sentences of each */
    if (article && article.sections.length) {
      for (const sec of article.sections.slice(0, 5)) {
        let secText;
        try { secText = summarize(sec.body, 2); } catch (_) { continue; }
        if (!secText.trim()) continue;
        note += `${sec.heading}:\n${secText}\n\n`;
      }
    }

    note += `Summary:\n${summarize(lead, 2)}`;
    if (url) note += `\n\nSource: ${url}`;
    return note;
  }

  /* ---------- Fix Grammar (LanguageTool) ---------- */
  async function fixGrammar(plainText) {
    const text = plainText.trim();
    if (!text) throw new Error('Note is empty – nothing to fix.');

    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language: 'auto' }),
    });
    if (!res.ok) throw new Error('Grammar check service is unavailable right now. Please try again shortly.');

    const data = await res.json();

    /* LanguageTool can return overlapping matches (e.g. a phrase-level match
       and a word-level match inside it). Applying both corrupts the text, so
       keep only non-overlapping matches, earliest offset wins. */
    const ordered = (data.matches || []).slice().sort((a, b) => a.offset - b.offset);
    const nonOverlapping = [];
    let lastEnd = -1;
    for (const m of ordered) {
      if (m.offset < lastEnd) continue;
      nonOverlapping.push(m);
      lastEnd = m.offset + m.length;
    }

    let result = text;
    for (const m of nonOverlapping.reverse()) {
      const replacement = m.replacements && m.replacements[0] && m.replacements[0].value;
      if (replacement === undefined) continue;
      result = result.slice(0, m.offset) + replacement + result.slice(m.offset + m.length);
    }
    return result;
  }

  /* ---------- Expand Note ---------- */
  async function expandNote(plainText) {
    const text = plainText.trim();
    if (!text) throw new Error('Note is empty – nothing to expand.');

    const sentences = _splitSentences(text);
    let expanded = sentences.map(s => `- ${s}`).join('\n');

    const freq = _wordFreq(sentences);
    const topWord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (topWord) {
      try {
        const { title, extract, url } = await _wikiSummary(topWord[0]);
        expanded += `\n\nAdditional Context (${title}):\n${extract}`;
        if (url) expanded += `\n\nSource: ${url}`;
      } catch (_) { /* no extra context available – that's fine, keep the reformatted note */ }
    }
    return expanded;
  }

  return { summarize, generateNote, fixGrammar, expandNote };
})();
