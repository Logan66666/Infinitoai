const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSidepanelSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
}

function readSidepanelCss() {
  return fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.css'), 'utf8');
}

test('auto-run reset clears both email and password fields in the side panel UI', () => {
  const source = readSidepanelSource();

  assert.match(
    source,
    /case 'AUTO_RUN_RESET':[\s\S]*inputEmail\.value = '';/,
  );
  assert.match(
    source,
    /case 'AUTO_RUN_RESET':[\s\S]*inputPassword\.value = '';/,
  );
});

test('manual reset clears both email and password fields in the side panel UI', () => {
  const source = readSidepanelSource();

  assert.match(
    source,
    /btnReset\.addEventListener\('click', async \(\) => \{[\s\S]*inputEmail\.value = '';/,
  );
  assert.match(
    source,
    /btnReset\.addEventListener\('click', async \(\) => \{[\s\S]*inputPassword\.value = '';/,
  );
});

test('paste-and-validate clears the current email field before picking the next TMailor candidate', () => {
  const source = readSidepanelSource();

  assert.match(
    source,
    /async function pasteAndValidateTmailorEmail\(\) \{[\s\S]*inputEmail\.value = '';[\s\S]*pickTmailorCandidate\(/,
  );
});

test('side panel exposes log round navigation controls without a clear button', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.doesNotMatch(html, /id="btn-clear-log"/);
  assert.match(html, /id="btn-copy-log-round"/);
  assert.match(html, /id="btn-log-round-next"/);
  assert.match(html, /id="display-log-round"/);
  assert.match(source, /const btnCopyLogRound = document\.getElementById\('btn-copy-log-round'\);/);
  assert.doesNotMatch(source, /btnClearLog/);
});

test('side panel restores and updates preserved log rounds instead of clearing the console every auto-run reset', () => {
  const source = readSidepanelSource();

  assert.match(source, /if \(state\.logRounds\) \{[\s\S]*setLogHistory\(/);
  assert.match(source, /case 'AUTO_RUN_RESET':[\s\S]*refreshLogHistoryFromBackground\(\);/);
  assert.doesNotMatch(source, /case 'AUTO_RUN_RESET':[\s\S]*clearLogArea\(\);/);
});

test('side panel exposes success and failure column delete buttons for both TMailor tables', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');

  assert.match(html, /id="btn-whitelist-clear-success"/);
  assert.match(html, /id="btn-whitelist-clear-failure"/);
  assert.match(html, /id="btn-blacklist-clear-success"/);
  assert.match(html, /id="btn-blacklist-clear-failure"/);
});

test('side panel wires TMailor stat-column delete buttons to persist cleared column values', () => {
  const source = readSidepanelSource();

  assert.match(source, /const btnWhitelistClearSuccess = document\.getElementById\('btn-whitelist-clear-success'\);/);
  assert.match(source, /const btnWhitelistClearFailure = document\.getElementById\('btn-whitelist-clear-failure'\);/);
  assert.match(source, /const btnBlacklistClearSuccess = document\.getElementById\('btn-blacklist-clear-success'\);/);
  assert.match(source, /const btnBlacklistClearFailure = document\.getElementById\('btn-blacklist-clear-failure'\);/);
  assert.match(source, /async function clearTmailorStatsColumn\(domains, metric\) \{/);
  assert.match(source, /await chrome\.runtime\.sendMessage\(\{[\s\S]*type: 'SAVE_TMAILOR_DOMAIN_STATE'[\s\S]*payload: \{ stats: nextState\.stats \}/);
  assert.match(source, /btnWhitelistClearSuccess\.addEventListener\('click', \(\) => \{[\s\S]*clearTmailorStatsColumn\(tmailorDomainState\.whitelist, 'success'\)/);
  assert.match(source, /btnWhitelistClearFailure\.addEventListener\('click', \(\) => \{[\s\S]*clearTmailorStatsColumn\(tmailorDomainState\.whitelist, 'failure'\)/);
  assert.match(source, /btnBlacklistClearSuccess\.addEventListener\('click', \(\) => \{[\s\S]*clearTmailorStatsColumn\(tmailorDomainState\.blacklist, 'success'\)/);
  assert.match(source, /btnBlacklistClearFailure\.addEventListener\('click', \(\) => \{[\s\S]*clearTmailorStatsColumn\(tmailorDomainState\.blacklist, 'failure'\)/);
});

test('side panel renders a blacklist action next to whitelist domains and persists moved state', () => {
  const source = readSidepanelSource();

  assert.match(source, /const \{[\s\S]*clearTmailorDomainStats,\s*moveTmailorDomainToBlacklist,/);
  assert.match(source, /async function moveWhitelistDomainToBlacklist\(domain\) \{/);
  assert.match(source, /payload: \{\s*whitelist: nextState\.whitelist,\s*blacklist: nextState\.blacklist,\s*stats: nextState\.stats,\s*\}/);
  assert.match(source, /data-domain-action="blacklist"/);
  assert.match(source, /class="domain-row-action-btn"/);
  assert.match(source, /tbodyTmailorWhitelist\.addEventListener\('click', async \(event\) => \{/);
  assert.match(source, /await moveWhitelistDomainToBlacklist\(button\.dataset\.domain \|\| ''\);/);
});

test('side panel exposes a whitelist add button in the domain header and persists comma-separated additions', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.match(html, /id="btn-whitelist-add"/);
  assert.match(html, /<th>[\s\S]*域名[\s\S]*id="btn-whitelist-add"/);
  assert.match(source, /const btnWhitelistAdd = document\.getElementById\('btn-whitelist-add'\);/);
  assert.match(source, /const \{\s*addTmailorDomainsToWhitelist,\s*clearTmailorDomainStats,/);
  assert.match(source, /async function promptAndAddWhitelistDomains\(\) \{/);
  assert.match(source, /window\.prompt\('输入要加入白名单的域名，支持多个域名用 , 分隔',\s*''\)/);
  assert.match(source, /\.split\(\/\[,，\]\/\)/);
  assert.match(source, /addTmailorDomainsToWhitelist\(previousState,\s*rawDomains\)/);
  assert.match(source, /payload:\s*\{[\s\S]*whitelist:\s*nextState\.whitelist,[\s\S]*blacklist:\s*nextState\.blacklist,[\s\S]*stats:\s*nextState\.stats[\s\S]*\}/);
  assert.match(source, /btnWhitelistAdd\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*promptAndAddWhitelistDomains\(\)/);
});

test('side panel toast markup uses an icon close button with an accessible label', () => {
  const source = readSidepanelSource();

  assert.match(source, /class="toast-close"[^>]*aria-label="关闭提示"[^>]*>\$\{TOAST_CLOSE_ICON\}<\/button>/);
});

test('side panel toast layout vertically centers the leading icon with its message', () => {
  const css = readSidepanelCss();
  const toastRule = css.match(/\.toast\s*\{[^}]+\}/);

  assert.ok(toastRule, 'expected to find the .toast rule');
  assert.match(toastRule[0], /align-items:\s*center;/);
});

test('side panel toast dismissal has a fallback path when the exit animation event does not fire', () => {
  const source = readSidepanelSource();

  assert.match(source, /setTimeout\(\(\)\s*=>\s*finalizeToastDismiss\(toast\),\s*260\)/);
  assert.match(source, /toast\.addEventListener\('animationend',\s*\(\)\s*=>\s*\{[\s\S]*finalizeToastDismiss\(toast\);/);
});

test('side panel renders a target mailbox timer row directly below the error stats panel and refreshes it from state', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.match(html, /id="run-target-email-timer"/);
  assert.match(
    html,
    /run-stats-panel-failure[\s\S]*id="run-failure-details"[\s\S]*id="run-target-email-timer"/,
  );
  assert.match(source, /const runTargetEmailTimer = document\.getElementById\('run-target-email-timer'\);/);
  assert.match(source, /lastTargetEmailAcquiredAtState/);
  assert.match(source, /updateTargetEmailTimerDisplay\(state\.lastTargetEmailAcquiredAt\);/);
  assert.match(source, /message\.payload\.lastTargetEmailAcquiredAt !== undefined/);
  assert.match(source, /setInterval\(\(\)\s*=>\s*\{[\s\S]*updateTargetEmailTimerDisplay\(\);[\s\S]*\},\s*1000\)/);
});

test('side panel exposes console and accounts tabs with account export and clear actions', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.match(html, /id="btn-view-console"/);
  assert.match(html, /id="btn-view-accounts"/);
  assert.match(html, /id="accounts-view"/);
  assert.match(html, /id="btn-export-accounts-csv"/);
  assert.match(html, /id="btn-clear-account-records"/);
  assert.match(html, /id="tbody-account-records"/);
  assert.match(source, /const btnViewConsole = document\.getElementById\('btn-view-console'\);/);
  assert.match(source, /const btnViewAccounts = document\.getElementById\('btn-view-accounts'\);/);
  assert.match(source, /const btnExportAccountsCsv = document\.getElementById\('btn-export-accounts-csv'\);/);
  assert.match(source, /const btnClearAccountRecords = document\.getElementById\('btn-clear-account-records'\);/);
  assert.match(source, /function setActivePanelView\(view\)/);
  assert.match(source, /function renderAccountRecords\(records = \[\]\)/);
  assert.match(source, /function downloadAccountRecordsCsv\(\)/);
});

test('side panel adds an opt-in success-only filter for account records', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.match(html, /id="input-accounts-success-only"/);
  assert.match(html, /保留成功项/);
  assert.match(source, /const inputAccountsSuccessOnly = document\.getElementById\('input-accounts-success-only'\);/);
  assert.match(source, /let showSuccessOnlyAccountRecords = false;/);
  assert.match(source, /const visibleRecords = showSuccessOnlyAccountRecords \? accountRecordsState\.filter\(\(record\) => record\.status === 'success'\) : accountRecordsState;/);
  assert.match(source, /inputAccountsSuccessOnly\.addEventListener\('change', \(\) => \{[\s\S]*showSuccessOnlyAccountRecords = Boolean\(inputAccountsSuccessOnly\.checked\);[\s\S]*renderAccountRecords\(accountRecordsState\);/);
});

test('side panel removes the accounts subtitle and confirms before clearing persisted account records', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const source = readSidepanelSource();

  assert.doesNotMatch(html, /记录已拿到邮箱密码的账号及最终登录结果/);
  assert.match(html, /class="accounts-actions"/);
  assert.match(source, /btnClearAccountRecords\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{/);
  assert.match(source, /window\.confirm\('确定清空所有账号记录吗？此操作不可恢复。'\)/);
  assert.match(source, /type:\s*'CLEAR_ACCOUNT_RECORDS'/);
});

test('side panel persists the current password input before manually running a step', () => {
  const source = readSidepanelSource();

  assert.match(source, /document\.querySelectorAll\('\.step-btn'\)\.forEach\(btn => \{[\s\S]*await persistCurrentTopSettings\(\);[\s\S]*type:\s*'SAVE_SETTING'[\s\S]*payload:\s*\{\s*customPassword:\s*inputPassword\.value\s*\}[\s\S]*type:\s*'EXECUTE_STEP'/);
});

test('side panel adds dedicated dark-theme styling for the accounts view surfaces and status pills', () => {
  const css = readSidepanelCss();

  assert.match(css, /\[data-theme="dark"\]\s+\.accounts-card\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.accounts-table-wrap\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.accounts-table\s+td\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.account-status-success\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.account-status-add-phone\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.account-status-other\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.account-status-pending\s*\{/);
});

test('side panel shows date-only account timestamps, removes the updated column, and lets the account table grow horizontally so logs stay on one line', () => {
  const source = readSidepanelSource();
  const css = readSidepanelCss();
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');

  assert.match(source, /return parsed\.toLocaleDateString\('zh-CN'/);
  assert.match(source, /record\.emailSource === 'tmailor' \? '--' : \(record\.mailProvider \|\| '--'\)/);
  assert.match(source, /class="account-cell account-cell-email"/);
  assert.match(source, /class="account-cell account-cell-password"/);
  assert.match(source, /class="account-cell account-cell-raw"/);
  assert.doesNotMatch(source, /record\.updatedAt/);
  assert.match(html, /<th>原始日志<\/th>/);
  assert.doesNotMatch(html, /<th>更新时间<\/th>/);
  assert.match(html, /<tr><td class="empty" colspan="7">暂无账号记录<\/td><\/tr>/);
  assert.match(css, /\.accounts-table\s*\{[\s\S]*width:\s*max-content;/);
  assert.match(css, /\.accounts-table\s*\{[\s\S]*min-width:\s*100%;/);
  assert.doesNotMatch(css, /\.account-cell-raw\s*\{[\s\S]*display:\s*-webkit-box;/);
  assert.match(css, /\.account-cell-raw\s*\{[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.account-cell-email,\s*\.account-cell-password\s*\{[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /\.account-cell-raw\s*\{[\s\S]*width:\s*100%;/);
});

test('side panel shows account timestamps as hh:mm for today and keeps date-only output for earlier days', () => {
  const source = readSidepanelSource();

  assert.match(source, /const now = new Date\(\);/);
  assert.match(source, /parsed\.getFullYear\(\) === now\.getFullYear\(\)/);
  assert.match(source, /parsed\.getMonth\(\) === now\.getMonth\(\)/);
  assert.match(source, /parsed\.getDate\(\) === now\.getDate\(\)/);
  assert.match(source, /return parsed\.toLocaleTimeString\('zh-CN',\s*\{[\s\S]*hour:\s*'2-digit'[\s\S]*minute:\s*'2-digit'[\s\S]*hour12:\s*false[\s\S]*\}\);/);
  assert.match(source, /return parsed\.toLocaleDateString\('zh-CN',\s*\{[\s\S]*year:\s*'numeric'[\s\S]*month:\s*'2-digit'[\s\S]*day:\s*'2-digit'[\s\S]*\}\);/);
});

test('side panel lets account cells copy their full value on click', () => {
  const source = readSidepanelSource();

  assert.match(source, /class="account-cell account-cell-meta" data-copy-value="\$\{escapeHtmlAttribute\([A-Za-z]+Label\)\}"/);
  assert.match(source, /class="account-cell account-cell-email" data-copy-value="\$\{escapeHtmlAttribute\([A-Za-z]+Label\)\}"/);
  assert.match(source, /class="account-cell account-cell-password" data-copy-value="\$\{escapeHtmlAttribute\([A-Za-z]+Label\)\}"/);
  assert.match(source, /class="account-cell account-cell-raw" data-copy-value="\$\{escapeHtmlAttribute\(rawStatusDetail\)\}"/);
  assert.match(source, /tbodyAccountRecords\.addEventListener\('click',\s*async\s*\(event\)\s*=>\s*\{/);
  assert.match(source, /event\.target\.closest\('td\[data-copy-value\]'\)/);
  assert.match(source, /await copyTextValue\(copyValue,\s*'单元格内容已复制'\)/);
});

test('side panel exports account csv with a utf-8 bom so Excel keeps Chinese text readable', () => {
  const source = readSidepanelSource();

  assert.match(source, /const csv = buildAccountRecordsCsv\(accountRecordsState\);/);
  assert.match(source, /const blob = new Blob\(\['\\uFEFF',\s*csv\],\s*\{\s*type:\s*'text\/csv;charset=utf-8'\s*\}\);/);
});
