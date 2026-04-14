(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.FlowRecovery = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const TMAILOR_HOME_URL = 'https://tmailor.com/';

  function normalizeStep(step) {
    const value = Number.parseInt(String(step ?? '').trim(), 10);
    return Number.isFinite(value) ? value : 0;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getMailTabOpenUrlForStep({ step, mailSource, defaultUrl } = {}) {
    if (normalizeStep(step) === 7 && String(mailSource || '').trim() === 'tmailor-mail') {
      return TMAILOR_HOME_URL;
    }

    return String(defaultUrl || '').trim();
  }

  function shouldNavigateMailTabOnStepStart({ step, mailSource } = {}) {
    return normalizeStep(step) === 7 && String(mailSource || '').trim() === 'tmailor-mail';
  }

  function isVpsAuthorizationNotPendingText(value) {
    const text = normalizeText(value).toLowerCase();
    if (!text) {
      return false;
    }

    return (
      /(authorization|authorisation|auth)\s+link[^|]*not\s+pending/.test(text) ||
      /link\s+is\s+not\s+pending/.test(text) ||
      /授权链接[^|]*not\s+pending/.test(text) ||
      /授权链接[^|]*(不在待处理|不是待处理|未待处理)/.test(text)
    );
  }

  return {
    TMAILOR_HOME_URL,
    getMailTabOpenUrlForStep,
    shouldNavigateMailTabOnStepStart,
    isVpsAuthorizationNotPendingText,
  };
});
