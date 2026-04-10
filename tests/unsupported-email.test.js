const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getUnsupportedEmailBlockedMessage,
  isUnsupportedEmailBlockingStep,
  isUnsupportedEmailText,
} = require('../shared/unsupported-email.js');

test('detects unsupported email copy in Chinese and English', () => {
  assert.equal(isUnsupportedEmailText('该邮箱不受支持，请更换邮箱地址'), true);
  assert.equal(isUnsupportedEmailText('This email address is unsupported'), true);
  assert.equal(isUnsupportedEmailText('unsupported email domain'), true);
  assert.equal(isUnsupportedEmailText('验证过程中出错 (unsupported_email)。请重试。'), true);
});

test('ignores unrelated auth text for unsupported email detector', () => {
  assert.equal(isUnsupportedEmailText('电话号码是必填项'), false);
  assert.equal(isUnsupportedEmailText('Your ChatGPT code is 281878'), false);
});

test('unsupported email only blocks the post-profile step', () => {
  assert.equal(isUnsupportedEmailBlockingStep(4), false);
  assert.equal(isUnsupportedEmailBlockingStep(5), true);
  assert.equal(isUnsupportedEmailBlockingStep(7), false);
});

test('step 5 unsupported email message is explicit', () => {
  assert.equal(
    getUnsupportedEmailBlockedMessage(5),
    'Step 5 blocked: email domain is unsupported on the auth page.'
  );
});
