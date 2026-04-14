const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAutoRunStatusPayload,
  buildAutoRunFailureRecord,
  formatAutoRunLabel,
  shouldStartNextInfiniteRunAfterManualFlow,
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
