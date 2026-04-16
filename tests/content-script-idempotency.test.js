const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createBaseContext(extra = {}) {
  const listeners = [];
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
    location: { href: 'https://auth.openai.com/create-account' },
    document: {
      body: { innerText: '' },
      documentElement: {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
        sendMessage() {},
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
    Date,
    setTimeout,
    clearTimeout,
    ...extra,
  };

  context.window = context;
  context.top = context;
  context.__listeners = listeners;
  return context;
}

function runScriptTwice(relativePath, context) {
  const scriptPath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });
  vm.runInContext(code, context, { filename: scriptPath });
}

function runScripts(relativePaths, context) {
  vm.createContext(context);
  for (const relativePath of relativePaths) {
    const scriptPath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(code, context, { filename: scriptPath });
  }
}

test('utils content script can be evaluated twice safely', () => {
  const context = createBaseContext();

  assert.doesNotThrow(() => runScriptTwice('content/utils.js', context));
  assert.equal(context.__listeners.length, 1);
});

test('utils waits for the auth handler bundle before reporting signup-page ready', () => {
  const sentMessages = [];
  const context = createBaseContext({
    location: { href: 'https://platform.openai.com/login' },
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
        sendMessage(message) {
          sentMessages.push(message);
        },
      },
    },
  });

  assert.doesNotThrow(() => runScriptTwice('content/utils.js', context));
  assert.equal(
    sentMessages.some((message) => message?.type === 'CONTENT_SCRIPT_READY' && message?.source === 'signup-page'),
    false
  );
});

test('signup auth bundle reports ready once after the handlers are registered', () => {
  const sentMessages = [];
  const context = createBaseContext({
    location: { href: 'https://platform.openai.com/login' },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            context.__listeners.push(listener);
          },
        },
        sendMessage(message) {
          sentMessages.push(message);
        },
      },
    },
    VerificationCode: {
      isVerificationCodeRejectedText() { return false; },
      isVerificationRetryStateText() { return false; },
    },
    PhoneVerification: {
      isPhoneVerificationRequiredText() { return false; },
      getPhoneVerificationBlockedMessage() { return ''; },
    },
    AuthFatalErrors: {
      isAuthOperationTimedOutText() { return false; },
      getAuthOperationTimedOutMessage() { return ''; },
      isAuthFatalErrorText() { return false; },
      isUnsupportedCountryRegionTerritoryText() { return false; },
      getUnsupportedCountryRegionTerritoryMessage() { return ''; },
    },
    UnsupportedEmail: {
      isUnsupportedEmailText() { return false; },
      isUnsupportedEmailBlockingStep() { return false; },
      getUnsupportedEmailBlockedMessage() { return ''; },
    },
    getComputedStyle() {
      return {
        display: 'block',
        visibility: 'visible',
        opacity: '1',
      };
    },
    resetStopState() {},
    isStopError() { return false; },
    log() {},
    reportError() {},
  });

  assert.doesNotThrow(() => runScripts([
    'content/utils.js',
    'content/signup-page.js',
    'content/openai-auth-step3-flow.js',
    'content/openai-auth-step6-flow.js',
    'content/openai-auth-step2-handler.js',
    'content/openai-auth-step3-handler.js',
    'content/openai-auth-step5-handler.js',
    'content/openai-auth-step6-handler.js',
    'content/openai-auth-step8-handler.js',
    'content/openai-auth-actions-handler.js',
  ], context));

  const readyMessages = sentMessages.filter((message) => message?.type === 'CONTENT_SCRIPT_READY' && message?.source === 'signup-page');
  assert.equal(readyMessages.length, 1);
});

test('signup-page content script can be evaluated twice safely', () => {
  const context = createBaseContext({
    VerificationCode: { isVerificationCodeRejectedText() { return false; } },
    PhoneVerification: { isPhoneVerificationRequiredText() { return false; } },
    AuthFatalErrors: { isAuthFatalErrorText() { return false; } },
    UnsupportedEmail: { isUnsupportedEmailText() { return false; } },
    resetStopState() {},
    isStopError() { return false; },
    log() {},
    reportError() {},
  });

  assert.doesNotThrow(() => runScriptTwice('content/signup-page.js', context));
  assert.equal(context.__listeners.length, 1);
});
