const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS,
  buildAutoRunLogSilenceErrorMessage,
  buildAutoRunStatusPayload,
  buildAutoRunFailureRecord,
  formatAutoRunLabel,
  getAutoRunPauseWatchdogAlarmName,
  getAutoRunPauseWatchdogDeadline,
  shouldContinueAutoRunAfterWatchdog,
  shouldStartNextInfiniteRunAfterManualFlow,
  shouldUsePersistentAutoRunPauseWatchdog,
  shouldSuspendAutoRunWatchdogDuringPause,
  shouldContinueAutoRunAfterError,
  summarizeAutoRunResult,
} = require('../shared/auto-run.js');

test('auto run continues to next round after a normal run failure', () => {
  assert.equal(
    shouldContinueAutoRunAfterError(new Error('Step 4 failed')),
    true
  );
  assert.equal(
    shouldContinueAutoRunAfterError(new Error('Step 5 failed: Auth fatal error page detected after profile submit.')),
    true
  );
  assert.equal(
    shouldContinueAutoRunAfterError(new Error('Step 5 failed: unsupported_email domain blocked and added to blacklist.')),
    true
  );
});

test('auto run stops on stop and manual-handoff sentinel errors', () => {
  assert.equal(
    shouldContinueAutoRunAfterError(new Error('Flow stopped by user.')),
    false
  );
  assert.equal(
    shouldContinueAutoRunAfterError(new Error('Auto run handed off to manual continuation.')),
    false
  );
});

test('watchdog failures keep infinite and non-final runs moving to the next round', () => {
  assert.equal(
    shouldContinueAutoRunAfterWatchdog({ currentRun: 4, totalRuns: Number.POSITIVE_INFINITY, infiniteMode: true }),
    true
  );
  assert.equal(
    shouldContinueAutoRunAfterWatchdog({ currentRun: 2, totalRuns: 5, infiniteMode: false }),
    true
  );
  assert.equal(
    shouldContinueAutoRunAfterWatchdog({ currentRun: 5, totalRuns: 5, infiniteMode: false }),
    false
  );
});

test('manual rounds restart the next loop only when infinite mode is enabled and stop was not requested', () => {
  assert.equal(
    shouldStartNextInfiniteRunAfterManualFlow({ autoRunInfinite: true, stopRequested: false }),
    true
  );
  assert.equal(
    shouldStartNextInfiniteRunAfterManualFlow({ autoRunInfinite: false, stopRequested: false }),
    false
  );
  assert.equal(
    shouldStartNextInfiniteRunAfterManualFlow({ autoRunInfinite: true, stopRequested: true }),
    false
  );
});

test('watchdog pause policy keeps email handoff timeouts active in infinite mode only', () => {
  assert.equal(
    shouldSuspendAutoRunWatchdogDuringPause({ phase: 'waiting_rotation', infiniteMode: true }),
    true
  );
  assert.equal(
    shouldSuspendAutoRunWatchdogDuringPause({ phase: 'waiting_email', infiniteMode: false }),
    true
  );
  assert.equal(
    shouldSuspendAutoRunWatchdogDuringPause({ phase: 'waiting_email', infiniteMode: true }),
    false
  );
});

test('infinite email handoff pauses use a persistent watchdog alarm', () => {
  assert.equal(
    shouldUsePersistentAutoRunPauseWatchdog({ phase: 'waiting_email', infiniteMode: true }),
    true
  );
  assert.equal(
    shouldUsePersistentAutoRunPauseWatchdog({ phase: 'waiting_email', infiniteMode: false }),
    false
  );
  assert.equal(
    shouldUsePersistentAutoRunPauseWatchdog({ phase: 'waiting_rotation', infiniteMode: true }),
    false
  );
  assert.equal(
    getAutoRunPauseWatchdogAlarmName(),
    'infinitoai-auto-run-paused-watchdog'
  );
  assert.equal(
    getAutoRunPauseWatchdogDeadline({
      timeoutMs: DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS,
      now: 1710000000000,
    }),
    1710000060000
  );
});

