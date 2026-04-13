const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTmailorRejectedDomainMessage,
  getClipboardReadDeniedMessage,
  getNoTmailorEmailFoundMessage,
  getTmailorValidationSuccessAction,
  shouldExecuteStep3AfterValidation,
  shouldAttemptAutoRunResumeFromInput,
  shouldFallbackToStep3AfterResume,
  shouldRetryTmailorFetchAfterValidationFailure,
} = require('../shared/tmailor-paste-feedback.js');

test('rejected-domain message tells the user the input was cleared and a fresh mailbox is being requested', () => {
  assert.equal(
    buildTmailorRejectedDomainMessage('datadudi.com', 'whitelist_only'),
    'datadudi.com 不符合当前仅白名单模式，已清空输入并自动请求新的 TMailor 邮箱。'
  );
});

test('retry-after-validation-failure only retries for disallowed TMailor domains', () => {
  assert.equal(shouldRetryTmailorFetchAfterValidationFailure({ reason: 'disallowed_domain' }), true);
  assert.equal(shouldRetryTmailorFetchAfterValidationFailure({ reason: 'invalid_email' }), false);
  assert.equal(shouldRetryTmailorFetchAfterValidationFailure(null), false);
});

test('clipboard guidance messages are specific', () => {
  assert.match(getClipboardReadDeniedMessage(), /重新加载插件/i);
  assert.match(getNoTmailorEmailFoundMessage(), /先把邮箱粘贴到输入框/i);
});

test('successful TMailor validation resumes auto run when the flow is waiting, otherwise it starts step 3', () => {
  assert.equal(
    getTmailorValidationSuccessAction({ autoContinueVisible: true }),
    'resume_auto_run'
  );
  assert.equal(
    getTmailorValidationSuccessAction({ autoContinueVisible: false }),
    'execute_step_3'
  );
});

test('validation falls back to step 3 when auto-run resume is not actually attached', () => {
  assert.equal(shouldFallbackToStep3AfterResume({ resumed: true }), false);
  assert.equal(shouldFallbackToStep3AfterResume({ resumed: false }), true);
  assert.equal(shouldFallbackToStep3AfterResume(null), true);
});

test('successful TMailor validation starts step 3 unless auto-run really resumed', () => {
  assert.equal(
    shouldExecuteStep3AfterValidation({
      successAction: 'execute_step_3',
      resumeSucceeded: false,
    }),
    true
  );
  assert.equal(
    shouldExecuteStep3AfterValidation({
      successAction: 'resume_auto_run',
      resumeSucceeded: false,
    }),
    true
  );
  assert.equal(
    shouldExecuteStep3AfterValidation({
      successAction: 'resume_auto_run',
      resumeSucceeded: true,
    }),
    false
  );
});

test('manual email input only auto-resumes when the flow is waiting and the value looks like an email', () => {
  assert.equal(
    shouldAttemptAutoRunResumeFromInput({
      autoContinueVisible: true,
      email: 'temp@example.com',
    }),
    true
  );
  assert.equal(
    shouldAttemptAutoRunResumeFromInput({
      autoContinueVisible: false,
      email: 'temp@example.com',
    }),
    false
  );
  assert.equal(
    shouldAttemptAutoRunResumeFromInput({
      autoContinueVisible: true,
      email: 'not-an-email',
    }),
    false
  );
});
