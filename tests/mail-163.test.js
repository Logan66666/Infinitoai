const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createContext() {
  const listeners = [];
  const state = {
    logs: [],
    sleepCalls: 0,
    runtimeMessages: [],
    clickedInbox: 0,
    clickedRefresh: 0,
    clickedMail: 0,
    deletedMail: 0,
  };

  const context = {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    location: { href: 'https://mail.163.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule' },
    window: null,
    top: null,
    chrome: {
      runtime: {
        sendMessage(message, callback) {
          state.runtimeMessages.push(message);
          const response = { ok: true };
          if (typeof callback === 'function') callback(response);
          return Promise.resolve(response);
        },
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
      },
      storage: {
        session: {
          async get() {
            return {};
          },
          async set() {
            return {};
          },
        },
      },
    },
    MailMatching: {
      getStepMailMatchProfile() {
        return null;
      },
      matchesSubjectPatterns() {
        return false;
      },
    },
    MailFreshness: require('../shared/mail-freshness.js'),
    LatestMail: {
      findLatestMatchingItem(items, predicate) {
        const matches = Array.from(items).filter(predicate);
        return matches[0] || null;
      },
    },
    resetStopState() {},
    isStopError() {
      return false;
    },
    throwIfStopped() {},
    reportError() {},
    log(message, level = 'info') {
      state.logs.push({ message, level });
    },
    sleep: async () => {
      state.sleepCalls += 1;
    },
    waitForElement: async (selector) => {
      const found = context.document.querySelector(selector);
      if (!found) {
        throw new Error(`not found: ${selector}`);
      }
      return found;
    },
    setTimeout,
    clearTimeout,
    MouseEvent: function MouseEvent(type, init = {}) {
      return { type, ...init };
    },
    document: null,
  };

  context.document = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  };
  context.window = context;
  context.top = context;
  context.__state = state;
  context.__listeners = listeners;
  return context;
}

function loadMail163Script(context) {
  const scriptPath = path.join(__dirname, '..', 'content', 'mail-163.js');
  const code = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });
}

test('mail-163 opens a newly appeared matching email even when its timestamp text is unavailable', async () => {
  const context = createContext();
  const state = context.__state;
  let mailListCalls = 0;

  const inboxLink = {
    click() {
      state.clickedInbox += 1;
    },
  };

  const refreshButtonText = {
    textContent: '刷新',
    closest() {
      return {
        click() {
          state.clickedRefresh += 1;
        },
      };
    },
  };

  const mailItem = {
    id: 'mail-new-1',
    style: {},
    getAttribute(name) {
      if (name === 'id') return this.id;
      if (name === 'sign') return 'letter';
      if (name === 'aria-label') return '你的 ChatGPT 代码为 961734 发件人 ： noreply@tm.openai.com';
      return '';
    },
    querySelector(selector) {
      if (selector === '.nui-user') {
        return { textContent: 'noreply@tm.openai.com' };
      }
      if (selector === 'span.da0') {
        return { textContent: '你的 ChatGPT 代码为 961734' };
      }
      if (selector === '[sign="trash"], .nui-ico-delete, [title="删除邮件"]') {
        return {
          click() {
            state.deletedMail += 1;
          },
        };
      }
      return null;
    },
    dispatchEvent() {
      return true;
    },
  };

  context.document.querySelector = (selector) => {
    if (selector === '.nui-tree-item-text[title="收件箱"]') {
      return inboxLink;
    }
    return null;
  };

  context.document.querySelectorAll = (selector) => {
    if (selector === 'div[sign="letter"]') {
      mailListCalls += 1;
      return mailListCalls === 1 ? [] : [mailItem];
    }
    if (selector === '.nui-btn .nui-btn-text') {
      return [refreshButtonText];
    }
    return [];
  };

  loadMail163Script(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected the 163 content script to register a runtime listener');

  const result = await new Promise((resolve, reject) => {
    const response = listener({
      type: 'POLL_EMAIL',
      step: 4,
      payload: {
        senderFilters: ['openai', 'tm.openai.com'],
        subjectFilters: ['ChatGPT', '代码'],
        maxAttempts: 1,
        intervalMs: 0,
        filterAfterTimestamp: Date.now() - 60 * 1000,
        excludeCodes: [],
      },
    }, {}, (value) => resolve(value));

    if (response !== true) {
      reject(new Error('expected async response from mail-163 listener'));
    }
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.code, '961734');
  assert.equal(state.clickedInbox, 1);
  assert.equal(state.clickedRefresh, 1);
  assert.equal(state.deletedMail, 1);
  assert.ok(
    state.logs.some((entry) => /Code found: 961734/i.test(entry.message)),
    'expected the mail item to be accepted instead of skipped as stale'
  );
});
