/**
 * ai.js – Google Gemini API integration.
 *
 * Features: summarize, generate note, fix grammar.
 * API key is stored in Settings (localStorage).
 * Model: gemini-1.5-flash (free-tier friendly).
 */
const AI = (() => {
  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

  function _key() {
    return Storage.getSettings().geminiApiKey?.trim() || '';
  }

  function hasKey() { return !!_key(); }

  function _urls(model) {
    return {
      v1:    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
      v1beta:`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    };
  }

  async function _tryFetch(url, headers, body) {
    const res  = await fetch(url, { method: 'POST', headers, body });
    const data = await res.json();
    return { res, data };
  }

  async function _callModel(prompt, model) {
    const key  = _key();
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
    const ct   = { 'Content-Type': 'application/json' };
    const { v1, v1beta } = _urls(model);

    /* For AQ./non-AIza keys try ?key= param first (Bearer gives 401),
       then Bearer as fallback. AIza keys only need ?key= param. */
    const attempts = key.startsWith('AIza')
      ? [
          { url: `${v1}?key=${key}`,    headers: ct },
          { url: `${v1beta}?key=${key}`,headers: ct },
        ]
      : [
          { url: `${v1}?key=${key}`,    headers: ct },
          { url: `${v1beta}?key=${key}`,headers: ct },
          { url: v1,    headers: { ...ct, Authorization: `Bearer ${key}` } },
          { url: v1beta,headers: { ...ct, Authorization: `Bearer ${key}` } },
        ];

    let lastErr = '';
    for (const attempt of attempts) {
      try {
        const { res, data } = await _tryFetch(attempt.url, attempt.headers, body);
        if (res.ok && !data.error) {
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text.trim();
        }
        lastErr = data.error?.message || `HTTP ${res.status}`;
        if (res.status === 401) continue;          // try next auth style
        if (res.status === 429) return null;       // quota — try next model
        if (res.status === 404) return null;       // model not found — try next
      } catch (e) {
        lastErr = e.message;
      }
    }
    return null;
  }

  async function _call(prompt) {
    const key = _key();
    if (!key) throw new Error('Gemini API key not configured.');

    for (const model of MODELS) {
      const result = await _callModel(prompt, model);
      if (result !== null) return result;
    }
    throw new Error('AI quota exceeded or key invalid. Please check your Google AI Studio API key and billing at https://aistudio.google.com/apikey');
  }

  /**
   * Summarise the given plain text into 2-3 sentences.
   */
  async function summarize(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to summarise.');
    return _call(
      `You are a concise note summariser. Summarise the following note in 2-3 sentences. ` +
      `Return only the summary, no preamble.\n\n${plainText}`
    );
  }

  /**
   * Generate a well-structured note for the given topic.
   * Returns markdown-style text that will be inserted into the editor.
   */
  async function generateNote(topic) {
    if (!topic.trim()) throw new Error('Please enter a topic to generate a note about.');
    return _call(
      `Create a comprehensive, well-organised note about: "${topic}".\n` +
      `Include: a short introduction, key points (use bullet points or numbered lists), ` +
      `important details, and a brief summary. ` +
      `Format nicely with clear headings. Return only the note content.`
    );
  }

  /**
   * Fix grammar, spelling and punctuation.
   * Returns the corrected plain text.
   */
  async function fixGrammar(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to fix.');
    return _call(
      `Fix all grammar, spelling, punctuation, and awkward phrasing in the following text. ` +
      `Preserve the original meaning and structure. ` +
      `Return ONLY the corrected text with no explanation or comments.\n\n${plainText}`
    );
  }

  /**
   * Expand a short bullet-point draft into a full note.
   */
  async function expandNote(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to expand.');
    return _call(
      `Expand the following rough notes into a clear, well-written, detailed note. ` +
      `Keep all the key information and add useful context. ` +
      `Return only the expanded note content.\n\n${plainText}`
    );
  }

  return { hasKey, summarize, generateNote, fixGrammar, expandNote };
})();
