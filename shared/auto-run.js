(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.AutoRun = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const STOP_ERROR_MESSAGE = 'Flow stopped by user.';
  const AUTO_RUN_HANDOFF_MESSAGE = 'Auto run handed off to manual continuation.';

  function getErrorMessage(error) {
    return typeof error === 'string' ? error : error?.message || '';
  }

  function sanitizeRunCounter(value) {
    const numeric = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    return numeric;
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

  function shouldStartNextInfiniteRunAfterManualFlow({
    autoRunInfinite = false,
    stopRequested = false,
  } = {}) {
    return Boolean(autoRunInfinite) && !Boolean(stopRequested);
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

    return {
      step: resolvedStep,
      errorMessage: getErrorMessage(errorMessage),
      logMessage: `Run ${runLabel} failed: ${getErrorMessage(errorMessage)}`,
      runLabel,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    };
  }

  function summarizeAutoRunResult({
    totalRuns,
    successfulRuns,
    failedRuns,
    lastAttemptedRun,
    stopRequested,
    handedOffToManual,
    infiniteMode = false,
  }) {
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
          message: `=== Infinite auto run stopped after ${completedRunsBeforeStop} runs (${successfulRuns} succeeded, ${failedRuns} failed) ===`,
          toastMessage: `无限自动运行已停止：成功 ${successfulRuns} 次，失败 ${failedRuns} 次`,
        };
      }
      return {
        phase: 'stopped',
        message: `=== Stopped after ${completedRunsBeforeStop}/${totalRuns} runs (${successfulRuns} succeeded, ${failedRuns} failed) ===`,
        toastMessage: `自动运行已停止：成功 ${successfulRuns} 次，失败 ${failedRuns} 次`,
      };
    }

    return {
      phase: 'complete',
      message: `=== Auto run finished: ${successfulRuns} succeeded, ${failedRuns} failed, ${totalRuns} total ===`,
      toastMessage: `自动运行完成：成功 ${successfulRuns} 次，失败 ${failedRuns} 次`,
    };
  }

  return {
    buildAutoRunStatusPayload,
    buildAutoRunFailureRecord,
    formatAutoRunLabel,
    shouldStartNextInfiniteRunAfterManualFlow,
    shouldContinueAutoRunAfterError,
    summarizeAutoRunResult,
  };
});
