/**
 * ai.js – Google Gemini API integration.
 *
 * Features: summarize, generate note, fix grammar.
 * API key is stored in Settings (localStorage).
 * Model: gemini-1.5-flash (free-tier friendly).
 */
const AI = (() => {
  const MODEL   = 'gemini-1.5-flash';
  const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  function _key() {
    return Storage.getSettings().geminiApiKey?.trim() || '';
  }

  function hasKey() { return !!_key(); }

  async function _call(prompt) {
    const key = _key();
    if (!key) throw new Error('Gemini API key not configured. Add it in ⚙ Settings → API Keys.');

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });

    /* Keys starting with "AIza" → standard API-key query-param style.
       All other formats (AQ., OAuth tokens, etc.) → Bearer header style. */
    const useBearer = !key.startsWith('AIza');

    const url     = useBearer ? BASE_URL : `${BASE_URL}?key=${key}`;
    const headers = { 'Content-Type': 'application/json' };
    if (useBearer) headers['Authorization'] = `Bearer ${key}`;

    const res  = await fetch(url, { method: 'POST', headers, body });
    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      /* If bearer failed, retry with key param as a last resort */
      if (useBearer && res.status === 401) {
        const res2  = await fetch(`${BASE_URL}?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const data2 = await res2.json();
        if (!res2.ok || data2.error) throw new Error(data2.error?.message || `HTTP ${res2.status}`);
        const t2 = data2.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!t2) throw new Error('Empty response from Gemini.');
        return t2.trim();
      }
      throw new Error(msg);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');
    return text.trim();
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
