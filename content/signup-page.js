// content/signup-page.js — Content script for OpenAI auth pages (steps 2, 3, 4-receive, 5)
// Injected on: auth0.openai.com, auth.openai.com, accounts.openai.com, platform.openai.com

(function() {
if (window.__MULTIPAGE_SIGNUP_PAGE_LOADED) {
  console.log('[Infinitoai:signup-page] Content script already loaded on', location.href);
  return;
}
window.__MULTIPAGE_SIGNUP_PAGE_LOADED = true;

console.log('[Infinitoai:signup-page] Content script loaded on', location.href);
const { isVerificationCodeRejectedText, isVerificationRetryStateText } = VerificationCode;
const { getPhoneVerificationBlockedMessage, isPhoneVerificationRequiredText } = PhoneVerification;
const {
  getAuthOperationTimedOutMessage,
  getUnsupportedCountryRegionTerritoryMessage,
  isAuthFatalErrorText,
  isAuthOperationTimedOutText,
  isUnsupportedCountryRegionTerritoryText,
} = AuthFatalErrors;
const { getUnsupportedEmailBlockedMessage, isUnsupportedEmailBlockingStep, isUnsupportedEmailText } = UnsupportedEmail;

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_STEP' || message.type === 'FILL_CODE' || message.type === 'STEP8_FIND_AND_CLICK' || message.type === 'STEP8_TRY_SUBMIT' || message.type === 'CLICK_RESEND_EMAIL' || message.type === 'CHECK_AUTH_PAGE_STATE') {
    resetStopState(message.controlSequence);
    handleCommand(message).then((result) => {
      sendResponse({ ok: true, ...(result || {}) });
    }).catch(err => {
      if (isStopError(err)) {
        log(`Step ${message.step || 8}: Stopped by user.`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }

      if (message.type === 'STEP8_FIND_AND_CLICK' || message.type === 'STEP8_TRY_SUBMIT') {
        log(`Step 8: ${err.message}`, 'error');
        sendResponse({ error: err.message });
        return;
      }

      reportError(message.step, err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleCommand(message) {
  switch (message.type) {
    case 'EXECUTE_STEP':
      switch (message.step) {
        case 2: return await step2_clickRegister();
        case 3: return await step3_fillEmailPassword(message.payload);
        case 5: return await step5_fillNameBirthday(message.payload);
        case 6: return await step6_login(message.payload);
        case 8: return await step8_findAndClick();
        default: throw new Error(`signup-page.js does not handle step ${message.step}`);
      }
    case 'FILL_CODE':
      // Step 4 = signup code, Step 7 = login code (same handler)
      return await fillVerificationCode(message.step, message.payload);
    case 'CLICK_RESEND_EMAIL':
      return await clickResendEmail(message.step);
    case 'STEP8_FIND_AND_CLICK':
      return await step8_findAndClick();
    case 'STEP8_TRY_SUBMIT':
      return await step8_trySubmit();
    case 'CHECK_AUTH_PAGE_STATE':
      return getAuthPageState();
  }
}

// ============================================================
// Step 2: Click Register
// ============================================================

const CREDENTIAL_INPUT_SELECTORS = [
  'input#login-email',
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input[autocomplete*="username"]',
  'input[inputmode="email"]',
  'input[id*="email"]',
  'input[placeholder*="email"]',
  'input[placeholder*="Email"]',
  'input[type="password"]',
];

const CREDENTIAL_INPUT_SELECTOR = CREDENTIAL_INPUT_SELECTORS.join(', ');
const PLATFORM_LOGIN_ENTRY_URL = 'https://platform.openai.com/login';
const AUTH_LOGIN_HOME_URL = 'https://auth.openai.com/log-in';
const PLATFORM_SIGNING_BRIDGE_ISSUE_TIMEOUT_MS = 45000;

async function step2_clickRegister() {
  log('Step 2: Looking for Register/Sign up button...');
  throwIfUnsupportedCountryRegionTerritoryBlocked(2);

  await waitForPlatformEntryStateToSettle();
  await logoutFromPlatformChatSessionIfNeeded();

  if (isDirectSignupFormVisible()) {
    log('Step 2: Official signup form is already visible. Continuing without clicking Register.', 'info');
    reportComplete(2);
    return;
  }

  if (isCreateAccountSessionEndedPage()) {
    const loginEntryButton = await waitForElementByText(
      'a, button, [role="button"], [role="link"]',
      /登录|log\s*in|continue|继续/i,
      5000
    ).catch(() => null);

    if (loginEntryButton) {
      await humanPause(450, 1200);
      await reportStepCompleteBeforePotentialNavigation(2);
      simulateClick(loginEntryButton);
      log('Step 2: create-account opened a session-ended landing page, clicked the primary continue/login button.', 'warn');
      return;
    }
  }

  const registerBtn = await findStep2RegisterButtonWithRecovery();
  if (!registerBtn) {
    log('Step 2: Official signup form is already visible after auth-issue recovery. Continuing without clicking Register.', 'info');
    reportComplete(2);
    return;
  }

  await humanPause(450, 1200);
  await reportStepCompleteBeforePotentialNavigation(2);
  simulateClick(registerBtn);
  log('Step 2: Clicked Register button');
}

async function findStep2RegisterButtonWithRecovery() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await waitForElementByText(
        'a, button, [role="button"], [role="link"]',
        /sign\s*up|register|create\s*account|注册/i,
        10000
      );
    } catch {}

    // Some pages may have a direct link
    try {
      return await waitForElement('a[href*="signup"], a[href*="register"]', 5000);
    } catch {}

    if (isDirectSignupFormVisible()) {
      return null;
    }

    const recoveredFromIssuePage = await recoverPlatformEntryFromAuthIssueIfNeeded();
    if (!recoveredFromIssuePage) {
      break;
    }

    await waitForPlatformEntryStateToSettle(5000);
    if (isDirectSignupFormVisible()) {
      return null;
    }
  }

  throw new Error(
    'Could not find Register/Sign up button. ' +
    'Check auth page DOM in DevTools. URL: ' + location.href
  );
}

async function reportStepCompleteBeforePotentialNavigation(step, data) {
  try {
    await Promise.race([
      Promise.resolve(reportComplete(step, data)).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 150)),
    ]);
  } catch {
    reportComplete(step, data);
  }
}

function isPlatformLoginEntryPage() {
  return /platform\.openai\.com\/login/i.test(location.href);
}

function isPlatformHomeRedirectPage() {
  return /platform\.openai\.com\/home/i.test(location.href);
}

function isPlatformAuthCallbackPage() {
  return /platform\.openai\.com\/auth\/callback/i.test(location.href);
}

function isPlatformSigningInStateText(text = getVisiblePageText()) {
  return /signing in/i.test(String(text || ''));
}

function isPlatformSigningBridgeState(text = getVisiblePageText()) {
  return isPlatformHomeRedirectPage()
    || isPlatformAuthCallbackPage()
    || isPlatformSigningInStateText(text);
}

async function waitForPlatformEntryStateToSettle(timeout = 8000) {
  if (!(isPlatformLoginEntryPage() || isPlatformHomeRedirectPage() || isPlatformChatSessionPage() || isPlatformAuthCallbackPage() || isAuthReturnHomeIssueText(getVisiblePageText()))) {
    return null;
  }

  const start = Date.now();
  let sawPlatformRedirect = false;
  let lastHeartbeatAt = 0;
  let waitingForIssueRecovery = isPlatformSigningBridgeState(getVisiblePageText());

  while (Date.now() - start < (waitingForIssueRecovery ? Math.max(timeout, PLATFORM_SIGNING_BRIDGE_ISSUE_TIMEOUT_MS) : timeout)) {
    throwIfStopped();
    const visibleText = getVisiblePageText();
    const elapsedMs = Date.now() - start;

    if (await recoverPlatformEntryFromAuthIssueIfNeeded(visibleText)) {
      sawPlatformRedirect = true;
      waitingForIssueRecovery = false;
      continue;
    }

    if (isPlatformChatSessionPage()) {
      return 'chat';
    }

    if (isDirectSignupFormVisible()) {
      return 'login';
    }

    if (isPlatformSigningBridgeState(visibleText)) {
      sawPlatformRedirect = true;
      waitingForIssueRecovery = true;
      if (elapsedMs - lastHeartbeatAt >= 5000) {
        lastHeartbeatAt = elapsedMs;
        log(
          `Step 2: Platform entry is still waiting on the signing-in bridge after ${Math.max(1, Math.round(elapsedMs / 1000))}s. URL: ${location.href}`,
          'info'
        );
      }
    }

    await sleep(250);
  }

  if (isPlatformChatSessionPage()) {
    return 'chat';
  }

  if (isDirectSignupFormVisible()) {
    return 'login';
  }

  const finalVisibleText = getVisiblePageText();
  if (await recoverPlatformEntryFromAuthIssueIfNeeded(finalVisibleText)) {
    return 'recovered';
  }

  if (isPlatformAuthCallbackPage() || isPlatformSigningInStateText(finalVisibleText)) {
    log(
      'Step 2: Platform entry stayed on the stale signing-in bridge without surfacing the return-home recovery page. Leaving the page as-is so the background retry can reopen platform login cleanly.',
      'warn'
    );
    return null;
  }

  if (sawPlatformRedirect) {
    log('Step 2: Platform entry stayed on the redirect bridge longer than expected. Proceeding with the current page state...', 'warn');
  }

  return null;
}

async function recoverPlatformEntryFromAuthIssueIfNeeded(visibleText = getVisiblePageText()) {
  if (!isAuthReturnHomeIssueText(visibleText)) {
    return false;
  }

  const returnHomeLink = await waitForElementByText(
    'a, button, [role="button"], [role="link"]',
    /返回首页|return home|back to home|home/i,
    2000
  ).catch(() => null);

  if (!returnHomeLink || !isElementVisible(returnHomeLink)) {
    return false;
  }

  await humanPause(350, 900);
  simulateClick(returnHomeLink);
  await sleep(500);
  log('Step 2: Platform entry hit the auth issue page. Clicked "返回首页" before reopening the platform login entry...', 'warn');
  location.href = PLATFORM_LOGIN_ENTRY_URL;
  await sleep(500);
  return true;
}

async function logoutFromPlatformChatSessionIfNeeded() {
  if (!isPlatformChatSessionPage()) {
    return false;
  }

  log('Step 2: Platform login entry redirected into an active chat session. Logging out first...', 'warn');

  const accountMenuButton = await ensurePlatformAccountMenuButtonVisible(10000);

  if (!accountMenuButton) {
    throw new Error('Platform chat session is already signed in, but the account menu button could not be found for logout.');
  }

  const logoutLabel = await openPlatformAccountMenu(accountMenuButton);

  if (!logoutLabel) {
    throw new Error('Platform chat session is already signed in, but the logout action did not appear after opening the account menu.');
  }

  await clickPlatformLogoutAction(logoutLabel);
  await waitForPlatformLogoutRedirect();
  log('Step 2: Logged out of the existing platform chat session and returned to the login page.', 'warn');
  return true;
}

function isPlatformChatSessionPage() {
  return /platform\.openai\.com\/chat/i.test(location.href);
}

function isPlatformResponsiveShellMenuButton(button) {
  if (!button || !isElementVisible(button)) {
    return false;
  }

  if (button.getAttribute?.('aria-haspopup') === 'menu') {
    return false;
  }

  if (typeof button.className === 'string' && /\bp9Ilg\b/.test(button.className)) {
    return true;
  }

  return Boolean(
    button.querySelector?.('[data-top="true"]')
    && button.querySelector?.('[data-bottom="true"]')
  );
}

function findPlatformResponsiveShellMenuButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find((button) => isPlatformResponsiveShellMenuButton(button)) || null;
}

