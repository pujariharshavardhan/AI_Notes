/**
 * ai.js – AI features via Netlify serverless function (no API key in browser).
 */
const AI = (() => {

  function hasKey() { return true; }

  async function _call(prompt) {
    const res = await fetch('/.netlify/functions/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'AI request failed');
    if (!data.text) throw new Error('Empty response from AI.');
    return data.text.trim();
  }

  async function summarize(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to summarise.');
    return _call(
      `Summarise the following note in 2-3 sentences. Return only the summary.\n\n${plainText}`
    );
  }

  async function generateNote(topic) {
    if (!topic.trim()) throw new Error('Please enter a topic.');
    return _call(
      `Create a comprehensive, well-organised note about: "${topic}".\n` +
      `Include: introduction, key points (bullet points), important details, and a brief summary. ` +
      `Format with clear headings. Return only the note content.`
    );
  }

  async function fixGrammar(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to fix.');
    return _call(
      `Fix all grammar, spelling, punctuation, and awkward phrasing in the following text. ` +
      `Preserve the original meaning. Return ONLY the corrected text.\n\n${plainText}`
    );
  }

  async function expandNote(plainText) {
    if (!plainText.trim()) throw new Error('Note is empty – nothing to expand.');
    return _call(
      `Expand the following rough notes into a clear, well-written, detailed note. ` +
      `Keep all key information and add useful context. Return only the expanded note.\n\n${plainText}`
    );
  }

  return { hasKey, summarize, generateNote, fixGrammar, expandNote };
})();
