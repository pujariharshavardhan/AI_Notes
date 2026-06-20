/**
 * ocr.js – Optical Character Recognition via Tesseract.js (CDN).
 *
 * Exported API:
 *   OCR.isSupported()            – always true once Tesseract is loaded
 *   OCR.recognise(file, onProg) – async; file = File/Blob/URL/canvas
 *                                  onProg(pct) called 0-100 during processing
 *                                  resolves with extracted text string
 */
const OCR = (() => {

  function isSupported() {
    return typeof Tesseract !== 'undefined';
  }

  /**
   * @param {File|Blob|string} source  Image file, blob, or URL.
   * @param {function}         onProg  Progress callback pct 0→100.
   * @returns {Promise<string>}        Recognised text.
   */
  async function recognise(source, onProg) {
    if (!isSupported()) {
      throw new Error('Tesseract.js is not loaded. Check your internet connection.');
    }

    onProg && onProg(0);

    /* Tesseract v4+ API */
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          onProg && onProg(Math.round(m.progress * 100));
        }
      },
    });

    try {
      const { data: { text } } = await worker.recognize(source);
      onProg && onProg(100);
      return text.trim();
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Helper: read a File as a data-URL and pass to recognise().
   */
  async function recogniseFile(file, onProg) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = async () => {
        try { resolve(await recognise(reader.result, onProg)); }
        catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  return { isSupported, recognise, recogniseFile };
})();
