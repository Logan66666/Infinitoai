const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAutoRunStats,
  recordAutoRunFailure,
  recordAutoRunSuccess,
  resetAutoRunFailureStats,
  summarizeAutoRunFailureBuckets,
} = require('../shared/auto-run-failure-stats.js');

test('recordAutoRunFailure groups failures by step and normalized reason while keeping recent log samples', () => {
  const next = recordAutoRunFailure(
    { successfulRuns: 2, failedRuns: 1 },
    {
      step: 7,
      errorMessage: 'Step 7 failed: Could not find verification code input. URL: https://auth.openai.com/email-verification',
      logMessage: 'Run 3 failed: Step 7 failed: Could not find verification code input. URL: https://auth.openai.com/email-verification',
      runLabel: '3/∞',
      timestamp: 12345,
    }
  );

  assert.equal(next.failedRuns, 2);
  assert.equal(next.failureBuckets.length, 1);
  assert.deepEqual(next.failureBuckets[0], {
    key: 'step-7::could not find verification code input',
    step: 7,
    reason: 'Could not find verification code input',
    count: 1,
    lastRunLabel: '3/∞',
    lastSeenAt: 12345,
    recentLogs: [
      'Run 3 failed: Step 7 failed: Could not find verification code input. URL: https://auth.openai.com/email-verification',
    ],
  });
});

test('recordAutoRunFailure increments an existing bucket and keeps only the newest 20 log samples', () => {
  let stats = normalizeAutoRunStats({
    successfulRuns: 0,
    failedRuns: 0,
    failureBuckets: [],
  });

  for (let index = 1; index <= 25; index += 1) {
    stats = recordAutoRunFailure(stats, {
      step: 4,
      errorMessage: `Step 4 failed: No matching verification email found on TMailor after ${index} attempts.`,
      logMessage: `Run ${index} failed: Step 4 failed: No matching verification email found on TMailor after ${index} attempts.`,
      runLabel: `${index}/∞`,
      timestamp: index,
    });
  }

  assert.equal(stats.failedRuns, 25);
  assert.equal(stats.failureBuckets.length, 1);
  assert.equal(stats.failureBuckets[0].count, 25);
  assert.equal(stats.failureBuckets[0].recentLogs.length, 20);
  assert.deepEqual(stats.failureBuckets[0].recentLogs, Array.from(
    { length: 20 },
    (_, offset) => {
      const index = 25 - offset;
      return `Run ${index} failed: Step 4 failed: No matching verification email found on TMailor after ${index} attempts.`;
    }
  ));
});

test('recordAutoRunSuccess increments success count and accumulates successful duration', () => {
  const next = recordAutoRunSuccess(
    {
      successfulRuns: 2,
      failedRuns: 1,
      totalSuccessfulDurationMs: 8000,
      recentSuccessDurationsMs: [5000, 3000],
      recentSuccessEntries: [
        { durationMs: 5000, mode: 'simulated' },
        { durationMs: 3000, mode: 'api' },
      ],
      failureBuckets: [],
    },
    {
      durationMs: 3500,
      mode: 'api',
    }
  );

  assert.deepEqual(next, {
    successfulRuns: 3,
    failedRuns: 1,
    totalSuccessfulDurationMs: 11500,
    recentSuccessDurationsMs: [3500, 5000, 3000],
    recentSuccessEntries: [
      { durationMs: 3500, mode: 'api' },
      { durationMs: 5000, mode: 'simulated' },
      { durationMs: 3000, mode: 'api' },
    ],
    failureBuckets: [],
  });
});

test('normalizeAutoRunStats sanitizes total successful duration for legacy and malformed values', () => {
  assert.deepEqual(
    normalizeAutoRunStats({
      successfulRuns: '4',
      failedRuns: '2',
      totalSuccessfulDurationMs: '9123',
      recentSuccessDurationsMs: ['1000', -5, 'oops', 2500],
      recentSuccessEntries: [
        { durationMs: '1000', mode: 'api' },
        { durationMs: 'oops', mode: 'weird' },
        { durationMs: 2500, mode: 'simulated' },
      ],
      failureBuckets: [],
    }),
    {
      successfulRuns: 4,
      failedRuns: 2,
      totalSuccessfulDurationMs: 9123,
      recentSuccessDurationsMs: [1000, 2500],
      recentSuccessEntries: [
        { durationMs: 1000, mode: 'api' },
        { durationMs: 2500, mode: 'simulated' },
      ],
      failureBuckets: [],
    }
  );

  assert.equal(
    normalizeAutoRunStats({ totalSuccessfulDurationMs: -10 }).totalSuccessfulDurationMs,
    0
  );
  assert.deepEqual(
    normalizeAutoRunStats({ recentSuccessDurationsMs: Array.from({ length: 25 }, (_, index) => index + 1) }).recentSuccessDurationsMs,
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
  assert.equal(
    normalizeAutoRunStats({
      failureBuckets: [
        {
          key: 'step-4::mail',
          step: 4,
          reason: 'No matching verification email found',
          count: 25,
          lastRunLabel: '25/∞',
          lastSeenAt: 25,
          recentLogs: Array.from({ length: 25 }, (_, index) => `Run ${index + 1} failed`),
        },
      ],
    }).failureBuckets[0].recentLogs.length,
    20
  );
});

test('summarizeAutoRunFailureBuckets sorts the most frequent recent failure first', () => {
  const summary = summarizeAutoRunFailureBuckets({
    successfulRuns: 0,
    failedRuns: 4,
    failureBuckets: [
      {
        key: 'step-4::mail',
        step: 4,
        reason: 'No matching verification email found',
        count: 2,
        lastRunLabel: '4/∞',
        lastSeenAt: 400,
        recentLogs: ['mail-4', 'mail-3'],
      },
      {
        key: 'step-7::code',
        step: 7,
        reason: 'Could not find verification code input',
        count: 2,
        lastRunLabel: '2/∞',
        lastSeenAt: 200,
        recentLogs: ['code-2'],
      },
      {
        key: 'step-1::502',
        step: 1,
        reason: '502 bad gateway',
        count: 1,
        lastRunLabel: '1/∞',
        lastSeenAt: 100,
        recentLogs: ['502-1'],
      },
    ],
  });

  assert.equal(summary.length, 3);
  assert.equal(summary[0].step, 4);
  assert.equal(summary[1].step, 7);
  assert.equal(summary[2].step, 1);
});

test('resetAutoRunFailureStats clears only failure counters while preserving recent successes', () => {
  const next = resetAutoRunFailureStats({
    successfulRuns: 4,
    failedRuns: 3,
    totalSuccessfulDurationMs: 91234,
    recentSuccessDurationsMs: [35000, 28000],
    recentSuccessEntries: [
      { durationMs: 35000, mode: 'api' },
      { durationMs: 28000, mode: 'simulated' },
    ],
    failureBuckets: [
      {
        key: 'step-4::mail',
        step: 4,
        reason: 'No matching verification email found',
        count: 3,
        lastRunLabel: '8/∞',
        lastSeenAt: 12345,
        recentLogs: ['Run 8 failed'],
      },
    ],
  });

  assert.deepEqual(next, {
    successfulRuns: 4,
    failedRuns: 0,
    totalSuccessfulDurationMs: 91234,
    recentSuccessDurationsMs: [35000, 28000],
    recentSuccessEntries: [
      { durationMs: 35000, mode: 'api' },
      { durationMs: 28000, mode: 'simulated' },
    ],
    failureBuckets: [],
  });
});