test('auto run summary reports mixed success and failure correctly', () => {
  assert.deepEqual(
    summarizeAutoRunResult({
      totalRuns: 5,
      successfulRuns: 3,
      failedRuns: 2,
      lastAttemptedRun: 5,
      stopRequested: false,
      handedOffToManual: false,
    }),
    {
      phase: 'complete',
      message: '=== Auto run finished: 3 succeeded, 2 failed, 5 total ===',
      toastMessage: '自动运行完成：成功 3 次，失败 2 次',
    }
  );
});

test('auto run stop summary keeps success and failure statistics', () => {
  assert.deepEqual(
    summarizeAutoRunResult({
      totalRuns: 5,
      successfulRuns: 2,
      failedRuns: 1,
      lastAttemptedRun: 4,
      stopRequested: true,
      handedOffToManual: false,
    }),
    {
      phase: 'stopped',
      message: '=== Stopped after 3/5 runs (2 succeeded, 1 failed) ===',
      toastMessage: '自动运行已停止：成功 2 次，失败 1 次',
    }
  );
});

test('auto run stop summary prefers current-session counts over persisted totals when provided', () => {
  assert.deepEqual(
    summarizeAutoRunResult({
      totalRuns: Number.POSITIVE_INFINITY,
      successfulRuns: 24,
      failedRuns: 0,
      sessionSuccessfulRuns: 1,
      sessionFailedRuns: 0,
      lastAttemptedRun: 2,
      stopRequested: true,
      handedOffToManual: false,
      infiniteMode: true,
    }),
    {
      phase: 'stopped',
      message: '=== Infinite auto run stopped after 1 runs (1 succeeded, 0 failed) ===',
      toastMessage: '无限自动运行已停止：成功 1 次，失败 0 次',
    }
  );
});

test('infinite auto run stop summary reports completed rounds before stop', () => {
  assert.deepEqual(
    summarizeAutoRunResult({
      totalRuns: Number.POSITIVE_INFINITY,
      successfulRuns: 4,
      failedRuns: 2,
      lastAttemptedRun: 7,
      stopRequested: true,
      handedOffToManual: false,
      infiniteMode: true,
    }),
    {
      phase: 'stopped',
      message: '=== Infinite auto run stopped after 6 runs (4 succeeded, 2 failed) ===',
      toastMessage: '无限自动运行已停止：成功 4 次，失败 2 次',
    }
  );
});

test('buildAutoRunStatusPayload always includes sanitized success and failure counters', () => {
  assert.deepEqual(
    buildAutoRunStatusPayload({
      phase: 'running',
      currentRun: 2,
      totalRuns: 5,
      infiniteMode: false,
      successfulRuns: '3',
      failedRuns: -1,
      totalSuccessfulDurationMs: '45000',
      recentSuccessDurationsMs: ['1000', '2000', 'bad'],
      recentSuccessEntries: [
        { durationMs: '1000', mode: 'api' },
        { durationMs: 'bad', mode: 'weird' },
        { durationMs: '2000', mode: 'simulated' },
      ],
    }),
    {
      phase: 'running',
      currentRun: 2,
      totalRuns: 5,
      infiniteMode: false,
      successfulRuns: 3,
      failedRuns: 0,
      totalSuccessfulDurationMs: 45000,
      recentSuccessDurationsMs: [1000, 2000],
      recentSuccessEntries: [
        { durationMs: 1000, mode: 'api' },
        { durationMs: 2000, mode: 'simulated' },
      ],
      failureBuckets: [],
      summaryMessage: '',
      summaryToast: '',
      waitUntilTimestamp: null,
      waitReason: '',
    }
  );
});

