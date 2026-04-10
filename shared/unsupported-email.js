(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.UnsupportedEmail = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const UNSUPPORTED_EMAIL_PATTERNS = [
    /邮箱.*不支持/i,
    /邮箱.*不受支持/i,
    /电子邮件.*不支持/i,
    /电子邮件.*不受支持/i,
    /unsupported\s+email/i,
    /unsupported_email/i,
    /email\s+address\s+is\s+unsupported/i,
    /email\s+domain\s+is\s+unsupported/i,
  ];

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function isUnsupportedEmailText(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    return UNSUPPORTED_EMAIL_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function isUnsupportedEmailBlockingStep(step) {
    return Number(step) === 5;
  }

  function getUnsupportedEmailBlockedMessage(step) {
    return `Step ${step} blocked: email domain is unsupported on the auth page.`;
  }

  return {
    getUnsupportedEmailBlockedMessage,
    isUnsupportedEmailBlockingStep,
    isUnsupportedEmailText,
  };
});
