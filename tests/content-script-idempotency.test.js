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

test('utils content script can be evaluated twice safely', () => {
  const context = createBaseContext();

  assert.doesNotThrow(() => runScriptTwice('content/utils.js', context));
  assert.equal(context.__listeners.length, 1);
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
