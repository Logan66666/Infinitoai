(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.ToastFeedback = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const TOAST_DURATIONS = {
    error: 4200,
    warn: 3600,
    success: 5000,
    info: 5000,
  };

  function canonicalizeToastMessage(message) {
    let text = String(message || '').trim();
    text = text.replace(/^\[[^\]]+\]\s*/, '');
    text = text.replace(/^Auto fetch failed:\s*/i, '');
    text = text.replace(/^Run \d+\/(?:\d+|∞) failed:\s*/i, '');
    text = text.replace(/^Step \d+ failed:\s*/i, '');
    text = text.replace(/\s*\|\s*调试：[\s\S]*$/i, '');

    if (/could not find verification code input/i.test(text)) {
      return '未找到验证码输入框。';
    }

    if (/phone verification|phone number is required on the auth page|当前 auth 页面要求手机号验证|add-phone|auth page requires phone verification before the verification email step/i.test(text)) {
      return '当前 auth 页面要求手机号验证，请切换节点后重试。';
    }

    if (/email domain is unsupported on the auth page/i.test(text)) {
      return '当前邮箱域名暂不受支持，已加入黑名单，请切换新邮箱后重试。';
    }

    if (/current auth page is not on the signup flow yet/i.test(text)) {
      return '当前 auth 页面还没有进入注册流程。';
    }

    if (/signup auth page stayed unreachable before the verification email step/i.test(text)) {
      return '注册验证页暂时无法访问，请稍后重试。';
    }

    if (/当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。/i.test(text)) {
      return '当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。';
    }

    if (/当前邮箱域名暂不受支持，已加入黑名单，请切换新邮箱后重试。/i.test(text)) {
      return '当前邮箱域名暂不受支持，已加入黑名单，请切换新邮箱后重试。';
    }

    return text.trim();
  }

  function getToastDuration(type, duration) {
    if (typeof duration === 'number') {
      return duration;
    }
    return TOAST_DURATIONS[type] || TOAST_DURATIONS.info;
  }

  function buildToastKey(message, type = 'info') {
    return `${type}:${canonicalizeToastMessage(message)}`;
  }

  function shouldSuppressToastMessage(message, type = 'info') {
    if (type !== 'error' && type !== 'warn') {
      return false;
    }

    const text = String(message || '').trim();
    if (type === 'warn' && /^Stopping\.\.\.$/i.test(text)) {
      return true;
    }

    return /the page keeping the extension port is moved into back\/forward cache, so the message channel is closed|message channel closed before a response was received|could not establish connection\.\s*receiving end does not exist/i.test(text);
  }

  return {
    buildToastKey,
    canonicalizeToastMessage,
    getToastDuration,
    shouldSuppressToastMessage,
    TOAST_DURATIONS,
  };
});
