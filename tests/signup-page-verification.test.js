const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AuthFatalErrors = require('../shared/auth-fatal-errors.js');

function createContext({
  href = 'https://auth.openai.com/email-verification',
  bodyText = '',
  waitForElementImpl,
  querySelectorImpl,
  querySelectorAllImpl,
  reportCompleteImpl,
} = {}) {
  const listeners = [];
  const errors = [];
  const completions = [];

  class StubEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const context = {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    location: { href },
    document: {
      body: { innerText: bodyText },
      documentElement: {},
      querySelector(selector) {
        return querySelectorImpl ? querySelectorImpl(selector) : null;
      },
      querySelectorAll(selector) {
        return querySelectorAllImpl ? querySelectorAllImpl(selector) : [];
      },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
        sendMessage() {
          return Promise.resolve({ ok: true });
        },
      },
    },
    VerificationCode: {
      isVerificationCodeRejectedText() {
        return false;
      },
      isVerificationRetryStateText(text) {
        return /retry/i.test(text);
      },
    },
    PhoneVerification: {
      isPhoneVerificationRequiredText() {
        return false;
      },
      getPhoneVerificationBlockedMessage(step) {
        return `Step ${step} blocked: phone verification is required on the auth page.`;
      },
    },
    AuthFatalErrors: {
      isAuthFatalErrorText() {
        return false;
      },
      isUnsupportedCountryRegionTerritoryText() {
        return false;
      },
      getUnsupportedCountryRegionTerritoryMessage(step) {
        return `Step ${step} blocked: unsupported country or region.`;
      },
    },
    UnsupportedEmail: {
      isUnsupportedEmailText() {
        return false;
      },
      isUnsupportedEmailBlockingStep() {
        return false;
      },
      getUnsupportedEmailBlockedMessage(step) {
        return `Step ${step} blocked`;
      },
    },
    MutationObserver: class {
      disconnect() {}
      observe() {}
    },
    Event: StubEvent,
    MouseEvent: StubEvent,
    KeyboardEvent: StubEvent,
    InputEvent: StubEvent,
    setTimeout,
    clearTimeout,
    Date,
    getComputedStyle() {
      return {
        display: 'block',
        visibility: 'visible',
        opacity: '1',
      };
    },
    resetStopState() {},
    isStopError() {
      return false;
    },
    log() {},
    reportComplete(step, payload) {
      completions.push({ step, payload });
      if (typeof reportCompleteImpl === 'function') {
        reportCompleteImpl(step, payload);
      }
    },
    reportError(step, message) {
      errors.push({ step, message });
    },
    throwIfStopped() {},
    sleep() {
      return Promise.resolve();
    },
    humanPause() {
      return Promise.resolve();
    },
    simulateClick() {},
    fillInput() {},
    waitForElement(selector) {
      if (waitForElementImpl) {
        return waitForElementImpl(selector);
      }
      return Promise.reject(new Error('missing'));
    },
    waitForElementByText() {
      return Promise.reject(new Error('missing'));
    },
    isElementVisible() {
      return true;
    },
  };

  context.window = context;
  context.top = context;
  context.__listeners = listeners;
  context.__errors = errors;
  context.__completions = completions;
  return context;
}

function loadSignupPage(context) {
  const scriptPath = path.join(__dirname, '..', 'content', 'signup-page.js');
  const code = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });
}

test('step 7 fails the round when email verification page has retry text but no code input', async () => {
  const context = createContext({
    bodyText: 'Something went wrong. Please retry.',
  });
  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'FILL_CODE', step: 7, payload: { code: '123456' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.match(
    response?.error || '',
    /retry state before the code input appeared/i
  );
  assert.deepEqual(context.__errors, [
    {
      step: 7,
      message: response.error,
    },
  ]);
});

test('step 2 stops immediately and asks to change node when oauth page shows unsupported country or region', async () => {
  const context = createContext({
    href: 'https://auth.openai.com/api/oauth/authorize?client_id=test-client',
    bodyText: JSON.stringify({
      error: {
        code: 'unsupported_country_region_territory',
        message: 'Country, region, or territory not supported',
        param: null,
        type: 'request_forbidden',
      },
    }),
  });
  context.AuthFatalErrors = AuthFatalErrors;
  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 2, payload: {} },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(
    response?.error,
    'Step 2 blocked: OpenAI does not support the current country, region, or territory. Please change node and retry.'
  );
  assert.deepEqual(context.__errors, [
    {
      step: 2,
      message: response.error,
    },
  ]);
  assert.deepEqual(context.__completions, []);
});

