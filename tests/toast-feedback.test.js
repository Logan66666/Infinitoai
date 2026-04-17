const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildToastKey,
  canonicalizeToastMessage,
  getToastDuration,
  shouldSuppressToastMessage,
  TOAST_DURATIONS,
} = require('../shared/toast-feedback.js');

test('canonicalizeToastMessage removes repeated step and run failure prefixes', () => {
  assert.equal(
    canonicalizeToastMessage('[signup-page] Step 7 failed: Could not find verification code input.'),
    '未找到验证码输入框。'
  );

  assert.equal(
    canonicalizeToastMessage('Run 1/5 failed: Could not find verification code input.'),
    '未找到验证码输入框。'
  );
});

test('canonicalizeToastMessage keeps unrelated messages intact', () => {
  assert.equal(
    canonicalizeToastMessage('验证码错误，请返回邮箱刷新'),
    '验证码错误，请返回邮箱刷新'
  );
});

test('canonicalizeToastMessage strips inline debug suffixes from Chinese-friendly warn and error copy', () => {
  assert.equal(
    canonicalizeToastMessage('当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。 | 调试：URL=unknown; reachable=false'),
    '当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。'
  );

  assert.equal(
    canonicalizeToastMessage('当前邮箱域名暂不受支持，已加入黑名单，请切换新邮箱后重试。 | 调试：email domain is unsupported on the auth page (email domain: beelsil.com)'),
    '当前邮箱域名暂不受支持，已加入黑名单，请切换新邮箱后重试。'
  );
});

test('getToastDuration uses type defaults unless overridden', () => {
  assert.equal(getToastDuration('error'), TOAST_DURATIONS.error);
  assert.equal(getToastDuration('warn'), TOAST_DURATIONS.warn);
  assert.equal(getToastDuration('success', 3200), 3200);
});

test('buildToastKey merges repeated step error variants into one key', () => {
  assert.equal(
    buildToastKey('[signup-page] Step 7 failed: Could not find verification code input.', 'error'),
    buildToastKey('Run 1/5 failed: Could not find verification code input.', 'error')
  );
});

test('buildToastKey merges phone-verification and add-phone variants into one key', () => {
  assert.equal(
    buildToastKey('Step 7 blocked: auth page requires phone verification before the verification email step.', 'error'),
    buildToastKey('Run 1/∞ failed: 第 7 步被拦截：当前 auth 页面要求手机号验证，请切换节点后重试。', 'error')
  );
  assert.equal(
    canonicalizeToastMessage('Step 7 failed: Verification form stayed visible after submit attempts. URL: https://auth.openai.com/add-phone'),
    '当前 auth 页面要求手机号验证，请切换节点后重试。'
  );
});

test('buildToastKey keeps debug-suffixed Chinese warnings deduplicated', () => {
  assert.equal(
    buildToastKey('当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。 | 调试：URL=unknown; reachable=false', 'warn'),
    buildToastKey('当前 auth 页面暂时无法访问，先等待验证页恢复响应后再查收邮件。 | 调试：URL=https://auth.openai.com/email-verification; reachable=false', 'warn')
  );
});

test('shouldSuppressToastMessage hides recoverable BFCache disconnect errors', () => {
  assert.equal(
    shouldSuppressToastMessage(
      'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
      'error'
    ),
    true
  );
  assert.equal(
    shouldSuppressToastMessage(
      'Could not establish connection. Receiving end does not exist.',
      'error'
    ),
    true
  );
});

test('shouldSuppressToastMessage hides the manual stop progress toast', () => {
  assert.equal(
    shouldSuppressToastMessage('Stopping...', 'warn'),
    true
  );
});

test('shouldSuppressToastMessage keeps normal errors visible', () => {
  assert.equal(
    shouldSuppressToastMessage('No matching verification email found after 60s', 'error'),
    false
  );
});
