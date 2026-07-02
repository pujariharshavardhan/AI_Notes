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
  async function generateNote(topic) {
    if (!topic.trim()) throw new Error('Please enter a topic.');

    const { title, extract, url } = await _wikiSummary(topic);
    const sentences = _splitSentences(extract);
    const intro = sentences[0] || extract;
    const points = sentences.slice(1);

    let note = `${title}\n\n${intro}\n\n`;
    if (points.length) {
      note += 'Key Points:\n' + points.map(p => `- ${p}`).join('\n') + '\n\n';
    }
    note += `Summary: ${summarize(extract, 2)}`;
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
