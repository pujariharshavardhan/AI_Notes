/**
 * notes.js – Note card / category card rendering + TXT/HTML export.
 * Content is now stored as HTML; previews use the plain-text contentText field.
 */
const Notes = (() => {

  const CAT_META = {
    Personal:    { icon: 'fa-user',           color: '#4361ee' },
    Study:       { icon: 'fa-graduation-cap', color: '#22c55e' },
    Work:        { icon: 'fa-briefcase',      color: '#f59e0b' },
    Programming: { icon: 'fa-code',           color: '#a855f7' },
    Ideas:       { icon: 'fa-lightbulb',      color: '#06b6d4' },
    Shopping:    { icon: 'fa-cart-shopping',  color: '#ef4444' },
    Other:       { icon: 'fa-folder',         color: '#64748b' },
  };

  function getCatMeta(cat) {
    return CAT_META[cat] || { icon: 'fa-folder', color: '#64748b' };
  }

  function pinFirst(notes) {
    return [...notes.filter(n => n.pinned), ...notes.filter(n => !n.pinned)];
  }

  /* ---- NOTE CARD ---- */
  function createCard(note, query) {
    const card     = document.createElement('div');
    const colorCls = (note.color && note.color !== 'default') ? `color-${note.color}` : 'color-default';
    card.className = `note-card ${colorCls}`;
    card.dataset.noteId = note.id;

    /* Badges */
    const pinBadge = note.pinned   ? `<span class="status-badge badge-pin" title="Pinned"><i class="fas fa-thumbtack"></i></span>` : '';
    const favBadge = note.favorite ? `<span class="status-badge badge-fav" title="Favourite"><i class="fas fa-star"></i></span>` : '';

    /* Use plain text for preview (strip HTML tags) */
    const previewSrc = (note.contentText || Storage.stripHtml(note.content || '')).slice(0, 160);
    const ellipsis   = (note.contentText || '').length > 160 ? '…' : '';

    const titleHtml   = query ? Search.highlight(note.title || 'Untitled', query) : Search.escHtml(note.title || 'Untitled');
    const previewHtml = query ? Search.highlight(previewSrc, query)                : Search.escHtml(previewSrc);

    card.innerHTML = `
      <div class="note-status-badges">${pinBadge}${favBadge}</div>
      <div class="note-title">${titleHtml}</div>
      <span class="note-cat-badge">${Search.escHtml(note.category || 'Uncategorised')}</span>
      <p class="note-preview">${previewHtml}${ellipsis}</p>
      <div class="note-footer">
        <span class="note-date"><i class="fas fa-calendar-alt"></i> ${note.date || ''}</span>
        <div class="note-actions">
          <button class="action-btn btn-pin  ${note.pinned   ? 'is-active':''}" data-id="${note.id}" title="${note.pinned?'Unpin':'Pin'}"><i class="fas fa-thumbtack"></i></button>
          <button class="action-btn btn-fav  ${note.favorite ? 'is-active':''}" data-id="${note.id}" title="${note.favorite?'Unfavourite':'Favourite'}"><i class="fas fa-star"></i></button>
          <button class="action-btn btn-edit"   data-id="${note.id}" title="Edit"><i class="fas fa-pencil"></i></button>
          <button class="action-btn btn-export" data-id="${note.id}" title="Export TXT"><i class="fas fa-file-lines"></i></button>
          <button class="action-btn btn-del"    data-id="${note.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;

    card.addEventListener('click', e => {
      if (!e.target.closest('.note-actions')) App.viewNote(note.id);
    });

    return card;
  }

  /* ---- CATEGORY CARD ---- */
  function createCatCard(cat, count) {
    const { icon, color } = getCatMeta(cat);
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-icon" style="background:linear-gradient(135deg,${color},${color}99)">
        <i class="fas ${icon}"></i>
      </div>
      <span class="cat-name">${Search.escHtml(cat)}</span>
      <span class="cat-count">${count} note${count !== 1 ? 's' : ''}</span>`;
    card.addEventListener('click', () => App.showCategory(cat));
    return card;
  }

  /* ---- EXPORT ---- */
  function exportTxt(note) {
    const plain = note.contentText || Storage.stripHtml(note.content || '');
    const lines = [
      'Smart Notes Keeper – Note Export',
      '='.repeat(44),
      `Title    : ${note.title}`,
      `Category : ${note.category}`,
      `Date     : ${note.date}`,
      '='.repeat(44),
      '',
      plain,
      '',
      '='.repeat(44),
      `Words: ${Search.wordCount(plain)}  |  Characters: ${Search.charCount(plain)}`,
      `Exported : ${new Date().toLocaleString()}`,
    ];
    _download(lines.join('\n'), `${_slug(note.title)}.txt`, 'text/plain;charset=utf-8');
  }

  function exportHtml(note) {
    const doc = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${Search.escHtml(note.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px}</style></head>
<body><h1>${Search.escHtml(note.title)}</h1>
<p><small>Category: ${Search.escHtml(note.category)} | Date: ${note.date}</small></p>
<hr>${note.content || ''}</body></html>`;
    _download(doc, `${_slug(note.title)}.html`, 'text/html;charset=utf-8');
  }

  function _slug(title) {
    return (title || 'note').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  }

  function _download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { CAT_META, getCatMeta, pinFirst, createCard, createCatCard, exportTxt, exportHtml };
})();
