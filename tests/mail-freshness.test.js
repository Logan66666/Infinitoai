const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_VERIFICATION_EMAIL_AGE_MS,
  getFreshMailCutoff,
  isMailFresh,
  parseMailTimestamp,
} = require('../shared/mail-freshness.js');

test('parses today hh:mm timestamps', () => {
  const now = new Date('2026-04-08T16:32:00+08:00').getTime();

  assert.equal(
    parseMailTimestamp('16:29', { now }),
    new Date('2026-04-08T16:29:00+08:00').getTime()
  );
});

test('parses relative minute timestamps', () => {
  const now = new Date('2026-04-08T16:32:00+08:00').getTime();

  assert.equal(
    parseMailTimestamp('3分钟前', { now }),
    new Date('2026-04-08T16:29:00+08:00').getTime()
  );
  assert.equal(
    parseMailTimestamp('just now', { now }),
    now
  );
});

test('fresh cutoff honors both flow start and five-minute expiration', () => {
  const now = new Date('2026-04-08T16:32:00+08:00').getTime();
  const filterAfterTimestamp = new Date('2026-04-08T16:30:30+08:00').getTime();

  assert.equal(
    getFreshMailCutoff({ now, filterAfterTimestamp }),
    new Date('2026-04-08T16:29:30+08:00').getTime()
  );
});

test('rejects emails older than five minutes', () => {
  const now = new Date('2026-04-08T16:32:00+08:00').getTime();
  const oldMail = new Date(now - MAX_VERIFICATION_EMAIL_AGE_MS - 1000).getTime();
  const freshMail = new Date(now - MAX_VERIFICATION_EMAIL_AGE_MS + 1000).getTime();

  assert.equal(isMailFresh(oldMail, { now }), false);
  assert.equal(isMailFresh(freshMail, { now }), true);
});
