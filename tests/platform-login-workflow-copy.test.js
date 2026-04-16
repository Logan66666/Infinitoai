const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('background copy reflects the platform-login-first signup flow', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /const OFFICIAL_SIGNUP_ENTRY_URL = 'https:\/\/platform\.openai\.com\/login';/i
  );
  assert.match(
    backgroundSource,
    /Phase 1: Open platform login page/i
  );
  assert.match(
    backgroundSource,
    /Step 2: Opening platform login page/i
  );
  assert.match(
    backgroundSource,
    /reuseActiveTabOnCreate:\s*true/i
  );
  assert.match(
    backgroundSource,
    /clicking Continue, and requesting a one-time verification code/i
  );
  assert.doesNotMatch(
    backgroundSource,
    /Phase 1: Open official signup/i
  );
});

test('side panel workflow labels describe the platform login and continue flow', () => {
  const sidepanelHtml = readProjectFile(path.join('sidepanel', 'sidepanel.html'));

  assert.match(sidepanelHtml, />Open Platform Login</);
  assert.match(sidepanelHtml, />Fill Email \/ Continue</);
  assert.doesNotMatch(sidepanelHtml, />Open Signup</);
  assert.doesNotMatch(sidepanelHtml, />Fill Email \/ Password</);
});

test('step 2 ignores navigation-driven signup page disconnects and keeps waiting for completion', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeStep2\(state\) \{[\s\S]*try \{[\s\S]*await sendToContentScript\('signup-page', \{[\s\S]*\}\);[\s\S]*\} catch \(err\) \{[\s\S]*isMessageChannelClosedError\([\s\S]*isReceivingEndMissingError\([\s\S]*waiting for completion signal[\s\S]*throw err;[\s\S]*\}[\s\S]*\}/i
  );
});

test('step 2 has an auth-page-ready fallback when the completion signal is lost during navigation', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function waitForStep2CompletionSignalOrAuthPageReady\(\) \{/i
  );
  assert.match(
    backgroundSource,
    /Step 2: Signup page navigated before the step-2 response returned[\s\S]*await waitForStep2CompletionSignalOrAuthPageReady\(\);/i
  );
  assert.match(
    backgroundSource,
    /hasVisibleCredentialInput[\s\S]*notifyStepComplete\(2,\s*\{[\s\S]*recoveredAfterNavigation:\s*true[\s\S]*\}\)/i
  );
});

test('step 2 retries once by reopening the platform login page after non-navigation errors', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /if \(step === 2 && !recoveredStep2PlatformLogin[\s\S]*await recoverStep2PlatformLogin\(err\);[\s\S]*return await executeStepAndWait\(step,\s*delayAfter,\s*\{\s*step2PlatformLogin:\s*true\s*\}\);/i
  );
  assert.match(
    backgroundSource,
    /async function recoverStep2PlatformLogin\(error\) \{[\s\S]*Reopening the platform login page and retrying once[\s\S]*reuseOrCreateTab\('signup-page',\s*OFFICIAL_SIGNUP_ENTRY_URL,\s*\{[\s\S]*reloadIfSameUrl:\s*true[\s\S]*\}\);/i
  );
});

test('step 1 retries once by reopening the vps panel after recoverable panel-load errors', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /if \(step === 1 && !recoveredStep1VpsPanel && shouldRetryStep1WithFreshVpsPanel\(err\)\)[\s\S]*await recoverStep1VpsPanel\(err\);[\s\S]*return await executeStepAndWait\(step,\s*delayAfter,\s*\{\s*step1VpsPanel:\s*true\s*\}\);/i
  );
  assert.match(
    backgroundSource,
    /async function recoverStep1VpsPanel\(error\) \{[\s\S]*Reopening the VPS panel and retrying once[\s\S]*reuseOrCreateTab\('vps-panel',\s*state\.vpsUrl,\s*\{[\s\S]*reloadIfSameUrl:\s*true[\s\S]*\}\);/i
  );
});