test('buildAutoRunStatusPayload keeps wait metadata for timed auto-run pauses', () => {
  assert.deepEqual(
    buildAutoRunStatusPayload({
      phase: 'waiting_rotation',
      currentRun: 8,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      successfulRuns: 6,
      failedRuns: 1,
      totalSuccessfulDurationMs: 123456,
      recentSuccessDurationsMs: [61000, 62456],
      waitUntilTimestamp: 1710000000000,
      waitReason: '33mail limit window',
    }),
    {
      phase: 'waiting_rotation',
      currentRun: 8,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      successfulRuns: 6,
      failedRuns: 1,
      totalSuccessfulDurationMs: 123456,
      recentSuccessDurationsMs: [61000, 62456],
      recentSuccessEntries: [],
      failureBuckets: [],
      summaryMessage: '',
      summaryToast: '',
      waitUntilTimestamp: 1710000000000,
      waitReason: '33mail limit window',
    }
  );
});

test('buildAutoRunStatusPayload preserves grouped failure stats for sidepanel rendering', () => {
  assert.deepEqual(
    buildAutoRunStatusPayload({
      phase: 'waiting_email',
      currentRun: 2,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      successfulRuns: 0,
      failedRuns: 1,
      totalSuccessfulDurationMs: 0,
      recentSuccessDurationsMs: [],
      failureBuckets: [
        {
          key: 'step-4::mail',
          step: 4,
          reason: 'No matching verification email found on TMailor after N attempts',
          count: 1,
          lastRunLabel: '1/∞',
          lastSeenAt: 1710000000000,
          recentLogs: ['Run 1/∞ failed: Step 4 failed: No matching verification email found on TMailor after 20 attempts.'],
        },
      ],
    }),
    {
      phase: 'waiting_email',
      currentRun: 2,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      successfulRuns: 0,
      failedRuns: 1,
      totalSuccessfulDurationMs: 0,
      recentSuccessDurationsMs: [],
      recentSuccessEntries: [],
      failureBuckets: [
        {
          key: 'step-4::mail',
          step: 4,
          reason: 'No matching verification email found on TMailor after N attempts',
          count: 1,
          lastRunLabel: '1/∞',
          lastSeenAt: 1710000000000,
          recentLogs: ['Run 1/∞ failed: Step 4 failed: No matching verification email found on TMailor after 20 attempts.'],
        },
      ],
      summaryMessage: '',
      summaryToast: '',
      waitUntilTimestamp: null,
      waitReason: '',
    }
  );
});

test('formatAutoRunLabel renders finite and infinite run labels', () => {
  assert.equal(
    formatAutoRunLabel({ currentRun: 3, totalRuns: 5, infiniteMode: false }),
    '3/5'
  );
  assert.equal(
    formatAutoRunLabel({ currentRun: 7, totalRuns: Number.POSITIVE_INFINITY, infiniteMode: true }),
    '7/∞'
  );
});

test('buildAutoRunFailureRecord builds a normalized failure entry for grouped stats', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'Step 7 failed: Could not find verification code input.',
      currentRun: 4,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 7,
      timestamp: 123456,
    }),
    {
      step: 7,
      errorMessage: 'Step 7 failed: Could not find verification code input.',
      logMessage: 'Run 4/∞ failed: Step 7 failed: Could not find verification code input.',
      runLabel: '4/∞',
      timestamp: 123456,
    }
  );
});

test('buildAutoRunFailureRecord falls back to the current step when the error was recorded as flow-level', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
      currentRun: 3,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 0,
      currentStep: 4,
      timestamp: 789000,
    }),
    {
      step: 4,
      errorMessage: 'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
      logMessage: 'Run 3/∞ failed: The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
      runLabel: '3/∞',
      timestamp: 789000,
    }
  );
});

test('buildAutoRunFailureRecord prefers the current run step when the UI current step was already cleared', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'Content script on tmailor-mail did not respond in 25s. Try refreshing the tab and retry.',
      currentRun: 6,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 0,
      currentRunStep: 7,
      currentStep: 0,
      timestamp: 999111,
    }),
    {
      step: 7,
      errorMessage: 'Content script on tmailor-mail did not respond in 25s. Try refreshing the tab and retry.',
      logMessage: 'Run 6/∞ failed: Content script on tmailor-mail did not respond in 25s. Try refreshing the tab and retry.',
      runLabel: '6/∞',
      timestamp: 999111,
    }
  );
});

