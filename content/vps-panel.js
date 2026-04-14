// content/vps-panel.js — Content script for VPS panel (steps 1, 9)
// Injected on: VPS panel (user-configured URL)
//
// Actual DOM structure (after login click):
// <div class="card">
//   <div class="card-header">
//     <span class="OAuthPage-module__cardTitle___yFaP0">Codex OAuth</span>
//     <button class="btn btn-primary"><span>登录</span></button>
//   </div>
//   <div class="OAuthPage-module__cardContent___1sXLA">
//     <div class="OAuthPage-module__authUrlBox___Iu1d4">
//       <div class="OAuthPage-module__authUrlLabel___mYFJB">授权链接:</div>
//       <div class="OAuthPage-module__authUrlValue___axvUJ">https://auth.openai.com/...</div>
//       <div class="OAuthPage-module__authUrlActions___venPj">
//         <button class="btn btn-secondary btn-sm"><span>复制链接</span></button>
//         <button class="btn btn-secondary btn-sm"><span>打开链接</span></button>
//       </div>
//     </div>
//     <div class="OAuthPage-module__callbackSection___8kA31">
//       <input class="input" placeholder="http://localhost:1455/auth/callback?code=...&state=...">
//       <button class="btn btn-secondary btn-sm"><span>提交回调 URL</span></button>
//     </div>
//   </div>
// </div>