test('step 4 replays step 2 and step 3 once with the current TMailor mailbox before failing the run', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /if \(step === 4 && !recoveredStep4CredentialStall && shouldRetryStep4WithCurrentTmailorLease\(err\)\)[\s\S]*await replayStep2AndStep3WithCurrentTmailorLease\(err\);[\s\S]*return await executeStepAndWait\(step,\s*delayAfter,\s*\{[\s\S]*step4CredentialStall:\s*true[\s\S]*\}\);/i
  );
  assert.match(
    backgroundSource,
    /async function replayStep2AndStep3WithCurrentTmailorLease\(error\) \{[\s\S]*getActiveTmailorEmailLease\([\s\S]*setEmailState\(lease\.email\)[\s\S]*executeStepAndWait\(2,\s*2000[\s\S]*executeStepAndWait\(3,\s*getStepDelayAfter\(3\)/i
  );
  assert.match(
    backgroundSource,
    /function shouldRetryStep4WithCurrentTmailorLease\(error\) \{[\s\S]*signup page never advanced past the credential form/i
  );
});

test('step 3 keeps waiting for completion when the signup auth page enters bfcache during navigation', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeStep3\(state\) \{[\s\S]*try \{[\s\S]*await sendToContentScript\('signup-page', \{[\s\S]*step:\s*3[\s\S]*\}\);[\s\S]*\} catch \(err\) \{[\s\S]*isMessageChannelClosedError\([\s\S]*isReceivingEndMissingError\([\s\S]*waitForStep3CompletionSignalOrRecoveredAuthState\(\);[\s\S]*throw err;[\s\S]*\}[\s\S]*\}/i
  );
  assert.match(
    backgroundSource,
    /async function waitForStep3CompletionSignalOrRecoveredAuthState\(\) \{/i
  );
  assert.match(
    backgroundSource,
    /hasVisibleVerificationInput[\s\S]*hasVisibleProfileFormInput[\s\S]*!\s*pageState\?\.hasVisibleCredentialInput[\s\S]*const payload = \{ recoveredAfterNavigation:\s*true \};[\s\S]*notifyStepComplete\(3,\s*payload\)/i
  );
  assert.match(
    backgroundSource,
    /const payload = \{[\s\S]*recoveredAfterNavigation:\s*true,[\s\S]*existingAccountLogin:\s*true[\s\S]*\};[\s\S]*Existing-account login password page is already visible after the navigation interrupt[\s\S]*notifyStepComplete\(3,\s*payload\)/i
  );
});

test('step 3 retries once with the current email and password when the signup credential page stalls', () => {
  const runtimeErrorsSource = readProjectFile(path.join('shared', 'runtime-errors.js'));

  assert.match(
    runtimeErrorsSource,
    /function shouldRetryStep3WithFreshOauth[\s\S]*passwordless-login button or password input after submitting email[\s\S]*password was filled but the signup page never advanced past the credential form/i
  );
});

test('step 3 retries platform-login stalls up to three times before failing the run', () => {
  const backgroundSource = readProjectFile('background.js');
  const runtimeErrorsSource = readProjectFile(path.join('shared', 'runtime-errors.js'));

  assert.match(
    runtimeErrorsSource,
    /function shouldRetryStep3WithPlatformLoginRefresh\(error\)[\s\S]*platform\\\.openai\\\.com\\\/login/i
  );
  assert.match(
    backgroundSource,
    /const recoveredStep3PlatformLoginRefreshCount = Math\.max\(0,\s*Number\.parseInt\(String\(recoveryState\?\.step3PlatformLoginRefreshCount \?\? 0\),\s*10\) \|\| 0\);/i
  );
  assert.match(
    backgroundSource,
    /if \(step === 3 && recoveredStep3PlatformLoginRefreshCount < 3 && shouldRetryStep3WithPlatformLoginRefresh\(err\)\)[\s\S]*return await executeStepAndWait\(step,\s*delayAfter,\s*\{[\s\S]*step3PlatformLoginRefreshCount:\s*recoveredStep3PlatformLoginRefreshCount \+ 1[\s\S]*\}\);/i
  );
});

test('step 6 retries once with a fresh oauth url after recoverable auth-page stalls', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /if \(step === 6 && !recoveredStep6PlatformLogin && shouldRetryStep6WithFreshOauth\(err\)\)[\s\S]*await recoverStep6PlatformLogin\(err\);[\s\S]*return await executeStepAndWait\(step,\s*delayAfter,\s*\{\s*step6PlatformLogin:\s*true\s*\}\);/i
  );
  assert.match(
    backgroundSource,
    /async function recoverStep6PlatformLogin\(error\) \{[\s\S]*Refreshing the VPS OAuth link and reopening the auth login page once[\s\S]*await refreshOauthUrlBeforeStep6\(/i
  );
});

test('step 8 heartbeats retry the consent-page continue click when the auth page stalls on consent', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function retryStep8ConsentClickIfStillVisible\(/i
  );
  assert.match(
    backgroundSource,
    /shouldLogStep8RedirectHeartbeat\([\s\S]*await retryStep8ConsentClickIfStillVisible\(/i
  );
  assert.match(
    backgroundSource,
    /Consent page is still visible during heartbeat[\s\S]*retrying the "继续" click/i
  );
});

test('step 4 and step 5 skip signup-only work when step 3 already identified an existing account login flow', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /case 3:[\s\S]*existingAccountLogin/i
  );
  assert.match(
    backgroundSource,
    /async function executeStep4\(state\) \{[\s\S]*if \(state\.existingAccountLogin\)[\s\S]*Skipping inbox polling[\s\S]*notifyStepComplete\(4,\s*\{[\s\S]*skippedExistingAccountLogin:\s*true/i
  );
  assert.match(
    backgroundSource,
    /async function executeStep5\(state\) \{[\s\S]*if \(state\.existingAccountLogin\)[\s\S]*Skipping profile completion[\s\S]*notifyStepComplete\(5,\s*\{[\s\S]*skippedExistingAccountLogin:\s*true/i
  );
});

test('step 5 waits briefly for the page to leave verification and reach the profile form before filling name data', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function ensureSignupPageReadyForProfile\(state,\s*step = 5\) \{/i
  );
  assert.match(
    backgroundSource,
    /async function executeStep5\(state\) \{[\s\S]*await ensureSignupPageReadyForProfile\(state,\s*5\);[\s\S]*await sendToContentScript\('signup-page',\s*\{[\s\S]*step:\s*5[\s\S]*payload:\s*\{ firstName,\s*lastName,\s*year,\s*month,\s*day \}[\s\S]*\}\);/i
  );
});

test('step 4 and step 5 page-readiness checks consume the stronger auth-page semantic signals', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function ensureSignupPageReadyForVerification\(state,\s*step = 4\) \{[\s\S]*hasReadyVerificationPage[\s\S]*hasReadyProfilePage/i
  );
  assert.match(
    backgroundSource,
    /async function ensureSignupPageReadyForProfile\(state,\s*step = 5\) \{[\s\S]*hasReadyProfilePage[\s\S]*hasReadyVerificationPage/i
  );
  assert.match(
    backgroundSource,
    /hasReadyVerificationPage:\s*false[\s\S]*hasReadyProfilePage:\s*false/i
  );
});

test('infinite auto run keeps per-run reset and log-round setup inside the retryable run catch', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /const runTargetText = autoRunInfinite \? `\$\{run\}\/∞` : `\$\{run\}\/\$\{totalRuns\}`;\r?\n\r?\n\s*try \{\r?\n\s*\/\/ Reset everything at the start of each run[\s\S]*await resetState\(\{ preserveLogHistory: true \}\);[\s\S]*await startNewLogRound\(`Run \$\{runTargetText\}`\);[\s\S]*await executeStepAndWait\(2,\s*2000\);/i
  );
});

test('auto run phase 2 uses a distinct email-source binding after the per-run setup block', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /const currentState = await getState\(\);\r?\n\s*const currentEmailSource = getCurrentEmailSource\(currentState\);[\s\S]*getEmailSourceLabel\(currentEmailSource\)/i
  );
});
