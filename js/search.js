/**
 * search.js – Filtering, sorting, highlighting utilities.
 * Notes now store content as HTML; search runs on `contentText` (plain text).
 */
const Search = (() => {

  function searchNotes(query, notes) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return notes;
    return notes.filter(n =>
      n.title?.toLowerCase().includes(q) ||
      (n.contentText || '').toLowerCase().includes(q) ||
      n.category?.toLowerCase().includes(q)
    );
  }

  function filterByCategory(cat, notes) {
    return cat ? notes.filter(n => n.category === cat) : notes;
  }

  function filterByColor(color, notes) {
    return color ? notes.filter(n => (n.color || 'default') === color) : notes;
  }

  function sortNotes(type, notes) {
    const arr = [...notes];
    switch (type) {
      case 'newest':   return arr.sort((a, b) => (b.id > a.id ? 1 : -1));
      case 'oldest':   return arr.sort((a, b) => (a.id > b.id ? 1 : -1));
      case 'title-az': return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'title-za': return arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      default:         return arr;
    }
  }

  /** Safe HTML escape */
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  /** Highlight query within plain text, return safe HTML */
  function highlight(text, query) {
    const safe = escHtml(text || '');
    if (!query?.trim()) return safe;
    const rx = new RegExp(`(${escRegex(query)})`, 'gi');
    return safe.replace(rx, '<mark class="highlight">$1</mark>');
  }

  function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function wordCount(text) {
    const t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }
  function charCount(text) { return (text || '').length; }

  return { searchNotes, filterByCategory, filterByColor, sortNotes, escHtml, highlight, wordCount, charCount };
})();
