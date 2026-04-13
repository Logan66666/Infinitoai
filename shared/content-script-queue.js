(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.ContentScriptQueue = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function getContentScriptQueueTimeout(source, messageType) {
    const normalizedSource = String(source || '').trim();
    const normalizedType = String(messageType || '').trim();

    if (normalizedSource === 'tmailor-mail') {
      if (normalizedType === 'FETCH_TMAILOR_EMAIL') {
        return 0;
      }
      if (normalizedType === 'POLL_EMAIL') {
        return 0;
      }
      return 0;
    }

    return 15000;
  }

  async function queueCommandForReinjection(options = {}) {
    const queueCommand = typeof options.queueCommand === 'function'
      ? options.queueCommand
      : (() => Promise.reject(new Error('queueCommandForReinjection requires queueCommand.')));
    const reinject = typeof options.reinject === 'function'
      ? options.reinject
      : (async () => null);
    const flushCommand = typeof options.flushCommand === 'function'
      ? options.flushCommand
      : (() => {});

    const source = options.source;
    const message = options.message;
    const timeout = Number.isFinite(options.timeout) ? options.timeout : 0;

    const queuedPromise = queueCommand(source, message, timeout);
    const readyTabId = await reinject();
    if (readyTabId != null) {
      flushCommand(source, readyTabId);
    }
    return await queuedPromise;
  }

  return {
    getContentScriptQueueTimeout,
    queueCommandForReinjection,
  };
});