test('buildAutoRunFailureRecord appends the current email suffix for phone verification blockers in stats logs', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: '第 7 步被拦截：当前 auth 页面要求手机号验证，请切换节点后重试。',
      currentRun: 9,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 7,
      currentEmail: 'demo@mikfarm.com',
      timestamp: 222333,
    }),
    {
      step: 7,
      errorMessage: '第 7 步被拦截：当前 auth 页面要求手机号验证（邮箱域名：mikfarm.com），请切换节点后重试。',
      logMessage: 'Run 9/∞ failed: 第 7 步被拦截：当前 auth 页面要求手机号验证（邮箱域名：mikfarm.com），请切换节点后重试。',
      runLabel: '9/∞',
      timestamp: 222333,
    }
  );
});

test('buildAutoRunFailureRecord appends the current email suffix for missing-name-input blockers in stats logs', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'Step 5 failed: Could not find name input. URL: https://auth.openai.com/u/signup/continue',
      currentRun: 5,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 5,
      currentEmail: 'demo@fresh-domain.com',
      timestamp: 333444,
    }),
    {
      step: 5,
      errorMessage: 'Step 5 failed: Could not find name input (email domain: fresh-domain.com). URL: https://auth.openai.com/u/signup/continue',
      logMessage: 'Run 5/∞ failed: Step 5 failed: Could not find name input (email domain: fresh-domain.com). URL: https://auth.openai.com/u/signup/continue',
      runLabel: '5/∞',
      timestamp: 333444,
    }
  );
});

test('buildAutoRunFailureRecord makes unsupported-email blockers explicit in logs and toasts', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'Step 5 blocked: email domain is unsupported on the auth page.',
      currentRun: 8,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 5,
      currentEmail: 'demo@blocked-domain.com',
      timestamp: 444555,
    }),
    {
      step: 5,
      errorMessage: 'Step 5 blocked: email domain is unsupported on the auth page (email domain: blocked-domain.com). OpenAI rejected this mailbox domain after profile submit. Retry with a new mailbox/domain.',
      logMessage: 'Run 8/∞ failed: Step 5 blocked: email domain is unsupported on the auth page (email domain: blocked-domain.com). OpenAI rejected this mailbox domain after profile submit. Retry with a new mailbox/domain.',
      runLabel: '8/∞',
      timestamp: 444555,
    }
  );
});

test('buildAutoRunLogSilenceErrorMessage describes the timeout and the last visible log', () => {
  assert.equal(
    buildAutoRunLogSilenceErrorMessage({
      timeoutMs: DEFAULT_AUTO_RUN_LOG_SILENCE_TIMEOUT_MS,
      lastLogMessage: 'Step 8: Debugger click dispatched, waiting for redirect...',
      lastLogLevel: 'info',
      now: 1710000060000,
      lastLogTimestamp: 1710000000000,
    }),
    'Auto run watchdog detected 60s without new logs. Last log 60s ago: [info] Step 8: Debugger click dispatched, waiting for redirect...'
  );
});

test('buildAutoRunFailureRecord keeps the failure reason stable and appends the last log context only to the display log', () => {
  assert.deepEqual(
    buildAutoRunFailureRecord({
      errorMessage: 'Auto run watchdog detected 60s without new logs.',
      currentRun: 12,
      totalRuns: Number.POSITIVE_INFINITY,
      infiniteMode: true,
      step: 8,
      lastLogMessage: 'Step 8: Debugger click dispatched, waiting for redirect...',
      lastLogLevel: 'info',
      timestamp: 456789,
    }),
    {
      step: 8,
      errorMessage: 'Auto run watchdog detected 60s without new logs.',
      logMessage: 'Run 12/∞ failed: Auto run watchdog detected 60s without new logs. Last log before stall: [info] Step 8: Debugger click dispatched, waiting for redirect...',
      runLabel: '12/∞',
      timestamp: 456789,
      lastLogMessage: 'Step 8: Debugger click dispatched, waiting for redirect...',
      lastLogLevel: 'info',
    }
  );
});
