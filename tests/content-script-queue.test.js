const test = require('node:test');
const assert = require('node:assert/strict');

const { getContentScriptQueueTimeout, queueCommandForReinjection } = require('../shared/content-script-queue.js');

test('getContentScriptQueueTimeout disables the ready timeout for TMailor mailbox generation', () => {
  assert.equal(getContentScriptQueueTimeout('tmailor-mail', 'FETCH_TMAILOR_EMAIL'), 0);
});

test('getContentScriptQueueTimeout disables the ready timeout for TMailor inbox polling', () => {
  assert.equal(getContentScriptQueueTimeout('tmailor-mail', 'POLL_EMAIL'), 0);
});

test('getContentScriptQueueTimeout keeps the default timeout for other content scripts', () => {
  assert.equal(getContentScriptQueueTimeout('signup-page', 'EXECUTE_STEP'), 15000);
  assert.equal(getContentScriptQueueTimeout('duck-mail', 'FETCH_DUCK_EMAIL'), 15000);
});

test('queueCommandForReinjection queues before reinjecting and flushes immediately when reinjection is already ready', async () => {
  const events = [];
  const result = await queueCommandForReinjection({
    source: 'tmailor-mail',
    message: { type: 'POLL_EMAIL' },
    timeout: 0,
    queueCommand(source, message, timeout) {
      events.push(['queue', source, message.type, timeout]);
      return Promise.resolve('queued-result');
    },
    async reinject() {
      events.push(['reinject']);
      return 88;
    },
    flushCommand(source, tabId) {
      events.push(['flush', source, tabId]);
    },
  });

  assert.equal(result, 'queued-result');
  assert.deepEqual(events, [
    ['queue', 'tmailor-mail', 'POLL_EMAIL', 0],
    ['reinject'],
    ['flush', 'tmailor-mail', 88],
  ]);
});

test('queueCommandForReinjection leaves the command queued when reinjection still needs a later ready signal', async () => {
  const events = [];
  const result = await queueCommandForReinjection({
    source: 'tmailor-mail',
    message: { type: 'POLL_EMAIL' },
    timeout: 0,
    queueCommand() {
      events.push(['queue']);
      return Promise.resolve('queued-result');
    },
    async reinject() {
      events.push(['reinject']);
      return null;
    },
    flushCommand() {
      events.push(['flush']);
    },
  });

  assert.equal(result, 'queued-result');
  assert.deepEqual(events, [
    ['queue'],
    ['reinject'],
  ]);
});
