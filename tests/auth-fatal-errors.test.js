const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getUnsupportedCountryRegionTerritoryMessage,
  isAuthFatalErrorText,
  isUnsupportedCountryRegionTerritoryText,
} = require('../shared/auth-fatal-errors.js');

test('detects auth fatal error page copy', () => {
  assert.equal(isAuthFatalErrorText('糟糕，出错了！ 验证过程中出错 (max_check_attempts)。请重试。'), true);
  assert.equal(isAuthFatalErrorText('Oops, something went wrong during verification. Please try again.'), true);
  assert.equal(isAuthFatalErrorText('糟糕，出错了！ Operation timed out'), true);
});

test('does not flag normal verification and consent pages', () => {
  assert.equal(isAuthFatalErrorText('检查您的收件箱 输入我们刚刚向 xxx@duck.com 发送的验证码'), false);
  assert.equal(isAuthFatalErrorText('使用 ChatGPT 登录到 Codex 继续'), false);
});

test('detects unsupported country or region auth payloads and provides a node retry hint', () => {
  const payload = JSON.stringify({
    error: {
      code: 'unsupported_country_region_territory',
      message: 'Country, region, or territory not supported',
      param: null,
      type: 'request_forbidden',
    },
  });

  assert.equal(isUnsupportedCountryRegionTerritoryText(payload), true);
  assert.equal(isAuthFatalErrorText(payload), true);
  assert.equal(
    getUnsupportedCountryRegionTerritoryMessage(2),
    'Step 2 blocked: OpenAI does not support the current country, region, or territory. Please change node and retry.'
  );
});
