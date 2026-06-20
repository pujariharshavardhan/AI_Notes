/**
 * editor.js – Quill.js rich-text editor wrapper.
 *
 * Provides: init, getHTML, getText, setHTML, clear, focus,
 *           insertText, wordCount, charCount.
 *
 * Cloudinary image handler: when the user clicks the image button,
 * it uploads to Cloudinary first (if configured) then embeds the URL.
 */
const Editor = (() => {
  let _quill = null;

  /* ---- Quill toolbar definition ---- */
  const TOOLBAR = [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean'],
  ];

  function init(containerId) {
    _quill = new Quill(`#${containerId}`, {
      theme:   'snow',
      modules: { toolbar: { container: TOOLBAR, handlers: { image: _imageHandler } } },
      placeholder: 'Write your note here…',
    });

    /* Live word / char counter */
    _quill.on('text-change', () => {
      const wEl = document.getElementById('wordCount');
      const cEl = document.getElementById('charCount');
      if (wEl) wEl.textContent = wordCount();
      if (cEl) cEl.textContent = charCount();
    });

    return _quill;
  }

  /* ---- Cloudinary / fallback image handler ---- */
  function _imageHandler() {
    const settings = Storage.getSettings();
    const cloudName  = settings.cloudinaryCloudName?.trim();
    const preset     = settings.cloudinaryUploadPreset?.trim();

    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;

      if (cloudName && preset) {
        /* Upload to Cloudinary */
        try {
          App.showToast('Uploading image…', 'info');
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', preset);
          const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
          const data = await res.json();
          if (data.secure_url) {
            _insertImage(data.secure_url);
            App.showToast('Image uploaded!', 'success');
          } else {
            throw new Error(data.error?.message || 'Upload failed');
          }
        } catch (e) {
          App.showToast('Cloudinary upload failed: ' + e.message, 'danger');
        }
      } else {
        /* Fallback: embed as base64 data-URL (local only) */
        const reader = new FileReader();
        reader.onload = () => _insertImage(reader.result);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  function _insertImage(url) {
    const range = _quill.getSelection(true);
    _quill.insertEmbed(range.index, 'image', url, Quill.sources.USER);
    _quill.setSelection(range.index + 1, Quill.sources.SILENT);
  }

  /* ---- Public API ---- */
  function getHTML()       { return _quill ? _quill.root.innerHTML : ''; }
  function getText()       { return _quill ? _quill.getText() : ''; }
  function setHTML(html)   { if (_quill) _quill.root.innerHTML = html || ''; }
  function clear()         { if (_quill) _quill.setContents([]); }
  function focus()         { if (_quill) _quill.focus(); }

  /** Insert plain text at cursor (used by Voice & OCR). */
  function insertText(text) {
    if (!_quill) return;
    const range = _quill.getSelection(true) || { index: _quill.getLength() - 1 };
    _quill.insertText(range.index, text, Quill.sources.USER);
    _quill.setSelection(range.index + text.length, Quill.sources.SILENT);
  }

  /** Replace all content with plain text (used by AI grammar fix). */
  function replaceWithText(text) {
    if (!_quill) return;
    _quill.setContents([]);
    _quill.insertText(0, text, Quill.sources.USER);
  }

  function wordCount() {
    const t = getText().trim();
    return t ? t.split(/\s+/).length : 0;
  }
  function charCount() { return getText().length; }

  return { init, getHTML, getText, setHTML, clear, focus, insertText, replaceWithText, wordCount, charCount };
})();
