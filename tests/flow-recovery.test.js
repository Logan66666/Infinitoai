const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMailTabOpenUrlForStep,
  isVpsAuthorizationNotPendingText,
} = require('../shared/flow-recovery.js');

test('step 7 reopens the TMailor home page before polling the login code', () => {
  assert.equal(
    getMailTabOpenUrlForStep({
      step: 7,
      mailSource: 'tmailor-mail',
      defaultUrl: 'https://tmailor.com/inbox?emailid=old-detail',
    }),
    'https://tmailor.com/'
  );
});

test('non-TMailor providers keep their original mailbox URL at step 7', () => {
  assert.equal(
    getMailTabOpenUrlForStep({
      step: 7,
      mailSource: 'mail-163',
      defaultUrl: 'https://mail.163.com/js6/main.jsp?df=mail163_letter',
    }),
    'https://mail.163.com/js6/main.jsp?df=mail163_letter'
  );
});

test('VPS verify detects an expired authorization link when the status says not pending', () => {
  assert.equal(
    isVpsAuthorizationNotPendingText('This authorization link is not pending anymore.'),
    true
  );
  assert.equal(
    isVpsAuthorizationNotPendingText('授权链接 is not pending，请重新获取后再试。'),
    true
  );
});

test('VPS verify ignores unrelated status text when checking not-pending auth errors', () => {
  assert.equal(
    isVpsAuthorizationNotPendingText('认证成功！'),
    false
  );
  assert.equal(
    isVpsAuthorizationNotPendingText('502 Bad Gateway'),
    false
  );
});
