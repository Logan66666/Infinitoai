const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('background copy reflects the email-first auto-run flow while keeping the platform login step', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /const OFFICIAL_SIGNUP_ENTRY_URL = 'https:\/\/platform\.openai\.com\/login';/i
  );
  assert.match(
    backgroundSource,
    /Phase 1: Refresh .* then open the platform login page/i
  );
  assert.match(
    backgroundSource,
    /Phase 2: Open platform login page/i
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
    /Phase 1: Open platform login page/i
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
    /async function executeStep2\(state,\s*options\s*=\s*\{\}\) \{[\s\S]*try \{[\s\S]*await sendToContentScript\('signup-page', \{[\s\S]*\}\);[\s\S]*\} catch \(err\) \{[\s\S]*isMessageChannelClosedError\([\s\S]*isReceivingEndMissingError\([\s\S]*waiting for completion signal[\s\S]*throw err;[\s\S]*\}[\s\S]*\}/i
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

test('step 2 navigation fallback replays the signup step when the page is still stuck on the platform signing bridge', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /Step 2: Auth page is still stuck on the platform signing bridge after the navigation interrupt[\s\S]*await executeStep2\(currentState,\s*\{\s*replayedAfterNavigationInterrupt:\s*true\s*\}\);/i
  );
});

test('step 2 emits heartbeat logs while waiting for the platform signing bridge to settle', () => {
  const signupSource = readProjectFile(path.join('content', 'signup-page.js'));

  assert.match(
    signupSource,
    /Platform entry is still waiting on the signing-in bridge after/i
  );
});

test('auth content scripts register step 3 and step 6 through dedicated handler files instead of the mixed router switch', () => {
  const manifestSource = readProjectFile('manifest.json');
  const backgroundSource = readProjectFile('background.js');
  const signupSource = readProjectFile(path.join('content', 'signup-page.js'));

  assert.match(manifestSource, /openai-auth-step3-handler\.js/i);
  assert.match(manifestSource, /openai-auth-step6-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-step2-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-step3-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-step5-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-step6-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-step8-handler\.js/i);
  assert.match(backgroundSource, /openai-auth-actions-handler\.js/i);
  assert.match(signupSource, /getRegisteredStepMetadata/i);
  assert.doesNotMatch(
    signupSource,
    /switch \(message\.step\) \{[\s\S]*case 3: return await step3_fillEmailPassword\(message\.payload\);[\s\S]*case 6: return await step6_login\(message\.payload\);/i
  );
});

test('step 3 and step 6 implementations live in separate flow files while signup-page stays as the shared auth shell', () => {
  const manifestSource = readProjectFile('manifest.json');
  const signupSource = readProjectFile(path.join('content', 'signup-page.js'));
  const step3FlowSource = readProjectFile(path.join('content', 'openai-auth-step3-flow.js'));
  const step6FlowSource = readProjectFile(path.join('content', 'openai-auth-step6-flow.js'));

  assert.match(manifestSource, /openai-auth-step3-flow\.js/i);
  assert.match(manifestSource, /openai-auth-step6-flow\.js/i);
  assert.doesNotMatch(signupSource, /async function step3_fillEmailPassword\(/i);
  assert.doesNotMatch(signupSource, /async function step6_login\(/i);
  assert.match(step3FlowSource, /async function step3_fillEmailPassword\(/i);
  assert.match(step6FlowSource, /async function step6_login\(/i);
});

test('readme describes the platform signup-entry flow separately from the oauth login flow', () => {
  const readmeSource = readProjectFile('README.md');

  assert.match(readmeSource, /Platform Signup Entry Flow|平台注册入口流/i);
  assert.match(readmeSource, /OAuth Login Flow|OAuth 登录流/i);
  assert.match(readmeSource, /Step 2[\s\S]*Step 3[\s\S]*Step 4[\s\S]*Step 5/i);
  assert.match(readmeSource, /Step 6[\s\S]*Step 7[\s\S]*Step 8[\s\S]*Step 9/i);
});

test('platform chat logout recovery forces the flow back to the platform login entry', () => {
  const signupSource = readProjectFile(path.join('content', 'signup-page.js'));

  assert.match(
    signupSource,
    /async function logoutFromPlatformChatSessionIfNeeded\(\) \{[\s\S]*await clickPlatformLogoutAction\(logoutLabel\);[\s\S]*await waitForPlatformLogoutRedirect\(\);[\s\S]*await ensurePlatformLoginEntryAfterLogout\(\);[\s\S]*Logged out of the existing platform chat session and returned to the login page/i
  );
  assert.match(
    signupSource,
    /async function ensurePlatformLoginEntryAfterLogout\([^)]*\) \{[\s\S]*location\.href = PLATFORM_LOGIN_ENTRY_URL;[\s\S]*Timed out waiting for the platform login entry after logout/i
  );
  assert.doesNotMatch(
    signupSource,
    /if \/\(auth\\\.openai\\\.com\\\/log-in\|platform\\\.openai\\\.com\\\/login\)\/i\.test\(location\.href\)\s*\{\s*return true;\s*\}/i
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

test('step 2 background fallback only completes once the platform login entry or signup flow is ready', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /function isStep2RecoveredAuthPageReady\(pageState = \{\}\) \{/i
  );
  assert.match(
    backgroundSource,
    /if \(hasVisibleVerificationInput \|\| hasVisibleProfileFormInput\) \{\s*return true;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /if \(!hasVisibleCredentialInput\) \{\s*return false;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /if \(\/platform\\\.openai\\\.com\\\/login\/i\.test\(url\)\) \{\s*return true;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /if \(\/\(\?:auth\|accounts\)\\\.openai\\\.com\\\/\(\?:u\\\/signup\\\/\|create-account\)\/i\.test\(url\)\) \{\s*return true;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /const authPageReady = isStep2RecoveredAuthPageReady\(pageState\);/i
  );
});

test('verification mail polling re-checks the auth page for phone verification blockers before retrying the inbox', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeVerificationMailStep\(step,\s*state,\s*options\)[\s\S]*if \(!noMailFound\) \{[\s\S]*throw err;[\s\S]*\}[\s\S]*const pageState = await getSignupAuthPageState\(\);[\s\S]*const blockerMessage = getVerificationMailStepPollingBlocker\(step,\s*pageState\);[\s\S]*if \(blockerMessage\) \{[\s\S]*throw new Error\(blockerMessage\);[\s\S]*\}[\s\S]*if \(!resendTriggered && inboxCheck >= resendAfterAttempts\)/i
  );
});

test('verification mail polling checks auth blockers during each inbox poll attempt and stops for phone or unsupported-email pages', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /function getVerificationMailStepPollingBlocker\(step,\s*pageState = \{\}\) \{[\s\S]*pageState\?\.requiresPhoneVerification[\s\S]*Step \$\{step\} blocked: auth page requires phone verification before the verification email step\.[\s\S]*pageState\?\.hasUnsupportedEmail[\s\S]*Step \$\{step\} blocked: email domain is unsupported on the auth page\.[\s\S]*return ''[\s\S]*async function assertVerificationMailStepNotBlockedDuringPolling\(step\) \{[\s\S]*const pageState = await getSignupAuthPageState\(\);[\s\S]*const blockerMessage = getVerificationMailStepPollingBlocker\(step,\s*pageState\);[\s\S]*if \(blockerMessage\) \{[\s\S]*throw new Error\(blockerMessage\);/i
  );
  assert.match(
    backgroundSource,
    /pollTmailorVerificationCode\(\{[\s\S]*onPollStart:\s*async \(event\) => \{[\s\S]*await assertVerificationMailStepNotBlockedDuringPolling\(step\);[\s\S]*\}[\s\S]*onPollAttempt:\s*async \(event\) => \{[\s\S]*await assertVerificationMailStepNotBlockedDuringPolling\(step\);/i
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

test('step 4 first retries the current verification page with the same code before falling back to a reload', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function submitVerificationCodeWithRecovery\(step,\s*code,\s*options\s*=\s*\{\}\) \{[\s\S]*tryDirectVerificationCodeFillOnCurrentSignupPage[\s\S]*recoverSignupPageFillCodeError[\s\S]*reloadIfSameUrl:\s*true/i
  );
});

test('signup auth page state distinguishes an unreachable tab from a real non-ready page', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function getSignupAuthPageState\(\) \{[\s\S]*if \(pageState\) \{[\s\S]*isReachable:\s*true[\s\S]*\.\.\.pageState[\s\S]*\}/i
  );
  assert.match(
    backgroundSource,
    /catch \{[\s\S]*const fallbackState = await getSignupPageFallbackAuthState\(\);[\s\S]*if \(fallbackState\) \{[\s\S]*return fallbackState;[\s\S]*\}[\s\S]*isReachable:\s*false[\s\S]*\}/i
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
    /if \(isStep3RecoveredAuthPageReady\(pageState\)\) \{[\s\S]*const payload = \{ recoveredAfterNavigation:\s*true \};[\s\S]*notifyStepComplete\(3,\s*payload\)/i
  );
  assert.match(
    backgroundSource,
    /pageState\?\.hasVisibleCredentialInput[\s\S]*isExistingAccountLoginPasswordPageUrl\(pageState\?\.url\)[\s\S]*!\s*pageState\?\.hasVisibleSignupRegistrationChoice[\s\S]*const payload = \{[\s\S]*recoveredAfterNavigation:\s*true,[\s\S]*existingAccountLogin:\s*true[\s\S]*\};[\s\S]*Existing-account login password page is already visible after the navigation interrupt[\s\S]*notifyStepComplete\(3,\s*payload\)/i
  );
});

test('step 3 background fallback only accepts stable post-credential signup pages', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /function isStep3RecoveredAuthPageReady\(pageState = \{\}\) \{/i
  );
  assert.match(
    backgroundSource,
    /if \(pageState\?\.hasReadyVerificationPage \|\| pageState\?\.hasReadyProfilePage\) \{\s*return true;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /if \(pageState\?\.hasVisibleCredentialInput\) \{\s*return false;\s*\}/i
  );
  assert.match(
    backgroundSource,
    /return isCanonicalEmailVerificationUrl\(pageState\?\.url\)\s*\|\|\s*isCanonicalAboutYouUrl\(pageState\?\.url\);/i
  );
  assert.doesNotMatch(
    backgroundSource,
    /const advancedPastCredentialForm = Boolean\([\s\S]*pageState\?\.url[\s\S]*!\s*pageState\?\.hasVisibleCredentialInput/i
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

test('step 3 recovery reopens step 2 in signup-entry mode before retrying credentials', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function recoverStep3PlatformLogin\(error,\s*options = \{\}\) \{[\s\S]*Reopening the platform login page[\s\S]*await executeStep2\(state,\s*\{[\s\S]*preferSignupEntry:\s*true[\s\S]*\}\);/i
  );
});

test('step 3 timeout recovery also reopens the platform login page in signup-entry mode', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function recoverStep3OauthTimeout\(\) \{[\s\S]*Reopening the platform login page[\s\S]*await executeStep2\(state,\s*\{[\s\S]*preferSignupEntry:\s*true[\s\S]*\}\);/i
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

test('step 6 ignores localhost redirect-driven signup page disconnects and keeps waiting for completion', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeStep6\(state\) \{[\s\S]*try \{[\s\S]*await sendToContentScript\('signup-page', \{[\s\S]*step:\s*6[\s\S]*\}\);[\s\S]*\} catch \(err\) \{[\s\S]*isMessageChannelClosedError\([\s\S]*isReceivingEndMissingError\([\s\S]*waitForStep6CompletionSignalOrRecoveredAuthState\(\);[\s\S]*throw err;[\s\S]*\}[\s\S]*\}/i
  );
});

test('step 6 background fallback completes when the auth flow already redirected to localhost', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function waitForStep6CompletionSignalOrRecoveredAuthState\(\) \{/i
  );
  assert.match(
    backgroundSource,
    /const signupTabId = await getTabId\('signup-page'\);[\s\S]*const tab = await chrome\.tabs\.get\(signupTabId\)[\s\S]*isLocalhostCallbackUrl\(tab\?\.url\)[\s\S]*setState\(\{\s*localhostUrl:\s*tab\.url\s*\}\)[\s\S]*notifyStepComplete\(6,\s*\{[\s\S]*recoveredAfterNavigation:\s*true[\s\S]*localhostUrl:\s*tab\.url[\s\S]*\}\)/i
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

test('step 8 falls back to an in-page consent submit when the continue button stays covered or consent keeps stalling', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function tryStep8ConsentSubmitFallback\(/i
  );
  assert.match(
    backgroundSource,
    /type:\s*'STEP8_TRY_SUBMIT'/i
  );
  assert.match(
    backgroundSource,
    /clickResult\?\.hitTargetBlocked[\s\S]*tryStep8ConsentSubmitFallback\(/i
  );
  assert.match(
    backgroundSource,
    /elapsedMs >= 20000[\s\S]*tryStep8ConsentSubmitFallback\(/i
  );
});

test('steps 7-9 replay from step 6 once before failing the run', () => {
  const backgroundSource = readProjectFile('background.js');
  const runtimeErrorsSource = readProjectFile(path.join('shared', 'runtime-errors.js'));

  assert.match(
    runtimeErrorsSource,
    /function shouldRetryStep7Through9FromStep6\(step,\s*error\)/i
  );
  assert.match(
    backgroundSource,
    /const recoveredStep7Through9FromStep6 = Boolean\(recoveryState && recoveryState !== true && recoveryState\.step7Through9FromStep6\);/i
  );
  assert.match(
    backgroundSource,
    /if \(\[7,\s*8,\s*9\]\.includes\(step\) && !recoveredStep7Through9FromStep6 && shouldRetryStep7Through9FromStep6\(step,\s*err\)\)[\s\S]*await replaySteps6ThroughTargetStepWithCurrentAccount\([\s\S]*return;/i
  );
  assert.match(
    backgroundSource,
    /async function replaySteps6ThroughTargetStepWithCurrentAccount\(targetStep,\s*logMessage,\s*recoveryState = \{\}\) \{[\s\S]*await executeStepAndWait\(6,\s*2000\);[\s\S]*for \(let replayStep = 7; replayStep <= targetStep; replayStep\+\+\)/i
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

test('step 5 completion is revalidated against the live auth page before the background accepts success', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function waitForStep5AuthStateToSettle\(timeoutMs = 12000\) \{/i
  );
  assert.match(
    backgroundSource,
    /waitForStep5AuthStateToSettle\(timeoutMs = 12000\) \{[\s\S]*if \(pageState\?\.isReachable === false\)[\s\S]*await sleepWithStop\(250\);[\s\S]*continue;/i
  );
  assert.match(
    backgroundSource,
    /async function validateStep5CompletionBeforeAcceptingSuccess\(payload = \{\}\) \{[\s\S]*const pageState = await waitForStep5AuthStateToSettle\(\);/i
  );
  assert.match(
    backgroundSource,
    /case 'STEP_COMPLETE': \{[\s\S]*if \(message\.step === 5\) \{[\s\S]*await validateStep5CompletionBeforeAcceptingSuccess\(message\.payload\);[\s\S]*\}[\s\S]*await setStepStatus\(message\.step,\s*'completed'\);/i
  );
  assert.match(
    backgroundSource,
    /validateStep5CompletionBeforeAcceptingSuccess\(payload = \{\}\) \{[\s\S]*const pageState = await waitForStep5AuthStateToSettle\(\);[\s\S]*pageState\?\.hasUnsupportedEmail[\s\S]*pageState\?\.hasReadyProfilePage[\s\S]*pageState\?\.hasVisibleProfileFormInput/i
  );
});

test('step 5 keeps waiting for completion when the profile submit navigation disconnects before the content response returns', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeStep5\(state\) \{[\s\S]*try \{[\s\S]*await sendToContentScript\('signup-page', \{[\s\S]*step:\s*5[\s\S]*\}\);[\s\S]*\} catch \(err\) \{[\s\S]*isMessageChannelClosedError\([\s\S]*isReceivingEndMissingError\([\s\S]*waitForStep5CompletionSignalOrRecoveredAuthState\(\);[\s\S]*throw err;[\s\S]*\}[\s\S]*\}/i
  );
  assert.match(
    backgroundSource,
    /async function waitForStep5CompletionSignalOrRecoveredAuthState\(\) \{/i
  );
  assert.match(
    backgroundSource,
    /platform\.openai\.com\/welcome\?step=create[\s\S]*Step 5: Auth page already advanced beyond the profile form after the navigation interrupt[\s\S]*notifyStepComplete\(5,\s*\{[\s\S]*recoveredAfterNavigation:\s*true[\s\S]*\}\)/i
  );
});

test('step 5 background validation treats the platform welcome landing page as a successful fallback when the content script is temporarily unreachable', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /function isStableStep5SuccessUrl\(url = ''\) \{[\s\S]*parsed\.hostname !== 'platform\.openai\.com'/i
  );
  assert.match(
    backgroundSource,
    /function isStableStep5SuccessUrl\(url = ''\) \{[\s\S]*parsed\.searchParams\.get\('step'\) === 'create'/i
  );
  assert.match(
    backgroundSource,
    /async function getSignupPageFallbackAuthState\(\) \{[\s\S]*const signupTabId = await getTabId\('signup-page'\);[\s\S]*const signupTab = await chrome\.tabs\.get\(signupTabId\)\.catch\(\(\) => null\);[\s\S]*if \(!isStableStep5SuccessUrl\(signupTab\?\.url\)\) \{[\s\S]*return null;[\s\S]*\}[\s\S]*isReachable:\s*true[\s\S]*url:\s*signupTab\.url/i
  );
  assert.match(
    backgroundSource,
    /async function getSignupAuthPageState\(\) \{[\s\S]*catch \{[\s\S]*const fallbackState = await getSignupPageFallbackAuthState\(\);[\s\S]*if \(fallbackState\) \{[\s\S]*return fallbackState;[\s\S]*\}[\s\S]*return \{[\s\S]*isReachable:\s*false/i
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

test('step 7 checks the auth page blocker state before opening TMailor inbox polling', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function executeStep7\(state\) \{[\s\S]*const effectiveState = await ensureSignupPageReadyForVerification\(state,\s*7\);[\s\S]*await executeVerificationMailStep\(7,\s*effectiveState,\s*\{/i
  );
});

test('stopping auto-run prevents step 1 from continuing into TMailor fallback work after an in-flight API failure', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function fetchTmailorEmail\(options = \{\}\) \{[\s\S]*await addLog\('TMailor: Requesting a new mailbox via API\.\.\.',\s*'info'\);[\s\S]*catch \(err\) \{[\s\S]*\}[\s\S]*throwIfStopped\(\);[\s\S]*await addLog\(`TMailor: Opening mailbox page \(\$\{generateNew \? 'generate new' : 'reuse current'\}\)\.\.\.`\);/i
  );
});

test('auto run phase 1 rethrows stop requests instead of downgrading them into waiting-email pauses', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /let emailReady = false;[\s\S]*try \{[\s\S]*const nextEmail = await fetchEmailAddress\(\{ generateNew: true \}\);[\s\S]*\} catch \(err\) \{[\s\S]*if \(isStopError\(err\)\) \{\s*throw err;\s*\}[\s\S]*auto-fetch failed: \$\{err\.message\}/i
  );
});

test('background seeds content flow control sequences from a time-based baseline so fresh commands survive worker restarts', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /let contentFlowControlSequence = Date\.now\(\)\s*\*\s*1000;/i
  );
});

test('stopping auto-run prevents new content-script commands from being queued or dispatched', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(
    backgroundSource,
    /async function sendToContentScript\(source,\s*message\) \{[\s\S]*throwIfStopped\(\);[\s\S]*const nextMessage = attachContentFlowControlSequence\(message\);/i
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
