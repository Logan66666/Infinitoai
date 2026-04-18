const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createAccountRecord,
  normalizeAccountRecords,
  updateAccountRecordStatus,
  buildAccountRecordsCsv,
} = require('../shared/account-records.js');

test('account records classify add-phone failures and preserve raw detail', () => {
  const created = createAccountRecord({
    email: 'user@example.com',
    password: 'Secret123!',
    emailSource: 'tmailor',
    mailProvider: '163',
    createdAt: '2026-04-18T12:30:00.000Z',
  });

  const updated = updateAccountRecordStatus(created, {
    statusDetail: 'Step 8 blocked: auth page still requires phone verification.',
  });

  assert.equal(updated.status, 'add_phone');
  assert.equal(updated.statusDetail, 'Step 8 blocked: auth page still requires phone verification.');
  assert.equal(updated.emailSource, 'tmailor');
});

test('account records export csv with ordered columns and escaped fields', () => {
  const records = normalizeAccountRecords([
    createAccountRecord({
      email: 'alpha@example.com',
      password: 'Pa,ss"word',
      emailSource: 'duck',
      mailProvider: 'qq',
      createdAt: '2026-04-18T12:30:00.000Z',
      updatedAt: '2026-04-18T12:40:00.000Z',
      status: 'other',
      statusDetail: 'Step 5 failed, raw detail',
    }),
  ]);

  const csv = buildAccountRecordsCsv(records);

  assert.match(csv, /^Registered At,Source,Mail Provider,Email,Password,Login Result,Raw Detail,Updated At\r?\n/);
  assert.match(csv, /2026-04-18T12:30:00\.000Z,duck,qq,alpha@example\.com,"Pa,ss""word",other,"Step 5 failed, raw detail",2026-04-18T12:40:00\.000Z/);
});

test('account records export csv renders tmailor mail provider as double-dash', () => {
  const records = normalizeAccountRecords([
    createAccountRecord({
      email: 'beta@example.com',
      password: 'Secret123!',
      emailSource: 'tmailor',
      mailProvider: '163',
      createdAt: '2026-04-18T12:30:00.000Z',
      updatedAt: '2026-04-18T12:40:00.000Z',
      status: 'success',
      statusDetail: 'login ok',
    }),
  ]);

  const csv = buildAccountRecordsCsv(records);

  assert.match(csv, /2026-04-18T12:30:00\.000Z,tmailor,--,beta@example\.com,Secret123!,success,login ok,2026-04-18T12:40:00\.000Z/);
});

test('account records keep only the last record for the same email', () => {
  const records = normalizeAccountRecords([
    createAccountRecord({
      id: 'acct_first',
      email: 'dup@example.com',
      password: 'first-pass',
      emailSource: 'tmailor',
      mailProvider: '163',
      createdAt: '2026-04-18T12:30:00.000Z',
      updatedAt: '2026-04-18T12:31:00.000Z',
      status: 'add_phone',
      statusDetail: 'first detail',
    }),
    createAccountRecord({
      id: 'acct_second',
      email: 'dup@example.com',
      password: 'second-pass',
      emailSource: 'tmailor',
      mailProvider: '163',
      createdAt: '2026-04-18T12:32:00.000Z',
      updatedAt: '2026-04-18T12:33:00.000Z',
      status: 'other',
      statusDetail: 'second detail',
    }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'acct_second');
  assert.equal(records[0].email, 'dup@example.com');
  assert.equal(records[0].password, 'second-pass');
  assert.equal(records[0].statusDetail, 'second detail');
});

test('background persists account records and broadcasts them to the side panel', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  assert.match(source, /shared\/account-records\.js/);
  assert.match(source, /const ACCOUNT_RECORDS_KEY = 'accountRecords';/);
  assert.match(source, /broadcastDataUpdate\(\{ accountRecords: nextRecords \}\)/);
  assert.match(source, /currentAccountRecordId/);
});

test('background clears persisted account records and resets the current account pointer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  assert.match(source, /case 'CLEAR_ACCOUNT_RECORDS': \{/);
  assert.match(source, /await setPersistentAccountRecords\(\[\]\)/);
  assert.match(source, /await setState\(\{ currentAccountRecordId: null \}\)/);
  assert.match(source, /broadcastDataUpdate\(\{ accountRecords: \[\] \}\)/);
});
