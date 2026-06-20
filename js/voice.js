/**
 * voice.js – Speech-to-Text via the Web Speech API.
 *
 * Usage:
 *   Voice.init()          – call once at app start
 *   Voice.isSupported()   – check browser support
 *   Voice.toggle(onChunk) – start / stop listening
 *                           onChunk(finalText, interimText) fires on each result
 *   Voice.stop()          – stop immediately
 *   Voice.isListening()   – boolean
 */
const Voice = (() => {
  let _recognition  = null;
  let _listening    = false;
  let _onChunk      = null;
  let _onStateChange = null;

  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function init(onStateChange) {
    _onStateChange = onStateChange;
    if (!isSupported()) {
      console.warn('[Voice] SpeechRecognition not supported in this browser.');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SR();
    _recognition.continuous      = true;
    _recognition.interimResults  = true;
    _recognition.lang            = 'en-US';
    _recognition.maxAlternatives = 1;

    _recognition.onresult = e => {
      let finalText   = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText   += t;
        else                       interimText += t;
      }
      _onChunk && _onChunk(finalText, interimText);
    };

    _recognition.onerror = e => {
      console.warn('[Voice] Error:', e.error);
      if (e.error === 'not-allowed') {
        App.showToast('Microphone permission denied.', 'danger');
      }
      _setListening(false);
    };

    _recognition.onend = () => {
      /* Auto-restart if we're still supposed to be listening */
      if (_listening) {
        try { _recognition.start(); } catch (_) {}
      }
    };
  }

  function _setListening(val) {
    _listening = val;
    _onStateChange && _onStateChange(val);
  }

  function start(onChunk) {
    if (!_recognition) { App.showToast('Voice input is not supported in this browser.', 'danger'); return; }
    _onChunk = onChunk;
    try { _recognition.start(); } catch (_) {}
    _setListening(true);
  }

  function stop() {
    if (!_recognition) return;
    _setListening(false);
    try { _recognition.stop(); } catch (_) {}
  }

  function toggle(onChunk) {
    _listening ? stop() : start(onChunk);
    return _listening;
  }

  function isListening() { return _listening; }

  return { isSupported, init, start, stop, toggle, isListening };
})();
