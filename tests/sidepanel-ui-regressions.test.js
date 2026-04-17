const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSidepanelSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
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

test('side panel toast dismissal has a fallback path when the exit animation event does not fire', () => {
  const source = readSidepanelSource();

  assert.match(source, /setTimeout\(\(\)\s*=>\s*finalizeToastDismiss\(toast\),\s*260\)/);
  assert.match(source, /toast\.addEventListener\('animationend',\s*\(\)\s*=>\s*\{[\s\S]*finalizeToastDismiss\(toast\);/);
});
