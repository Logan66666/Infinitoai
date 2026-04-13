(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.TmailorPasteFeedback = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function getTmailorValidationModeLabel(mode) {
    return String(mode || '').trim().toLowerCase() === 'whitelist_only'
      ? '当前仅白名单模式'
      : '当前域名规则';
  }

  function buildTmailorRejectedDomainMessage(domain, mode) {
    const safeDomain = String(domain || 'unknown domain').trim();
    return `${safeDomain} 不符合${getTmailorValidationModeLabel(mode)}，已清空输入并自动请求新的 TMailor 邮箱。`;
  }

  function shouldRetryTmailorFetchAfterValidationFailure(validation) {
    return Boolean(validation && validation.reason === 'disallowed_domain');
  }

  function getClipboardReadDeniedMessage() {
    return '未读取到邮箱。请先把邮箱粘贴进输入框，或在 Chrome 扩展页重新加载插件以启用剪贴板读取权限后再试。';
  }

  function getNoTmailorEmailFoundMessage() {
    return '没有读到有效邮箱。请先把邮箱粘贴到输入框里，再点“粘贴并检测”。';
  }

  function getTmailorValidationSuccessAction({ autoContinueVisible = false } = {}) {
    return autoContinueVisible ? 'resume_auto_run' : 'execute_step_3';
  }

  function shouldAttemptAutoRunResumeFromInput({ autoContinueVisible = false, email = '' } = {}) {
    const normalizedEmail = String(email || '').trim();
    return Boolean(
      autoContinueVisible
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail)
    );
  }

  function shouldExecuteStep3AfterValidation({ successAction = '', resumeSucceeded = false } = {}) {
    if (successAction === 'execute_step_3') {
      return true;
    }
    if (successAction === 'resume_auto_run') {
      return !resumeSucceeded;
    }
    return false;
  }

  function shouldFallbackToStep3AfterResume(result) {
    return !Boolean(result && result.resumed === true);
  }

  return {
    buildTmailorRejectedDomainMessage,
    getClipboardReadDeniedMessage,
    getNoTmailorEmailFoundMessage,
    getTmailorValidationSuccessAction,
    shouldExecuteStep3AfterValidation,
    getTmailorValidationModeLabel,
    shouldAttemptAutoRunResumeFromInput,
    shouldFallbackToStep3AfterResume,
    shouldRetryTmailorFetchAfterValidationFailure,
  };
});