function findPlatformAccountMenuButton() {
  const selectors = [
    'button[aria-haspopup="menu"]',
    'button[id^="radix-"][aria-haspopup="menu"]',
    'button[id^="radix-"]',
  ];

  for (const selector of selectors) {
    const matches = Array.from(document.querySelectorAll(selector));
    const found = matches.find((button) => {
      if (!isElementVisible(button) || isPlatformResponsiveShellMenuButton(button)) {
        return false;
      }
      const ariaHaspopup = String(button.getAttribute?.('aria-haspopup') || '').toLowerCase();
      const ariaExpanded = String(button.getAttribute?.('aria-expanded') || '').toLowerCase();
      const dataState = String(button.getAttribute?.('data-state') || '').toLowerCase();
      return ariaHaspopup === 'menu'
        || ariaExpanded === 'true'
        || ariaExpanded === 'false'
        || dataState === 'open'
        || dataState === 'closed';
    });
    if (found) {
      return found;
    }
  }

  return null;
}

function normalizePlatformMenuText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function summarizeVisibleTextForLog(value, maxLength = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 3))}...`;
}

function isExactPlatformLogoutText(value) {
  return /^(?:log\s*out|退出登录|退出)$/i.test(normalizePlatformMenuText(value));
}

function findPlatformLogoutLabel() {
  const candidates = Array.from(document.querySelectorAll('button, [role="menuitem"], [role="button"], a, div, span'));
  const exactMatches = candidates.filter((el) => isElementVisible(el) && isExactPlatformLogoutText(el.textContent || ''));
  const preferredMatch = exactMatches.find((el) => /\bwU7SW\b/.test(String(el.className || '')));
  return preferredMatch || exactMatches[0] || null;
}

function isPlatformAccountMenuExpanded(button) {
  if (findPlatformLogoutLabel()) {
    return true;
  }

  if (!button) {
    return false;
  }

  const expanded = String(button.getAttribute?.('aria-expanded') || '').toLowerCase();
  const state = String(button.getAttribute?.('data-state') || '').toLowerCase();
  return expanded === 'true' || state === 'open';
}

function dispatchPointerClickSequence(target) {
  if (!target) {
    return;
  }

  target.focus?.();
  const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  for (const type of eventTypes) {
    target.dispatchEvent?.(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: type === 'pointerdown' || type === 'mousedown' ? 1 : 0,
    }));
  }
}

async function waitForPlatformAccountMenuOpen(button, timeout = 1500) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const logoutLabel = findPlatformLogoutLabel();
    if (logoutLabel) {
      return logoutLabel;
    }

    if (isPlatformAccountMenuExpanded(button)) {
      return findPlatformLogoutLabel();
    }

    await sleep(100);
  }

  return findPlatformLogoutLabel();
}

async function waitForPlatformAccountMenuButton(timeout = 1800) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const button = findPlatformAccountMenuButton();
    if (button) {
      return button;
    }
    await sleep(100);
  }

  return findPlatformAccountMenuButton();
}

async function openPlatformResponsiveShellMenu(button) {
  await humanPause(300, 850);
  simulateClick(button);

  let accountButton = await waitForPlatformAccountMenuButton(1200);
  if (accountButton) {
    return accountButton;
  }

  log('Step 2: Platform shell menu did not reveal the avatar after the first click. Retrying with a low-level pointer sequence...', 'warn');
  dispatchPointerClickSequence(button);
  accountButton = await waitForPlatformAccountMenuButton(1800);
  return accountButton;
}

async function ensurePlatformAccountMenuButtonVisible(timeout = 10000) {
  const start = Date.now();
  let shellMenuAttempted = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const accountButton = findPlatformAccountMenuButton();
    if (accountButton) {
      return accountButton;
    }

    const shellMenuButton = findPlatformResponsiveShellMenuButton();
    if (shellMenuButton && !shellMenuAttempted) {
      shellMenuAttempted = true;
      log('Step 2: Platform chat is using the responsive shell menu. Opening it before looking for the avatar menu...', 'info');
      const revealedAccountButton = await openPlatformResponsiveShellMenu(shellMenuButton);
      if (revealedAccountButton) {
        return revealedAccountButton;
      }
    }

    await sleep(150);
  }

  return findPlatformAccountMenuButton();
}

async function openPlatformAccountMenu(button) {
  await humanPause(400, 1100);
  simulateClick(button);

  let logoutLabel = await waitForPlatformAccountMenuOpen(button, 1200);
  if (logoutLabel) {
    return logoutLabel;
  }

  log('Step 2: Platform account menu did not open after the first avatar click. Retrying with a low-level pointer sequence...', 'warn');
  dispatchPointerClickSequence(button);
  logoutLabel = await waitForPlatformAccountMenuOpen(button, 1800);
  return logoutLabel;
}

function resolveLogoutMenuTarget(el) {
  return el?.closest?.('[id^="radix-"], [data-radix-collection-item], button, [role="menuitem"], [role="button"], a, li')
    || el?.parentElement?.closest?.('[id^="radix-"], [data-radix-collection-item], button, [role="menuitem"], [role="button"], a, li')
    || el?.parentElement
    || el;
}

async function clickPlatformLogoutAction(logoutLabel) {
  const target = resolveLogoutMenuTarget(logoutLabel);

  await humanPause(350, 1000);
  simulateClick(target);

  await sleep(200);
  if (!isPlatformChatSessionPage()) {
    return true;
  }

  log('Step 2: Logout menu item did not navigate away after the first click. Retrying with a low-level pointer sequence...', 'warn');
  dispatchPointerClickSequence(target);
  await sleep(250);
  return !isPlatformChatSessionPage();
}

async function waitForPlatformLogoutRedirect(timeout = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    if (/(auth\.openai\.com\/log-in|platform\.openai\.com\/login)/i.test(location.href)) {
      return true;
    }

    await sleep(250);
  }

  throw new Error('Timed out waiting for the platform chat logout redirect to return to the login page.');
}

function throwIfUnsupportedCountryRegionTerritoryBlocked(step, text = getVisiblePageText()) {
  if (isUnsupportedCountryRegionTerritoryText(text)) {
    throw new Error(getUnsupportedCountryRegionTerritoryMessage(step));
  }
}

function isDirectSignupFormVisible() {
  if (!/(platform\.openai\.com\/login|create-account|\/u\/signup\/|\/log-?in)/i.test(location.href)) {
    return false;
  }
  return hasVisibleCredentialInput();
}

function isCreateAccountSessionEndedPage(text = getVisiblePageText()) {
  if (!/create-account/i.test(location.href)) {
    return false;
  }

  return /你的会话已结束|session has ended|session ended|登录以继续|log in to continue|chatgpt\.com/i.test(text);
}

// ============================================================
// Step 3: Fill Email & Password
// ============================================================

async function step3_fillEmailPassword(payload) {
  const { email } = payload;
  if (!email) throw new Error('No email provided. Paste email in Side Panel first.');

  throwIfAuthOperationTimedOut(3);
  log(`Step 3: Filling email: ${email}`);

  // Find email input
  let emailInput = null;
  try {
    emailInput = await waitForElement(
      CREDENTIAL_INPUT_SELECTOR,
      10000
    );
  } catch {
    if (await handleAuthReturnHomeRecovery(3)) {
      throw new Error(getAuthReturnHomeRecoveryErrorMessage(3));
    }
    throwIfAuthOperationTimedOut(3);
    if (isBlockingAuthFatalError(getVisiblePageText())) {
      throw new Error('Auth fatal error page detected before the email input appeared.');
    }
    throw new Error('Could not find email input field on signup page. URL: ' + location.href);
  }

  await humanPause(500, 1400);
  fillInput(emailInput, email);
  log('Step 3: Email filled');

  const inlineCredentialChoice = findStep3ImmediateCredentialChoice();
  if (inlineCredentialChoice?.passwordInput) {
    if (isSignupFlowUnexpectedlyOnLoginPasswordPage()) {
      log('Step 3: Signup flow fell back to the existing-account login password page. Preserving the current email/password and continuing with the login flow instead of requesting a signup code.', 'warn');
      reportComplete(3, { email, existingAccountLogin: true });
      return;
    }
    log('Step 3: Password field is already visible on the same page. Filling password before the first continue click...');
    const submissionStartUrl = await submitStep3WithPassword(payload, inlineCredentialChoice.passwordInput);
    await waitForStep3CredentialSubmissionOutcome(submissionStartUrl);
    reportComplete(3, { email });
    return;
  }
  if (inlineCredentialChoice?.otpButton) {
    await humanPause(450, 1200);
    simulateClick(inlineCredentialChoice.otpButton);
    log('Step 3: Selected one-time-code login for registration.');
    reportComplete(3, { email, usesOneTimeCode: true });
    return;
  }

  log('Step 3: Submitting email and checking whether one-time-code login is available...');
  const emailSubmitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|next|submit|继续|下一步/i, 5000).catch(() => null);

  if (emailSubmitBtn) {
    await humanPause(400, 1100);
    simulateClick(emailSubmitBtn);
    log('Step 3: Submitted email, waiting for passwordless login or password field...');
    await sleep(2000);
  }

  const passwordlessChoice = await waitForPasswordlessOrPasswordField();
  if (passwordlessChoice?.otpButton) {
    await humanPause(450, 1200);
    simulateClick(passwordlessChoice.otpButton);
    log('Step 3: Selected one-time-code login for registration.');
    reportComplete(3, { email, usesOneTimeCode: true });
    return;
  }

  const passwordInput = passwordlessChoice?.passwordInput || null;
  if (!passwordInput) {
    if (await handleAuthReturnHomeRecovery(3)) {
      throw new Error(getAuthReturnHomeRecoveryErrorMessage(3));
    }
    throwIfAuthOperationTimedOut(3);
    if (isBlockingAuthFatalError(getVisiblePageText())) {
      throw new Error('Auth fatal error page detected before the password input appeared.');
    }
    throw new Error('Could not find passwordless-login button or password input after submitting email. URL: ' + location.href);
  }

  if (isSignupFlowUnexpectedlyOnLoginPasswordPage()) {
    log('Step 3: Email submit landed on the existing-account login password page. Preserving the current email/password and continuing with the login flow instead of requesting a signup code.', 'warn');
    reportComplete(3, { email, existingAccountLogin: true });
    return;
  }

  if (!payload.password) throw new Error('No password provided. Step 3 requires a generated password.');
  const submissionStartUrl = await submitStep3WithPassword(payload, passwordInput);
  await waitForStep3CredentialSubmissionOutcome(submissionStartUrl);
  reportComplete(3, { email });
}

function isSignupFlowUnexpectedlyOnLoginPasswordPage() {
  return /(?:auth|accounts)\.openai\.com\/log-?in\/password/i.test(location.href)
    && Boolean(findVisiblePasswordInput());
}

function throwIfAuthOperationTimedOut(step, text = getVisiblePageText()) {
  if (isBlockingAuthOperationTimedOut(text)) {
    throw new Error(getAuthOperationTimedOutMessage(step));
  }
}

// ============================================================
// Click "重新发送电子邮件" (used before step 4 and step 7 polling)
// ============================================================

async function clickResendEmail(step) {
  log(`Step ${step}: Looking for "重新发送电子邮件" button...`);

  let resendBtn = null;
  try {
    resendBtn = await waitForElementByText(
      'a, button, [role="button"], [role="link"], span',
      /重新发送电子邮件|resend\s*email/i,
      10000
    );
  } catch {
    log(`Step ${step}: "重新发送电子邮件" button not found, skipping`, 'warn');
    return;
  }

  // Prevent parent form POST submission (Remix/React Router route without action)
  const parentForm = resendBtn.closest('form');
  const blockSubmit = (e) => e.preventDefault();
  if (parentForm) parentForm.addEventListener('submit', blockSubmit, { once: true });

  await humanPause(400, 1000);
  resendBtn.click();
  log(`Step ${step}: Clicked "重新发送电子邮件"`, 'ok');
  await sleep(2000);

  if (parentForm) parentForm.removeEventListener('submit', blockSubmit);
}

// ============================================================
// Fill Verification Code (used by step 4 and step 7)
// ============================================================

async function fillVerificationCode(step, payload) {
  const { code } = payload;
  if (!code) throw new Error('No verification code provided.');

  log(`Step ${step}: Filling verification code: ${code}`);

  // Find code input — could be a single input or multiple separate inputs
  let codeInput = null;
  try {
    codeInput = await waitForElement(
      'input[name="code"], input[name="otp"], input[type="text"][maxlength="6"], input[aria-label*="code"], input[placeholder*="code"], input[placeholder*="Code"], input[inputmode="numeric"]',
      10000
    );
  } catch {
    // Check for multiple single-digit inputs (common pattern)
    const singleInputs = document.querySelectorAll('input[maxlength="1"]');
    if (singleInputs.length >= 6) {
      log(`Step ${step}: Found single-digit code inputs, filling individually...`);
      for (let i = 0; i < 6 && i < singleInputs.length; i++) {
        fillInput(singleInputs[i], code[i]);
        await sleep(100);
      }
      await sleep(400);
      return await submitVerificationCodeAndWait(step, singleInputs[0] || null);
    }
    const visibleText = getVisiblePageText();
    if (step === 7 && /email-verification/i.test(location.href) && isVerificationRetryStateText(visibleText)) {
      throw new Error('Verification page entered retry state before the code input appeared. Restart this run.');
    }
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected before verification code input appeared.');
    }
    if (step === 7 && isPhoneVerificationRequiredText(visibleText, location.href)) {
      throw new Error(getPhoneVerificationBlockedMessage(step));
    }
    throw new Error('Could not find verification code input. URL: ' + location.href);
  }

  fillInput(codeInput, code);
  log(`Step ${step}: Code filled`);

  return await submitVerificationCodeAndWait(step, codeInput);
}

async function submitVerificationCodeAndWait(step, submitInput = null) {
  const hadRejectedStateBeforeSubmit = isVerificationCodeRejectedText(getVisiblePageText());
  let submitAttempted = await triggerVerificationSubmit(step, submitInput);
  let outcome = await waitForVerificationSubmissionOutcome(step, hadRejectedStateBeforeSubmit);

  if (outcome.retrySubmit) {
    log(`Step ${step}: Verification form is still visible after waiting. Retrying submit once...`, 'warn');
    submitAttempted = await triggerVerificationSubmit(step, submitInput, { retry: true }) || submitAttempted;
    outcome = await waitForVerificationSubmissionOutcome(step, hadRejectedStateBeforeSubmit);
  }

  if (step === 4 && outcome.retrySubmit && submitAttempted) {
    log(`Step ${step}: Verification form is still visible after submit retries. Waiting briefly for delayed acceptance...`, 'warn');
    outcome = await waitForVerificationSubmissionOutcome(step, hadRejectedStateBeforeSubmit, 3000);
  }

  if (outcome.retryInbox) {
    log(`Step ${step}: Page rejected the code. Returning to inbox refresh.`, 'warn');
    return outcome;
  }
  if (outcome.retrySubmit || (submitAttempted && hasActiveVerificationInput())) {
    throw new Error(`Verification form stayed visible after submit attempts. URL: ${location.href}`);
  }

  reportComplete(step);
  return outcome;
}

async function triggerVerificationSubmit(step, submitInput = null, options = {}) {
  const { retry = false } = options;
  await sleep(500);
  const submitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /verify|confirm|submit|continue|确认|验证/i, 5000).catch(() => null);

  if (submitBtn) {
    const readiness = await waitForVerificationSubmitReady(submitBtn);
    if (readiness === 'enabled') {
      await humanPause(450, 1200);
      simulateClick(submitBtn);
      log(`Step ${step}: Verification submitted${retry ? ' again' : ''}`);
      return true;
    }
    if (readiness === 'advanced') {
      return true;
    }
  }

  if (submitVerificationCodeWithFallback(submitInput)) {
    log(
      `Step ${step}: Verification button did not become clickable. Submitted the verification form via a fallback Enter key sequence${retry ? ' on retry' : ''}.`,
      'warn'
    );
    return true;
  }

  return false;
}

async function waitForVerificationSubmitReady(button, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    if (isButtonEnabled(button)) {
      return 'enabled';
    }
    if (!hasActiveVerificationInput()) {
      return 'advanced';
    }

    await sleep(150);
  }

  return 'timeout';
}

function submitVerificationCodeWithFallback(codeInput) {
  const form = codeInput?.form || codeInput?.closest?.('form') || null;

  if (form?.requestSubmit) {
    form.requestSubmit();
    return true;
  }

  if (form?.submit) {
    form.submit();
    return true;
  }

  if (!codeInput?.dispatchEvent) {
    return false;
  }

  codeInput.focus?.();
  codeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  codeInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  codeInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  return true;
}

async function waitForVerificationSubmissionOutcome(step, hadRejectedStateBeforeSubmit = false, timeout = 5000) {
  const startUrl = location.href;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    const hasVisibleProfileInput = hasVisibleProfileFormInput();
    const onReadyProfilePage = hasReadyProfilePage(visibleText);
    const onCanonicalAboutYouProfilePage = step === 4
      && isCanonicalAboutYouPage(location.href)
      && hasVisibleProfileInput;
    const hasVisibleVerificationInputNow = hasVisibleVerificationInput();
    const hasVisibleInput = hasActiveVerificationInput();
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected after verification submit.');
    }
    if (isUnsupportedEmailBlockingStep(step) && isUnsupportedEmailText(visibleText, location.href)) {
      throw new Error(getUnsupportedEmailBlockedMessage(step));
    }
    if (step === 7 && isPhoneVerificationRequiredText(visibleText, location.href)) {
      throw new Error(getPhoneVerificationBlockedMessage(step));
    }
    if (isVerificationCodeRejectedText(visibleText) && !hadRejectedStateBeforeSubmit) {
      return {
        retryInbox: true,
        reason: 'verification-code-rejected',
      };
    }
    if (step === 7 && /email-verification/i.test(location.href) && !hasVisibleInput && isVerificationRetryStateText(visibleText)) {
      throw new Error('Verification page entered retry state after submitting the verification code. Restart this run.');
    }

    if (location.href !== startUrl || onReadyProfilePage || onCanonicalAboutYouProfilePage) {
      return {
        accepted: true,
        reason: onReadyProfilePage
          ? 'profile-form-visible'
          : (onCanonicalAboutYouProfilePage ? 'canonical-about-you-profile-page' : 'page-advanced'),
      };
    }

    if (!hasVisibleVerificationInputNow && !hasVisibleProfileInput && !hasVerificationContextText(visibleText)) {
      return {
        accepted: true,
        reason: 'verification-form-hidden',
      };
    }

    await sleep(250);
  }

  if (hadRejectedStateBeforeSubmit && hasActiveVerificationInput()) {
    return {
      retryInbox: true,
      reason: 'verification-still-blocked',
    };
  }

  if (step === 4 && isCanonicalAboutYouPage(location.href) && hasVisibleProfileFormInput()) {
    return {
      accepted: true,
      reason: 'canonical-about-you-profile-page',
    };
  }

  if (hasActiveVerificationInput() || (hasVisibleProfileFormInput() && !hasReadyProfilePage(getVisiblePageText()))) {
    return {
      retrySubmit: true,
      reason: 'verification-still-visible',
    };
  }

  return {
    accepted: true,
    reason: 'no-rejection-detected',
  };
}

function getVisiblePageText() {
  const bodyText = document.body?.innerText || '';
  const ariaText = Array.from(document.querySelectorAll('[role="alert"], [aria-live]'))
    .map((el) => el.textContent || '')
    .join(' ');
  return `${bodyText} ${ariaText}`.trim();
}

function hasVerificationContextText(text = getVisiblePageText()) {
  return /check your inbox|verify your email|verification code|enter the 6-digit code|6-digit code|resend\s*email|重新发送电子邮件|验证码|电子邮件|邮箱|邮件|收件箱/i.test(String(text || ''));
}

function hasProfileContextText(text = getVisiblePageText()) {
  return /what is your age|你的年龄是多少|create your account|complete account creation|完成帐户创建|完成账户创建|full name|全名|年龄|birthday|出生|privacy policy|隐私政策|terms|条款/i.test(String(text || ''));
}

function isCanonicalEmailVerificationPage(url = location.href) {
  return /(?:auth|accounts)\.openai\.com\/(?:account\/)?email-verification/i.test(String(url || ''));
}

function isCanonicalAboutYouPage(url = location.href) {
  return /(?:auth|accounts)\.openai\.com\/about-you/i.test(String(url || ''));
}

function hasReadyVerificationPage(text = getVisiblePageText()) {
  if (!hasVisibleVerificationInput() || hasVisibleCredentialInput()) {
    return false;
  }

  return (hasVerificationContextText(text) && !hasProfileContextText(text))
    || isCanonicalEmailVerificationPage();
}

function hasReadyProfilePage(text = getVisiblePageText()) {
  return hasVisibleProfileFormInput()
    && hasProfileContextText(text)
    && !hasVerificationContextText(text);
}

function getVisibleButtonLikeElements() {
  const candidates = [];
  const seen = new Set();
  const selectors = [
    'button[type="submit"][data-dd-action-name="Continue"]',
    'button[type="submit"]._primary_3rdp0_107',
    'button[type="submit"]',
    'input[type="submit"]',
  ];

  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (match && !seen.has(match) && isElementVisible(match)) {
      seen.add(match);
      candidates.push(match);
    }
  }

  for (const element of Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))) {
    if (!seen.has(element) && isElementVisible(element)) {
      seen.add(element);
      candidates.push(element);
    }
  }

  return candidates;
}

function hasVisibleContinueLikeAction() {
  return getVisibleButtonLikeElements().some((button) => {
    const text = String(button.textContent || button.value || '').trim();
    return /继续|continue/i.test(text);
  });
}

function hasVisibleOauthConsentContinueButton(text = getVisiblePageText()) {
  const selectorMatch = getVisibleButtonLikeElements().some((button) => {
    if (!button) {
      return false;
    }

    const actionName = String(button.getAttribute?.('data-dd-action-name') || '');
    const className = String(button.className || '');
    return actionName === 'Continue' || /\b_primary_3rdp0_107\b/.test(className);
  });
  if (selectorMatch) {
    return true;
  }

  if (!/使用\s*ChatGPT\s*登录到|log\s*in\s*to|authorize|consent|codex/i.test(String(text || ''))) {
    return false;
  }

  return hasVisibleContinueLikeAction();
}

function hasStableNextPageAfterProfileSubmit(text = getVisiblePageText()) {
  return hasVisibleOauthConsentContinueButton(text)
    || Boolean(getPageOauthUrl())
    || hasVisibleCredentialInput()
    || hasReadyVerificationPage(text);
}

function getAuthPageState() {
  const visibleText = getVisiblePageText();
  return {
    hasAuthOperationTimedOut: isBlockingAuthOperationTimedOut(visibleText),
    hasFatalError: isBlockingAuthFatalError(visibleText),
    requiresPhoneVerification: isPhoneVerificationRequiredText(visibleText, location.href),
    hasUnsupportedEmail: isUnsupportedEmailText(visibleText, location.href),
    hasVisibleCredentialInput: hasVisibleCredentialInput(),
    hasVisibleVerificationInput: hasVisibleVerificationInput(),
    hasVisibleProfileFormInput: hasVisibleProfileFormInput(),
    hasReadyVerificationPage: hasReadyVerificationPage(visibleText),
    hasReadyProfilePage: hasReadyProfilePage(visibleText),
    url: location.href,
  };
}

function hasVisibleCredentialInput() {
  return CREDENTIAL_INPUT_SELECTORS.some((selector) => Array.from(document.querySelectorAll(selector)).some(isElementVisible));
}

function hasActionableAuthForm() {
  return hasVisibleCredentialInput() || hasVisibleVerificationInput() || hasVisibleProfileFormInput();
}

function isBlockingAuthOperationTimedOut(text = getVisiblePageText()) {
  return isAuthOperationTimedOutText(text) && !hasActionableAuthForm();
}

function isBlockingAuthFatalError(text = getVisiblePageText()) {
  if (!isAuthFatalErrorText(text)) {
    return false;
  }

  if (isAuthOperationTimedOutText(text) && hasActionableAuthForm()) {
    return false;
  }

  return true;
}

function hasVisibleVerificationInput() {
  const selectors = [
    'input[name="code"]',
    'input[name="otp"]',
    'input[type="text"][maxlength="6"]',
    'input[aria-label*="code"]',
    'input[placeholder*="code"]',
    'input[placeholder*="Code"]',
    'input[inputmode="numeric"]',
    'input[maxlength="1"]',
  ];

  return selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some(isElementVisible));
}

function hasActiveVerificationInput() {
  return hasVisibleVerificationInput() && !hasVisibleProfileFormInput();
}

function hasVisibleProfileFormInput() {
  const selectors = [
    'input[name="name"]',
    'input[name="full_name"]',
    'input[placeholder*="全名"]',
    'input[placeholder*="name" i]',
    'input[autocomplete="name"]',
    'input[id*="name" i]:not([type="hidden"])',
    'input[name="age"]',
    'input[placeholder*="年龄"]',
    'input[name="birthday"]',
    'input[placeholder*="生日"]',
    'input[placeholder*="日期"]',
    'input[placeholder*="birth" i]',
    'input[placeholder*="date" i]',
    '[role="spinbutton"][data-type="year"]',
    '[role="spinbutton"][data-type="month"]',
    '[role="spinbutton"][data-type="day"]',
  ];

  return selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some(isElementVisible));
}

async function waitForProfileSubmissionOutcome(step, timeout = 7000) {
  const startUrl = location.href;
  const start = Date.now();
  let nonProfileStateSince = 0;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    const hasRawProfileInput = hasVisibleProfileFormInput();
    const onReadyProfilePage = hasReadyProfilePage(visibleText);
    if (isUnsupportedEmailBlockingStep(step) && isUnsupportedEmailText(visibleText, location.href)) {
      throw new Error(getUnsupportedEmailBlockedMessage(step));
    }
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected after profile submit.');
    }

    if (location.href !== startUrl) {
      return {
        accepted: true,
        reason: 'url-changed',
      };
    }

    if (hasStableNextPageAfterProfileSubmit(visibleText)) {
      return {
        accepted: true,
        reason: 'stable-next-page-signal',
      };
    }

    if (!hasRawProfileInput && !hasProfileContextText(visibleText)) {
      if (!nonProfileStateSince) {
        nonProfileStateSince = Date.now();
      }
      if (Date.now() - nonProfileStateSince >= 1500) {
        return {
          accepted: true,
          reason: 'profile-form-hidden-stable',
        };
      }
    } else if (onReadyProfilePage || hasRawProfileInput || hasProfileContextText(visibleText)) {
      nonProfileStateSince = 0;
    }

    await sleep(250);
  }

  throw new Error(`Step ${step} blocked: profile submit did not reach a stable next page. URL: ${location.href}`);
}

function shouldWaitForPostProfileBlockingSettle(outcome = {}) {
  const reason = String(outcome?.reason || '').trim().toLowerCase();
  return reason === 'profile-form-hidden-stable' || reason === 'no-rejection-detected';
}

function findVisibleProfileSubmitButton() {
  const directSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
  ];

  for (const selector of directSelectors) {
    const directMatch = document.querySelector(selector);
    if (directMatch && isElementVisible(directMatch)) {
      return directMatch;
    }
  }

  const textMatchedButton = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find((button) => {
    if (!isElementVisible(button)) {
      return false;
    }

    const text = String(button.textContent || button.value || '').trim();
    return /完成|create|continue|finish|done|agree/i.test(text);
  });

  return textMatchedButton || null;
}

async function waitForProfileSubmitButtonOrOutcome(step, timeout = 5000) {
  const startUrl = location.href;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    if (isUnsupportedEmailBlockingStep(step) && isUnsupportedEmailText(visibleText, location.href)) {
      throw new Error(getUnsupportedEmailBlockedMessage(step));
    }
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected after profile submit.');
    }

    const submitButton = findVisibleProfileSubmitButton();
    if (submitButton) {
      return {
        button: submitButton,
        reason: 'submit-button-visible',
      };
    }

    if (location.href !== startUrl || hasStableNextPageAfterProfileSubmit(visibleText)) {
      return {
        accepted: true,
        reason: 'page-advanced-before-submit',
      };
    }

    await sleep(250);
  }

  throw new Error(`Step ${step} blocked: profile submit button did not appear after filling the form. URL: ${location.href}`);
}

async function waitForPostProfileBlockingSettle(step, startUrl = location.href, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    if (isUnsupportedEmailBlockingStep(step) && isUnsupportedEmailText(visibleText, location.href)) {
      throw new Error(getUnsupportedEmailBlockedMessage(step));
    }
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected after profile submit.');
    }
    if (location.href !== startUrl) {
      return;
    }
    if (hasStableNextPageAfterProfileSubmit(visibleText)) {
      return;
    }
    if (!isCanonicalAboutYouPage(startUrl) && !hasVisibleProfileFormInput() && !hasProfileContextText(visibleText)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`Step ${step} blocked: profile submit did not reach a stable next page. URL: ${location.href}`);
}

// ============================================================
// Step 6: Login with registered account (on OAuth auth page)
// ============================================================

async function step6_login(payload) {
  const { email, password } = payload;
  if (!email) throw new Error('No email provided for login.');

  log(`Step 6: Logging in with ${email}...`);
  const latestPageOauthUrl = await resolveLatestPageOauthUrl();

  // Wait for email input on the auth page
  let emailInput = null;
  try {
    emailInput = await waitForElement(
      'input[type="email"], input[name="email"], input[name="username"], input[id*="email"], input[placeholder*="email" i], input[placeholder*="Email"]',
      15000
    );
  } catch {
    throw new Error('Could not find email input on login page. URL: ' + location.href);
  }

  await humanPause(500, 1400);
  fillInput(emailInput, email);
  log('Step 6: Email filled');

  // Submit email
  await sleep(500);
  const submitBtn1 = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|next|submit|继续|下一步/i, 5000).catch(() => null);
  if (submitBtn1) {
    await humanPause(400, 1100);
    simulateClick(submitBtn1);
    log('Step 6: Submitted email');
  }

  const passwordInput = await waitForLoginPasswordField();
  if (passwordInput) {
    log('Step 6: Password field found, filling password...');
    await humanPause(550, 1450);
    fillInput(passwordInput, password);
    log(`Step 6: Password filled: ${password}`);

    await sleep(500);
    const submitBtn2 = document.querySelector('button[type="submit"]')
      || await waitForElementByText('button', /continue|log\s*in|submit|sign\s*in|登录|继续/i, 5000).catch(() => null);

    if (submitBtn2) {
      await humanPause(450, 1200);
      simulateClick(submitBtn2);
      log('Step 6: Submitted password, waiting for login outcome...');
    }
    await waitForLoginSubmissionOutcome();
    reportComplete(6, { needsOTP: true, ...(latestPageOauthUrl ? { oauthUrl: latestPageOauthUrl } : {}) });
    return;
  }

  // No password field — OTP flow
  log('Step 6: No password field. OTP flow or auto-redirect.');
  reportComplete(6, { needsOTP: true, ...(latestPageOauthUrl ? { oauthUrl: latestPageOauthUrl } : {}) });
}

async function waitForPasswordlessOrPasswordField(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const passwordInput = findVisiblePasswordInput();
    if (passwordInput) {
      return {
        passwordInput,
        reason: 'password-field',
      };
    }

    const otpButton = findPasswordlessLoginButton();
    if (otpButton) {
      return {
        otpButton,
        reason: 'passwordless-login-button',
      };
    }

    await sleep(250);
  }

  return null;
}

function findStep3ImmediateCredentialChoice() {
  const passwordInput = findVisiblePasswordInput();
  if (passwordInput) {
    return {
      passwordInput,
      reason: 'inline-password-field',
    };
  }

  const otpButton = findPasswordlessLoginButton();
  if (otpButton) {
    return {
      otpButton,
      reason: 'inline-passwordless-login-button',
    };
  }

  return null;
}

async function submitStep3WithPassword(payload, passwordInput) {
  if (!payload.password) throw new Error('No password provided. Step 3 requires a generated password.');
  await humanPause(600, 1500);
  fillInput(passwordInput, payload.password);
  log(`Step 3: Password filled: ${payload.password}`);

  await sleep(500);
  const submissionStartUrl = location.href;
  const passwordSubmitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|sign\s*up|submit|注册|创建|create|继续/i, 5000).catch(() => null);

  if (passwordSubmitBtn) {
    await humanPause(500, 1300);
    simulateClick(passwordSubmitBtn);
    log('Step 3: Form submitted');
    return submissionStartUrl;
  }

  if (submitStep3PasswordWithFallback(passwordInput)) {
    log('Step 3: Submit button did not appear after password entry. Submitted the form via a fallback Enter key sequence.', 'warn');
    return submissionStartUrl;
  }

  throw new Error('Step 3 blocked: password was filled but no submit action was available on the signup form. URL: ' + location.href);
}

function submitStep3PasswordWithFallback(passwordInput) {
  const form = passwordInput?.form || passwordInput?.closest?.('form') || null;

  if (form?.requestSubmit) {
    form.requestSubmit();
    return true;
  }

  if (form?.submit) {
    form.submit();
    return true;
  }

  if (!passwordInput?.dispatchEvent) {
    return false;
  }

  passwordInput.focus?.();
  passwordInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  passwordInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  passwordInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  return true;
}

async function waitForStep3CredentialSubmissionOutcome(startUrl, timeout = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    if (await handleAuthReturnHomeRecovery(3, visibleText)) {
      throw new Error(getAuthReturnHomeRecoveryErrorMessage(3));
    }
    throwIfAuthOperationTimedOut(3, visibleText);
    if (isBlockingAuthFatalError(visibleText)) {
      throw new Error('Auth fatal error page detected after step 3 password submit.');
    }
    if (isPhoneVerificationRequiredText(visibleText, location.href)) {
      throw new Error(getPhoneVerificationBlockedMessage(3));
    }
    if (isUnsupportedEmailBlockingStep(3) && isUnsupportedEmailText(visibleText, location.href)) {
      throw new Error(getUnsupportedEmailBlockedMessage(3));
    }

    if (location.href !== startUrl || hasVisibleVerificationInput() || hasVisibleProfileFormInput() || !hasVisibleCredentialInput()) {
      return {
        accepted: true,
        reason: 'page-advanced',
      };
    }

    await sleep(250);
  }

  throw new Error('Step 3 blocked: password was filled but the signup page never advanced past the credential form.');
}

function findPasswordlessLoginButton() {
  const selectors = [
    'button[name="intent"][value="passwordless_login_send_otp"]',
    'button[value="passwordless_login_send_otp"]',
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button && isElementVisible(button)) {
      return button;
    }
  }

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
  for (const button of buttons) {
    const text = String(button.textContent || '').trim();
    if (/使用一次性验证码登录|one-time code|one time code|passwordless/i.test(text) && isElementVisible(button)) {
      return button;
    }
  }

  return null;
}

async function resolveLatestPageOauthUrl() {
  const pageOauthUrl = getPageOauthUrl();
  if (!pageOauthUrl) {
    return '';
  }

  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    const savedOauthUrl = String(state?.oauthUrl || '').trim();
    if (!savedOauthUrl || savedOauthUrl !== pageOauthUrl) {
      log(`Step 6: Detected newer OAuth URL on the page, using it instead of the saved panel value.`);
      return pageOauthUrl;
    }
  } catch {}

  return '';
}

function getPageOauthUrl() {
  const anchors = Array.from(document.querySelectorAll('a[href*="/api/oauth/authorize"]'));
  for (const anchor of anchors) {
    if (!isElementVisible(anchor)) {
      continue;
    }

    const href = String(anchor.href || anchor.getAttribute?.('href') || '').trim();
    if (/^https?:\/\/[^/]+\/api\/oauth\/authorize/i.test(href)) {
      return href;
    }
  }

  return '';
}

async function waitForLoginPasswordField(timeout = 25000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    if (await handleAuthReturnHomeRecovery(6)) {
      throw new Error(getAuthReturnHomeRecoveryErrorMessage(6));
    }

    const passwordInput = findVisiblePasswordInput();
    if (passwordInput) {
      return passwordInput;
    }

    await sleep(250);
  }

  log(`Step 6: Password field did not appear within ${Math.round(timeout / 1000)}s.`, 'warn');
  return null;
}

async function waitForLoginSubmissionOutcome(timeout = 12000) {
  const startUrl = location.href;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const visibleText = getVisiblePageText();
    if (await handleAuthReturnHomeRecovery(6, visibleText)) {
      throw new Error(getAuthReturnHomeRecoveryErrorMessage(6));
    }
    if (isBlockingAuthFatalError(visibleText)) {
      log(
        `Step 6: Fatal auth state after login submit. URL: ${location.href}; Visible text snapshot: ${summarizeVisibleTextForLog(visibleText) || '(empty)'}`,
        'warn'
      );
      throw new Error('Auth fatal error page detected after login submit.');
    }
    if (isLoginCredentialErrorText(visibleText)) {
      throw new Error(getLoginCredentialErrorMessage());
    }

    if (location.href !== startUrl || !findVisiblePasswordInput()) {
      return {
        accepted: true,
        reason: 'page-advanced',
      };
    }

    await sleep(250);
  }

  throw new Error('Login did not advance after password submit. Still on the password page.');
}

function findVisiblePasswordInput() {
  const inputs = document.querySelectorAll('input[type="password"]');
  for (const input of inputs) {
    if (isElementVisible(input)) {
      return input;
    }
  }
  return null;
}

function isLoginCredentialErrorText(text) {
  return /incorrect email address or password|incorrect password|wrong password|邮箱地址或密码错误|电子邮件地址或密码错误|密码错误/i.test(String(text || ''));
}

function getLoginCredentialErrorMessage() {
  return 'Incorrect email address or password.';
}

function isAuthReturnHomeIssueText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  if (/we ran into an issue while authenticating you/i.test(normalized)) {
    return true;
  }

  if (/invalid[_\s-]?state/i.test(normalized) && /返回首页|return home|back to home|home/i.test(normalized)) {
    return true;
  }

  return /糟糕[！!]?|出错了|something went wrong|oops/i.test(normalized)
    && /authenticating you|help\.openai\.com|invalid[_\s-]?state|验证过程中出错|验证过程.*出错|请重试|retry/i.test(normalized)
    && /返回首页|return home|back to home|home/i.test(normalized);
}

function getAuthReturnHomeRecoveryErrorMessage(step) {
  if (step === 6) {
    return 'Step 6 recoverable: auth issue page offered a "return home" recovery link. Refresh the VPS OAuth link and retry with the same email and password.';
  }
  return 'Step 3 blocked: auth issue page offered a "return home" recovery link. Reopen the platform login page and retry with the same email and password.';
}

async function handleAuthReturnHomeRecovery(step, visibleText = getVisiblePageText()) {
  if (!isAuthReturnHomeIssueText(visibleText)) {
    return false;
  }

  const returnHomeLink = await waitForElementByText(
    'a, button, [role="button"], [role="link"]',
    /返回首页|return home|back to home|home/i,
    2000
  ).catch(() => null);

  if (!returnHomeLink || !isElementVisible(returnHomeLink)) {
    return false;
  }

  await humanPause(350, 900);
  simulateClick(returnHomeLink);
  log(`Step ${step}: Auth issue page detected. Clicked "返回首页" to recover the login flow.`, 'warn');
  await sleep(500);
  return true;
}

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// ============================================================
// Step 8: Find "继续" on OAuth consent page for debugger click
// ============================================================
// After login + verification, page shows:
// "使用 ChatGPT 登录到 Codex" with a "继续" submit button.
// Background performs the actual click through the debugger Input API.

async function step8_findAndClick() {
  log('Step 8: Looking for OAuth consent "继续" button...');

  const continueBtn = await findContinueButton();
  await waitForButtonEnabled(continueBtn);

  await humanPause(350, 900);
  continueBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  continueBtn.focus();
  await sleep(250);

  const rect = getSerializableRect(continueBtn);
  const hitTarget = describeElementAtRectCenter(continueBtn, rect);
  log('Step 8: Found "继续" button and prepared debugger click coordinates.');
  return {
    rect,
    buttonText: (continueBtn.textContent || '').trim(),
    hitTargetBlocked: hitTarget.blocked,
    hitTargetDescription: hitTarget.description,
    url: location.href,
  };
}

async function step8_trySubmit() {
  const continueBtn = await findContinueButton();
  await waitForButtonEnabled(continueBtn);

  await humanPause(250, 650);
  continueBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  continueBtn.focus();
  await sleep(150);

  const form = continueBtn.form || continueBtn.closest?.('form') || null;
  if (form?.requestSubmit) {
    form.requestSubmit(continueBtn);
    return {
      usedFallbackSubmit: true,
      submitMethod: 'requestSubmit',
      url: location.href,
    };
  }

  if (form?.submit) {
    form.submit();
    return {
      usedFallbackSubmit: true,
      submitMethod: 'form.submit',
      url: location.href,
    };
  }

  if (typeof continueBtn.click === 'function') {
    continueBtn.click();
    return {
      usedFallbackSubmit: true,
      submitMethod: 'nativeClick',
      url: location.href,
    };
  }

  simulateClick(continueBtn);
  return {
    usedFallbackSubmit: true,
    submitMethod: 'simulateClick',
    url: location.href,
  };
}

async function findContinueButton() {
  try {
    const button = await waitForElement(
      'button[type="submit"][data-dd-action-name="Continue"], button[type="submit"]._primary_3rdp0_107',
      10000
    );
    if (button && isElementVisible(button)) {
      return button;
    }
  } catch {
  }

  try {
    const byTextButton = await waitForElementByText('button, [role="button"]', /继续|Continue/, 5000);
    if (byTextButton && isElementVisible(byTextButton)) {
      return byTextButton;
    }
  } catch {
  }

  throw new Error('Could not find "继续" button on OAuth consent page. URL: ' + location.href);
}

async function waitForButtonEnabled(button, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (isButtonEnabled(button)) return;
    await sleep(150);
  }
  throw new Error('"继续" button stayed disabled for too long. URL: ' + location.href);
}

function isButtonEnabled(button) {
  return Boolean(button)
    && !button.disabled
    && button.getAttribute?.('aria-disabled') !== 'true';
}

function getSerializableRect(el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    throw new Error('"继续" button has no clickable size after scrolling. URL: ' + location.href);
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + (rect.width / 2),
    centerY: rect.top + (rect.height / 2),
  };
}

function describeElementAtRectCenter(button, rect = null) {
  if (!button || typeof document.elementFromPoint !== 'function') {
    return { blocked: false, description: '' };
  }

  const resolvedRect = rect || getSerializableRect(button);
  const x = Math.round(resolvedRect.centerX);
  const y = Math.round(resolvedRect.centerY);
  const hitTarget = document.elementFromPoint(x, y);

  if (!hitTarget || hitTarget === button || button.contains?.(hitTarget)) {
    return { blocked: false, description: '' };
  }

  const tag = String(hitTarget.tagName || hitTarget.nodeName || 'unknown').toUpperCase();
  const text = String(hitTarget.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return {
    blocked: true,
    description: text ? `${tag} "${text}"` : tag,
  };
}

// ============================================================
// Step 5: Fill Name & Birthday / Age
// ============================================================

async function step5_fillNameBirthday(payload) {
  const { firstName, lastName, age, year, month, day } = payload;
  if (!firstName || !lastName) throw new Error('No name data provided.');

  const resolvedAge = age ?? (year ? new Date().getFullYear() - Number(year) : null);
  const hasBirthdayData = [year, month, day].every(value => value != null && !Number.isNaN(Number(value)));
  if (!hasBirthdayData && (resolvedAge == null || Number.isNaN(Number(resolvedAge)))) {
    throw new Error('No birthday or age data provided.');
  }

  const fullName = `${firstName} ${lastName}`;
  log(`Step 5: Filling name: ${fullName}`);

  // Actual DOM structure:
  // - Full name: <input name="name" placeholder="全名" type="text">
  // - Birthday: React Aria DateField or hidden input[name="birthday"]
  // - Age: <input name="age" type="text|number">

  // --- Full Name (single field, not first+last) ---
  let nameInput = null;
  try {
    nameInput = await waitForElement(
      'input[name="name"], input[name="full_name"], input[placeholder*="全名"], input[placeholder*="name" i], input[autocomplete="name"], input[id*="name" i]:not([type="hidden"])',
      10000
    );
  } catch {
    log('Step 5: Name input did not appear after verification. Treating the profile form as skipped and continuing to login...', 'warn');
    reportComplete(5, {
      skippedProfileForm: true,
      reason: 'missing_name_input',
    });
    return;
  }
  await humanPause(500, 1300);
  fillInput(nameInput, fullName);
  log(`Step 5: Name filled: ${fullName}`);

  let birthdayMode = false;
  let ageInput = null;

  for (let i = 0; i < 100; i++) {
    const yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    const monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    const daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');
    const hiddenBirthday = document.querySelector('input[name="birthday"]');
    ageInput = document.querySelector('input[name="age"]');

    // Some pages include a hidden birthday input even though the real UI is "age".
    // In that case we must prioritize filling age to satisfy required validation.
    if (ageInput) break;

    if ((yearSpinner && monthSpinner && daySpinner) || hiddenBirthday) {
      birthdayMode = true;
      break;
    }
    await sleep(100);
  }

  if (birthdayMode) {
    if (!hasBirthdayData) {
      throw new Error('Birthday field detected, but no birthday data provided.');
    }

    const yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    const monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    const daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');

    if (yearSpinner && monthSpinner && daySpinner) {
      log('Step 5: Birthday fields detected, filling birthday...');

      async function setSpinButton(el, value) {
        el.focus();
        await sleep(100);
        document.execCommand('selectAll', false, null);
        await sleep(50);

        const valueStr = String(value);
        for (const char of valueStr) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Digit${char}`, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, code: `Digit${char}`, bubbles: true }));
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: char, bubbles: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));
          await sleep(50);
        }

        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
        el.blur();
        await sleep(100);
      }

      await humanPause(450, 1100);
      await setSpinButton(yearSpinner, year);
      await humanPause(250, 650);
      await setSpinButton(monthSpinner, String(month).padStart(2, '0'));
      await humanPause(250, 650);
      await setSpinButton(daySpinner, String(day).padStart(2, '0'));
      log(`Step 5: Birthday filled: ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    const hiddenBirthday = document.querySelector('input[name="birthday"]');
    if (hiddenBirthday) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      hiddenBirthday.value = dateStr;
      hiddenBirthday.dispatchEvent(new Event('change', { bubbles: true }));
      log(`Step 5: Hidden birthday input set: ${dateStr}`);
    }
  } else if (ageInput) {
    if (resolvedAge == null || Number.isNaN(Number(resolvedAge))) {
      throw new Error('Age field detected, but no age data provided.');
    }
    await humanPause(500, 1300);
    fillInput(ageInput, String(resolvedAge));
    log(`Step 5: Age filled: ${resolvedAge}`);

    // Some age-mode pages still submit a hidden birthday field.
    // Keep it aligned with generated data so backend validation won't reject.
    const hiddenBirthday = document.querySelector('input[name="birthday"]');
    if (hiddenBirthday && hasBirthdayData) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      hiddenBirthday.value = dateStr;
      hiddenBirthday.dispatchEvent(new Event('change', { bubbles: true }));
      log(`Step 5: Hidden birthday input set (age mode): ${dateStr}`);
    }
  } else {
    throw new Error('Could not find birthday or age input. URL: ' + location.href);
  }

  // Click "完成帐户创建" button
  await sleep(500);
  const submitReadiness = await waitForProfileSubmitButtonOrOutcome(5);
  if (submitReadiness?.button) {
    await humanPause(500, 1300);
    const profileSubmitStartUrl = location.href;
    simulateClick(submitReadiness.button);
    log('Step 5: Clicked "完成帐户创建"');
    const submitOutcome = await waitForProfileSubmissionOutcome(5);
    if (shouldWaitForPostProfileBlockingSettle(submitOutcome)) {
      await waitForPostProfileBlockingSettle(5, profileSubmitStartUrl);
    }
  }

  reportComplete(5);
}
})();