(function() {
if (window.__MULTIPAGE_VPS_PANEL_LOADED) {
  console.log('[Infinito.AI:vps-panel] Content script already loaded on', location.href);
  return;
}
window.__MULTIPAGE_VPS_PANEL_LOADED = true;

console.log('[Infinito.AI:vps-panel] Content script loaded on', location.href);
const { isVpsAuthorizationNotPendingText } = FlowRecovery;

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_STEP') {
    resetStopState();
    handleStep(message.step, message.payload).then((result) => {
      sendResponse({ ok: true, ...(result || {}) });
    }).catch(err => {
      if (isStopError(err)) {
        log(`Step ${message.step}: Stopped by user.`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      reportError(message.step, err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleStep(step, payload) {
  switch (step) {
    case 1: return await step1_getOAuthLink();
    case 9: return await step9_vpsVerify(payload);
    default:
      throw new Error(`vps-panel.js does not handle step ${step}`);
  }
}

// ============================================================
// Step 1: Get OAuth Link
// ============================================================

async function step1_getOAuthLink() {
  const maxCardLoadAttempts = 3;
  let loginBtn = null;

  for (let attempt = 1; attempt <= maxCardLoadAttempts; attempt++) {
    const bodyText = (document.querySelector('body')?.textContent || '').trim();
    if (/502\s+bad\s+gateway/i.test(bodyText)) {
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
      const fallbackUrl = String(state?.vpsUrl || '').trim();
      if (fallbackUrl && fallbackUrl !== location.href) {
        log('Step 1: VPS returned 502. Re-opening the configured OAuth page instead of refreshing the error page...', 'warn');
        location.href = fallbackUrl;
      }
      throw new Error('VPS panel returned 502 Bad Gateway. Re-opened the configured OAuth page. If it still fails, switch node or VPS and retry.');
    }

    log(`Step 1: Waiting for VPS panel to load (attempt ${attempt}/${maxCardLoadAttempts})...`);

    try {
      const header = await waitForElementByText('.card-header', /codex/i, 30000);
      loginBtn = header.querySelector('button.btn.btn-primary, button.btn');
      log('Step 1: Found Codex OAuth card');
      break;
    } catch {
      if (attempt >= maxCardLoadAttempts) {
        throw new Error(
          'Codex OAuth card did not appear after multiple refresh attempts. Page may still be loading or not logged in. ' +
          'Current URL: ' + location.href
        );
      }

      log(`Step 1: Codex OAuth card not ready on attempt ${attempt}. Refreshing the VPS page and retrying...`, 'warn');
      location.reload();
      await sleep(2500);
    }
  }

  if (!loginBtn) {
    throw new Error('Found Codex OAuth card but no login button inside it. URL: ' + location.href);
  }

  // Check if button is disabled (already clicked / loading)
  if (loginBtn.disabled) {
    log('Step 1: Login button is disabled (already loading), waiting for auth URL...');
  } else {
    await humanPause(500, 1400);
    simulateClick(loginBtn);
    log('Step 1: Clicked login button, waiting for auth URL...');
  }

  // Wait for the auth URL to appear in the specific div
  let authUrlEl = null;
  try {
    authUrlEl = await waitForElement('[class*="authUrlValue"]', 15000);
  } catch {
    throw new Error(
      'Auth URL did not appear after clicking login. ' +
      'Check if VPS panel is logged in and Codex service is running. URL: ' + location.href
    );
  }

  const oauthUrl = (authUrlEl.textContent || '').trim();
  if (!oauthUrl || !oauthUrl.startsWith('http')) {
    throw new Error(`Invalid OAuth URL found: "${oauthUrl.slice(0, 50)}". Expected URL starting with http.`);
  }

  log(`Step 1: OAuth URL obtained: ${oauthUrl.slice(0, 80)}...`, 'ok');
  reportComplete(1, { oauthUrl });
}

// ============================================================
// Step 9: VPS Verify — paste localhost URL and submit
// ============================================================

async function step9_vpsVerify(payload) {
  // Get localhostUrl from payload (passed directly by background) or fallback to state
  let localhostUrl = payload?.localhostUrl;
  if (!localhostUrl) {
    log('Step 9: localhostUrl not in payload, fetching from state...');
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    localhostUrl = state.localhostUrl;
  }
  if (!localhostUrl) {
    throw new Error('No localhost URL found. Complete step 8 first.');
  }
  log(`Step 9: Got localhostUrl: ${localhostUrl.slice(0, 60)}...`);

  log('Step 9: Looking for callback URL input...');

  // Find the callback URL input
  // Actual DOM: <input class="input" placeholder="http://localhost:1455/auth/callback?code=...&state=...">
  let urlInput = null;
  try {
    urlInput = await waitForElement('[class*="callbackSection"] input.input', 10000);
  } catch {
    try {
      urlInput = await waitForElement('input[placeholder*="localhost"]', 5000);
    } catch {
      throw new Error('Could not find callback URL input on VPS panel. URL: ' + location.href);
    }
  }

  await humanPause(600, 1500);
  fillInput(urlInput, localhostUrl);
  log(`Step 9: Filled callback URL: ${localhostUrl.slice(0, 80)}...`);

  // Find and click "提交回调 URL" button
  let submitBtn = null;
  try {
    submitBtn = await waitForElementByText(
      '[class*="callbackActions"] button, [class*="callbackSection"] button',
      /提交/,
      5000
    );
  } catch {
    try {
      submitBtn = await waitForElementByText('button.btn', /提交回调/, 5000);
    } catch {
      throw new Error('Could not find "提交回调 URL" button. URL: ' + location.href);
    }
  }

  const maxSubmitAttempts = 4;
  for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
    await humanPause(450, 1200);
    fillInput(urlInput, localhostUrl);
    simulateClick(submitBtn);
    log(`Step 9: Clicked "提交回调 URL" (${attempt}/${maxSubmitAttempts}), waiting for authentication result...`);

    const outcome = await waitForStep9Outcome();
    if (outcome.kind === 'success') {
      log('Step 9: Authentication successful!', 'ok');
      reportComplete(9);
      return;
    }

    if (outcome.kind === 'transient_502') {
      if (attempt < maxSubmitAttempts) {
        log(`Step 9: VPS callback submit hit 502 (${outcome.detail}). Retrying submit...`, 'warn');
        await sleep(1500);
        continue;
      }

      throw new Error(
        `VPS callback submit kept hitting 502 after ${maxSubmitAttempts} attempts (${outcome.detail}). ` +
        'The account is usually already registered. Retry step 9 again first; if it still fails, continue from step 6 to re-authenticate instead of restarting from step 1.'
      );
    }

    if (outcome.kind === 'auth_link_not_pending') {
      log(`Step 9: VPS says the authorization link is no longer pending (${outcome.detail}). Requesting a fresh OAuth recovery...`, 'warn');
      return {
        retryWithFreshOauth: true,
        reason: 'auth_link_not_pending',
        detail: outcome.detail,
      };
    }

    log(`Step 9: Status after submit: "${outcome.detail}". May still be processing.`, 'warn');
    reportComplete(9);
    return;
  }

  throw new Error('Step 9 ended unexpectedly before the VPS callback could be confirmed.');
}

function normalizeStep9StatusText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function collectStep9StatusText() {
  const selectors = [
    '.status-badge',
    '[class*="status"]',
    '.alert',
    '[role="alert"]',
    '[class*="toast"]',
    '[class*="message"]',
    '[class*="notification"]',
  ];
  const parts = [];
  const seen = new Set();

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll?.(selector) || []);
    for (const element of elements) {
      const text = normalizeStep9StatusText(element?.textContent || '');
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      parts.push(text);
    }
  }

  const directStatus = document.querySelector('.status-badge, [class*="status"]');
  const directText = normalizeStep9StatusText(directStatus?.textContent || '');
  if (directText && !seen.has(directText)) {
    seen.add(directText);
    parts.push(directText);
  }

  const bodyText = normalizeStep9StatusText(document.querySelector('body')?.textContent || '');
  if (bodyText && !seen.has(bodyText)) {
    parts.push(bodyText);
  }

  return parts.join(' | ');
}

function detectStep9Transient502() {
  const detail = collectStep9StatusText();
  if (/502\s+bad\s+gateway|bad\s+gateway/i.test(detail)) {
    return detail || '502 Bad Gateway';
  }
  return '';
}

async function waitForStep9Outcome(timeoutMs = 30000) {
  try {
    await waitForElementByText('.status-badge, [class*="status"]', /认证成功|成功|success/i, timeoutMs);
    return { kind: 'success', detail: 'success' };
  } catch {}

  const transient502Detail = detectStep9Transient502();
  if (transient502Detail) {
    return { kind: 'transient_502', detail: transient502Detail };
  }

  const statusText = collectStep9StatusText() || 'unknown';
  if (isVpsAuthorizationNotPendingText(statusText)) {
    return { kind: 'auth_link_not_pending', detail: statusText };
  }
  if (/认证成功|成功|success/i.test(statusText)) {
    return { kind: 'success', detail: statusText };
  }

  return { kind: 'unknown', detail: statusText };
}
})();