test('step 3 reports an auth timeout page instead of a missing email field when the oauth session expired', async () => {
  const context = createContext({
    href: 'https://auth.openai.com/u/signup/identifier',
    bodyText: '糟糕，出错了！ Operation timed out',
  });
  context.AuthFatalErrors = {
    ...AuthFatalErrors,
    isAuthFatalErrorText: AuthFatalErrors.isAuthFatalErrorText,
  };
  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 3, payload: { email: 'demo@example.com', password: 'secret-pass' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(
    response?.error,
    'Step 3 blocked: OpenAI auth page timed out before credentials could be submitted. Refresh the VPS OAuth link and retry with the same email and password.'
  );
  assert.deepEqual(context.__completions, []);
  assert.deepEqual(context.__errors, [
    {
      step: 3,
      message: response.error,
    },
  ]);
});

test('step 7 does not treat a post-submit retry page as accepted when the code input disappears', async () => {
  const state = {
    bodyText: 'Enter the 6-digit code',
    hideInputsAfterSubmit: false,
  };
  const submitButton = {};
  const codeInput = {};

  const context = createContext({
    bodyText: state.bodyText,
    waitForElementImpl(selector) {
      if (/input/.test(selector)) {
        return Promise.resolve(codeInput);
      }
      return Promise.reject(new Error('missing'));
    },
    querySelectorImpl(selector) {
      if (selector === 'button[type="submit"]') {
        return submitButton;
      }
      return null;
    },
    querySelectorAllImpl(selector) {
      if (state.hideInputsAfterSubmit) {
        return [];
      }
      if (selector.includes('input')) {
        return [{}];
      }
      return [];
    },
  });
  context.fillInput = () => {};
  context.simulateClick = () => {
    state.bodyText = 'Something went wrong. Please retry.';
    context.document.body.innerText = state.bodyText;
    state.hideInputsAfterSubmit = true;
  };

  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'FILL_CODE', step: 7, payload: { code: '123456' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.match(
    response?.error || '',
    /retry state after submitting the verification code/i
  );
});

test('step 6 fails instead of completing when the login page shows incorrect email or password', async () => {
  const state = {
    bodyText: '输入密码',
    passwordVisible: true,
    submitCount: 0,
  };

  const createVisibleElement = () => ({
    getBoundingClientRect() {
      return { width: 120, height: 40 };
    },
  });

  const emailInput = createVisibleElement();
  const passwordInput = createVisibleElement();
  const submitButton = createVisibleElement();

  const context = createContext({
    href: 'https://auth.openai.com/u/login/password',
    bodyText: state.bodyText,
    waitForElementImpl(selector) {
      if (selector.includes('type="email"') || selector.includes('name="email"')) {
        return Promise.resolve(emailInput);
      }
      return Promise.reject(new Error(`missing: ${selector}`));
    },
    querySelectorImpl(selector) {
      if (selector === 'button[type="submit"]') {
        return submitButton;
      }
      return null;
    },
    querySelectorAllImpl(selector) {
      if (selector === 'input[type="password"]' && state.passwordVisible) {
        return [passwordInput];
      }
      return [];
    },
  });

  context.fillInput = () => {};
  context.simulateClick = () => {
    state.submitCount += 1;
    if (state.submitCount === 2) {
      state.bodyText = 'Incorrect email address or password';
      context.document.body.innerText = state.bodyText;
    }
  };

  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 6, payload: { email: 'demo@example.com', password: 'wrong-pass' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 3000);
  });

  assert.match(response?.error || '', /incorrect email address or password/i);
  assert.deepEqual(context.__completions, []);
  assert.deepEqual(context.__errors, [
    {
      step: 6,
      message: response.error,
    },
  ]);
});

test('step 6 reports the latest page oauth url when it differs from the saved panel value', async () => {
  const state = {
    bodyText: '输入密码',
    passwordVisible: false,
  };

  const emailInput = {
    getBoundingClientRect() {
      return { width: 120, height: 40 };
    },
  };

  const oauthAnchor = {
    href: 'https://auth.openai.com/api/oauth/authorize?client_id=page-newer',
    textContent: 'Continue to OpenAI',
    getBoundingClientRect() {
      return { width: 160, height: 30 };
    },
  };

  const runtimeMessages = [];

  const context = createContext({
    href: 'https://auth.openai.com/u/login/identifier',
    bodyText: state.bodyText,
    waitForElementImpl(selector) {
      if (selector.includes('type="email"') || selector.includes('name="email"')) {
        return Promise.resolve(emailInput);
      }
      return Promise.reject(new Error(`missing: ${selector}`));
    },
    querySelectorImpl(selector) {
      if (selector === 'button[type="submit"]') {
        return null;
      }
      if (selector === 'a[href*="/api/oauth/authorize"]') {
        return oauthAnchor;
      }
      return null;
    },
    querySelectorAllImpl(selector) {
      if (selector === 'input[type="password"]' && state.passwordVisible) {
        return [{}];
      }
      if (selector === 'a[href*="/api/oauth/authorize"]') {
        return [oauthAnchor];
      }
      return [];
    },
  });

  context.chrome.runtime.sendMessage = (message) => {
    runtimeMessages.push(message);
    if (message?.type === 'GET_STATE') {
      return Promise.resolve({ oauthUrl: 'https://auth.openai.com/api/oauth/authorize?client_id=panel-old' });
    }
    return Promise.resolve({ ok: true });
  };
  context.fillInput = () => {};
  context.simulateClick = () => {};

  loadSignupPage(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected signup-page to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 6, payload: { email: 'demo@example.com', password: 'secret-pass' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 3000);
  });

  assert.equal(response?.ok, true);
  assert.deepEqual(context.__errors, []);
  assert.equal(context.__completions.length, 1);
  assert.equal(context.__completions[0].step, 6);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.__completions[0].payload)),
    {
      needsOTP: true,
      oauthUrl: 'https://auth.openai.com/api/oauth/authorize?client_id=page-newer',
    }
  );
  assert.ok(
    runtimeMessages.some((message) => message?.type === 'GET_STATE'),
    'expected step 6 to read the saved oauth url before deciding whether to override it'
  );
});
