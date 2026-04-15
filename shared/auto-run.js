(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.AutoRun = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const STOP_ERROR_MESSAGE = 'Flow stopped by user.';
  const AUTO_RUN_HANDOFF_MESSAGE = 'Auto run handed off to manual continuation.';
  const AUTO_RUN_LOG_SILENCE_ERROR_PREFIX = 'Auto run watchdog detected ';
  const DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS = 60000;

  function getErrorMessage(error) {
    return typeof error === 'string' ? error : error?.message || '';
  }

  function extractEmailDomain(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === normalized.length - 1) {
      return '';
    }
    return normalized.slice(atIndex + 1).replace(/^@+/, '');
  }

  function decoratePhoneVerificationFailureWithEmailDomain(errorMessage, currentEmail) {
    const message = getErrorMessage(errorMessage);
    if (!/phone number is required on the auth page/i.test(message)) {
      return message;
    }
    if (/\(email domain:/i.test(message)) {
      return message;
    }

    const emailDomain = extractEmailDomain(currentEmail);
    if (!emailDomain) {
      return message;
    }

    return message.replace(
      /phone number is required on the auth page/i,
      `phone number is required on the auth page (email domain: ${emailDomain})`
    );
  }

  function sanitizeRunCounter(value) {
    const numeric = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    return numeric;
  }

  function resolveSummaryRunCounter(sessionValue, totalValue) {
    const sessionCount = sanitizeRunCounter(sessionValue);
    if (sessionValue !== undefined && sessionValue !== null) {
      return sessionCount;
    }
    return sanitizeRunCounter(totalValue);
  }

  function sanitizeDurationMs(value) {
    const numeric = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    return numeric;
  }

  function sanitizeSuccessMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'api') {
      return 'api';
    }
    if (normalized === 'simulated' || normalized === 'manual' || normalized === 'dom' || normalized === 'page') {
      return 'simulated';
    }
    return 'unknown';
  }

  function sanitizeRecentSuccessEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry) => ({
        durationMs: sanitizeDurationMs(entry?.durationMs ?? entry),
        mode: sanitizeSuccessMode(entry?.mode),
      }))
      .filter((entry) => entry.durationMs > 0)
      .slice(0, 20);
  }

  function shouldContinueAutoRunAfterError(error) {
    const message = getErrorMessage(error);
    return message !== STOP_ERROR_MESSAGE && message !== AUTO_RUN_HANDOFF_MESSAGE;
  }

  function formatSilenceTimeoutLabel(timeoutMs) {
    const seconds = Math.max(1, Math.round(sanitizeDurationMs(timeoutMs) / 1000) || Math.round(DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS / 1000));
    return `${seconds}s`;
  }

  function formatLastLogSummary({
    lastLogMessage = '',
    lastLogLevel = '',
  } = {}) {
    const message = String(lastLogMessage || '').trim();
    if (!message) {
      return '';
    }

    const level = String(lastLogLevel || '').trim().toLowerCase();
    return level ? `[${level}] ${message}` : message;
  }

  function buildAutoRunLogSilenceErrorMessage({
    timeoutMs = DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS,
    lastLogMessage = '',
    lastLogLevel = '',
    lastLogTimestamp = 0,
    now = Date.now(),
  } = {}) {
    const timeoutLabel = formatSilenceTimeoutLabel(timeoutMs);
    const summary = formatLastLogSummary({ lastLogMessage, lastLogLevel });
    if (!summary) {
      return `${AUTO_RUN_LOG_SILENCE_ERROR_PREFIX}${timeoutLabel} without new logs.`;
    }

    const elapsedSeconds = Number.isFinite(lastLogTimestamp) && Number.isFinite(now) && now > lastLogTimestamp
      ? Math.max(1, Math.round((now - lastLogTimestamp) / 1000))
      : null;
    const elapsedLabel = elapsedSeconds ? ` ${elapsedSeconds}s ago` : '';
    return `${AUTO_RUN_LOG_SILENCE_ERROR_PREFIX}${timeoutLabel} without new logs. Last log${elapsedLabel}: ${summary}`;
  }

  function isAutoRunLogSilenceError(error) {
    return getErrorMessage(error).startsWith(AUTO_RUN_LOG_SILENCE_ERROR_PREFIX);
  }

  function shouldStartNextInfiniteRunAfterManualFlow({
    autoRunInfinite = false,
    stopRequested = false,
  } = {}) {
    return Boolean(autoRunInfinite) && !Boolean(stopRequested);
  }

  function shouldContinueAutoRunAfterWatchdog({
    currentRun = 0,
    totalRuns = 0,
    infiniteMode = false,
  } = {}) {
    if (Boolean(infiniteMode) || totalRuns === Number.POSITIVE_INFINITY) {
      return true;
    }

    const run = Math.max(0, Number.parseInt(String(currentRun ?? 0).trim(), 10) || 0);
  function shouldSuspendAutoRunWatchdogDuringPause({
    phase = '',
    infiniteMode = false,
  } = {}) {
    const normalizedPhase = String(phase || '').trim().toLowerCase();
    if (normalizedPhase === 'waiting_email') {
      return !Boolean(infiniteMode);
    }
    return true;
  }

    const total = Math.max(0, Number.parseInt(String(totalRuns ?? 0).trim(), 10) || 0);
    return run < total;
  }

  function buildAutoRunStatusPayload({
    phase,
    currentRun,
    totalRuns,
    infiniteMode = false,
    successfulRuns = 0,
    failedRuns = 0,
    totalSuccessfulDurationMs = 0,
    recentSuccessDurationsMs = [],
    recentSuccessEntries = [],
    failureBuckets = [],
    summaryMessage = '',
    summaryToast = '',
    waitUntilTimestamp = null,
    waitReason = '',
  }) {
    const normalizedSuccessEntries = sanitizeRecentSuccessEntries(recentSuccessEntries);

    return {
      phase,
      currentRun,
      totalRuns,
      infiniteMode: Boolean(infiniteMode),
      successfulRuns: sanitizeRunCounter(successfulRuns),
      failedRuns: sanitizeRunCounter(failedRuns),
      totalSuccessfulDurationMs: sanitizeDurationMs(totalSuccessfulDurationMs),
      recentSuccessDurationsMs: Array.isArray(recentSuccessDurationsMs)
        ? recentSuccessDurationsMs
          .map((value) => sanitizeDurationMs(value))
          .filter((value) => value > 0)
          .slice(0, 20)
        : [],
      recentSuccessEntries: normalizedSuccessEntries,
      failureBuckets: Array.isArray(failureBuckets) ? failureBuckets : [],
      summaryMessage,
      summaryToast,
      waitUntilTimestamp: Number.isFinite(waitUntilTimestamp) ? waitUntilTimestamp : null,
      waitReason: typeof waitReason === 'string' ? waitReason : '',
    };
  }

  function formatAutoRunLabel({
    currentRun,
    totalRuns,
    infiniteMode = false,
  } = {}) {
    const run = Math.max(0, Number.parseInt(String(currentRun ?? 0).trim(), 10) || 0);
    if (Boolean(infiniteMode) || totalRuns === Number.POSITIVE_INFINITY) {
      return `${run}/∞`;
    }
    const total = Math.max(0, Number.parseInt(String(totalRuns ?? 0).trim(), 10) || 0);
    return `${run}/${total}`;
  }

  function buildAutoRunFailureRecord({
    errorMessage,
    currentRun,
    totalRuns,
    infiniteMode = false,
    step = 0,
    currentRunStep = 0,
    currentStep = 0,
    currentEmail = '',
    lastLogMessage = '',
    lastLogLevel = '',
    timestamp = Date.now(),
  } = {}) {
    const runLabel = formatAutoRunLabel({
      currentRun,
      totalRuns,
      infiniteMode,
    });
    const normalizedStep = Number.parseInt(String(step ?? '').trim(), 10);
    const normalizedCurrentRunStep = Number.parseInt(String(currentRunStep ?? '').trim(), 10);
    const normalizedCurrentStep = Number.parseInt(String(currentStep ?? '').trim(), 10);
    const resolvedStep = Number.isFinite(normalizedStep) && normalizedStep > 0
      ? normalizedStep
      : (Number.isFinite(normalizedCurrentRunStep) && normalizedCurrentRunStep > 0
        ? normalizedCurrentRunStep
        : (Number.isFinite(normalizedCurrentStep) && normalizedCurrentStep > 0 ? normalizedCurrentStep : 0));

    const decoratedErrorMessage = decoratePhoneVerificationFailureWithEmailDomain(errorMessage, currentEmail);
    const lastLogSummary = formatLastLogSummary({ lastLogMessage, lastLogLevel });
    const decoratedLogMessage = lastLogSummary
      ? `Run ${runLabel} failed: ${decoratedErrorMessage} Last log before stall: ${lastLogSummary}`
      : `Run ${runLabel} failed: ${decoratedErrorMessage}`;

    const record = {
      step: resolvedStep,
      errorMessage: decoratedErrorMessage,
      logMessage: decoratedLogMessage,
      runLabel,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    };

    const normalizedLastLogMessage = String(lastLogMessage || '').trim();
    const normalizedLastLogLevel = String(lastLogLevel || '').trim().toLowerCase();
    if (normalizedLastLogMessage) {
      record.lastLogMessage = normalizedLastLogMessage;
    }
    if (normalizedLastLogLevel) {
      record.lastLogLevel = normalizedLastLogLevel;
    }

    return record;
  }

  function summarizeAutoRunResult({
    totalRuns,
    successfulRuns,
    failedRuns,
    sessionSuccessfulRuns,
    sessionFailedRuns,
    lastAttemptedRun,
    stopRequested,
    handedOffToManual,
    infiniteMode = false,
  }) {
    const summarySuccessfulRuns = resolveSummaryRunCounter(sessionSuccessfulRuns, successfulRuns);
    const summaryFailedRuns = resolveSummaryRunCounter(sessionFailedRuns, failedRuns);

    if (handedOffToManual) {
      return {
        phase: 'stopped',
        message: '=== Auto run paused and handed off to manual continuation ===',
        toastMessage: '',
      };
    }

    if (stopRequested) {
      const completedRunsBeforeStop = Math.max(0, lastAttemptedRun - 1);
      if (infiniteMode) {
        return {
          phase: 'stopped',
          message: `=== Infinite auto run stopped after ${completedRunsBeforeStop} runs (${summarySuccessfulRuns} succeeded, ${summaryFailedRuns} failed) ===`,
          toastMessage: `无限自动运行已停止：成功 ${summarySuccessfulRuns} 次，失败 ${summaryFailedRuns} 次`,
        };
      }
      return {
        phase: 'stopped',
        message: `=== Stopped after ${completedRunsBeforeStop}/${totalRuns} runs (${summarySuccessfulRuns} succeeded, ${summaryFailedRuns} failed) ===`,
        toastMessage: `自动运行已停止：成功 ${summarySuccessfulRuns} 次，失败 ${summaryFailedRuns} 次`,
      };
    }

    return {
      phase: 'complete',
      message: `=== Auto run finished: ${summarySuccessfulRuns} succeeded, ${summaryFailedRuns} failed, ${totalRuns} total ===`,
      toastMessage: `自动运行完成：成功 ${summarySuccessfulRuns} 次，失败 ${summaryFailedRuns} 次`,
    };
  }

  return {
    AUTO_RUN_LOG_SILENCE_ERROR_PREFIX,
    DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS,
    buildAutoRunLogSilenceErrorMessage,
    buildAutoRunStatusPayload,
    buildAutoRunFailureRecord,
    formatAutoRunLabel,
    isAutoRunLogSilenceError,
    shouldContinueAutoRunAfterWatchdog,
    shouldStartNextInfiniteRunAfterManualFlow,
    shouldContinueAutoRunAfterError,
    summarizeAutoRunResult,
  };
});
    shouldSuspendAutoRunWatchdogDuringPause,
