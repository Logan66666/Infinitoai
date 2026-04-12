// content/mail-163.js — Content script for 163 Mail (steps 4, 7)
// Injected on: mail.163.com
//
// DOM structure:
// Mail item: div[sign="letter"] with aria-label="你的 ChatGPT 代码为 479637 发件人 ： OpenAI ..."
// Sender: .nui-user (e.g., "OpenAI")
// Subject: span.da0 (e.g., "你的 ChatGPT 代码为 479637")
// Right-click menu: .nui-menu → .nui-menu-item with text "删除邮件"

(function() {
if (window.__MULTIPAGE_MAIL_163_LOADED) {
  console.log('[MultiPage:mail-163] Content script already loaded on', location.href);
  return;
}
window.__MULTIPAGE_MAIL_163_LOADED = true;

const MAIL163_PREFIX = '[MultiPage:mail-163]';
const isTopFrame = window === window.top;
const { getStepMailMatchProfile, matchesSubjectPatterns } = MailMatching;
const { isMailFresh, parseMailTimestampCandidates } = MailFreshness;
const { findLatestMatchingItem } = LatestMail;

console.log(MAIL163_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

// Only operate in the top frame
if (!isTopFrame) {
  console.log(MAIL163_PREFIX, 'Skipping child frame');
} else {

// Track codes we've already seen — persisted in chrome.storage.session to survive script re-injection
let seenCodes = new Set();

async function loadSeenCodes() {
  try {
    const data = await chrome.storage.session.get('seenCodes');
    if (data.seenCodes && Array.isArray(data.seenCodes)) {
      seenCodes = new Set(data.seenCodes);
      console.log(MAIL163_PREFIX, `Loaded ${seenCodes.size} previously seen codes`);
    }
  } catch (err) {
    console.warn(MAIL163_PREFIX, 'Session storage unavailable, using in-memory seen codes:', err?.message || err);
  }
}

// Load previously seen codes on startup
loadSeenCodes();

async function persistSeenCodes() {
  try {
    await chrome.storage.session.set({ seenCodes: [...seenCodes] });
  } catch (err) {
    console.warn(MAIL163_PREFIX, 'Could not persist seen codes, continuing in-memory only:', err?.message || err);
  }
}

// ============================================================
// Message Handler (top frame only)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    resetStopState();
    handlePollEmail(message.step, message.payload).then(result => {
      sendResponse(result);
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

// ============================================================
// Find mail items
// ============================================================

function parseEmailDate(item) {
  const aria = item.getAttribute('aria-label') || '';
  return parseMailTimestampCandidates([aria], { now: Date.now() });
}

function findMailItems() {
  return document.querySelectorAll('div[sign="letter"]');
}

function getCurrentMailIds() {
  const ids = new Set();
  findMailItems().forEach(item => {
    const id = item.getAttribute('id') || '';
    if (id) ids.add(id);
  });
  return ids;
}

// ============================================================
// Email Polling
// ============================================================

async function handlePollEmail(step, payload) {
  const { senderFilters, subjectFilters, maxAttempts, intervalMs, filterAfterTimestamp = 0, excludeCodes = [] } = payload;
  const subjectProfile = getStepMailMatchProfile(step);
  const excludedCodeSet = new Set(excludeCodes);
  const now = Date.now();

  log(`Step ${step}: Starting email poll on 163 Mail (max ${maxAttempts} attempts)`);

  // Click inbox in sidebar to ensure we're in inbox view
  log(`Step ${step}: Waiting for sidebar...`);
  try {
    const inboxLink = await waitForElement('.nui-tree-item-text[title="收件箱"]', 5000);
    inboxLink.click();
    log(`Step ${step}: Clicked inbox`);
  } catch {
    log(`Step ${step}: Inbox link not found, proceeding...`, 'warn');
  }

  // Wait for mail list container to appear (page loaded check, inbox can be empty)
  log(`Step ${step}: Waiting for mail list...`);
  try {
    await waitForElement('.nui-tree-item-text[title="收件箱"], .mail-list, div[sign="letter"]', 10000);
    log(`Step ${step}: Mail page loaded`);
  } catch {
    log(`Step ${step}: Mail page may not be fully loaded, proceeding to poll anyway...`, 'warn');
  }

  // Snapshot existing mail IDs (may be empty if inbox is empty)
  const existingMailIds = getCurrentMailIds();
  log(`Step ${step}: Snapshotted ${existingMailIds.size} existing emails`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`Polling 163 Mail... attempt ${attempt}/${maxAttempts}`);

    await refreshInbox();
    await sleep(1000);

    const allItems = findMailItems();
    const useFallback = attempt > FALLBACK_AFTER;

    const latestMatch = findLatestMatchingItem(allItems, (item) => {
      const id = item.getAttribute('id') || '';
      if (!useFallback && existingMailIds.has(id)) {
        return false;
      }

      const senderEl = item.querySelector('.nui-user');
      const sender = senderEl ? senderEl.textContent.toLowerCase() : '';
      const subjectEl = item.querySelector('span.da0');
      const subject = subjectEl ? subjectEl.textContent : '';
      const subjectLower = subject.toLowerCase();
      const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();

      const senderMatch = senderFilters.some(f => sender.includes(f.toLowerCase()) || ariaLabel.includes(f.toLowerCase()));
      const subjectMatch = subjectFilters.some(f => subjectLower.includes(f.toLowerCase()) || ariaLabel.includes(f.toLowerCase()));
      const stepSpecificSubjectMatch = matchesSubjectPatterns(`${subject} ${item.getAttribute('aria-label') || ''}`, subjectProfile);

      return stepSpecificSubjectMatch || (!subjectProfile && (senderMatch || subjectMatch));
    });

    if (latestMatch) {
      const id = latestMatch.getAttribute('id') || '';
      const subject = latestMatch.querySelector('span.da0')?.textContent || '';
      const ariaLabel = (latestMatch.getAttribute('aria-label') || '').toLowerCase();
      const emailTime = parseEmailDate(latestMatch);
      const isFallbackMatch = useFallback && existingMailIds.has(id);
      const shouldTreatUnknownTimeAsFresh = !isFallbackMatch && !emailTime;

      if (!shouldTreatUnknownTimeAsFresh && !isMailFresh(emailTime, { now, filterAfterTimestamp })) {
        log(`Step ${step}: Skipping stale email (date: ${emailTime ? new Date(emailTime).toLocaleString() : 'unknown'})`, 'info');
      } else {
        const code = extractVerificationCode(subject + ' ' + ariaLabel);
        if (!code) {
          log(`Step ${step}: Latest 163 verification email has no code yet, waiting for refresh.`, 'info');
        } else if (excludedCodeSet.has(code)) {
          log(`Step ${step}: Latest 163 code is excluded: ${code}`, 'info');
        } else if (seenCodes.has(code)) {
          log(`Step ${step}: Latest 163 code was already used: ${code}`, 'info');
        } else {
          seenCodes.add(code);
          persistSeenCodes();
          const source = isFallbackMatch ? 'fallback' : 'new';
          log(`Step ${step}: Code found: ${code} (${source}, subject: ${subject.slice(0, 40)})`, 'ok');

          await deleteEmail(latestMatch, step);
          await sleep(1000);

          return { ok: true, code, emailTimestamp: emailTime, mailId: id };
        }
      }
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`Step ${step}: No new emails after ${FALLBACK_AFTER} attempts, falling back to the latest matching email only`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `No new matching email found on 163 Mail after ${(maxAttempts * intervalMs / 1000).toFixed(0)}s. ` +
    'Check inbox manually.'
  );
}

// ============================================================
// Delete Email via Right-Click Menu
// ============================================================

async function deleteEmail(item, step) {
  try {
    log(`Step ${step}: Deleting email...`);

    // Strategy 1: Click the trash icon inside the mail item
    // Each mail item has: <b class="nui-ico nui-ico-delete" title="删除邮件" sign="trash">
    // These icons appear on hover, so we trigger mouseover first
    item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);

    const trashIcon = item.querySelector('[sign="trash"], .nui-ico-delete, [title="删除邮件"]');
    if (trashIcon) {
      trashIcon.click();
      log(`Step ${step}: Clicked trash icon`, 'ok');
      await sleep(1500);

      // Check if item disappeared (confirm deletion)
      const stillExists = document.getElementById(item.id);
      if (!stillExists || stillExists.style.display === 'none') {
        log(`Step ${step}: Email deleted successfully`);
      } else {
        log(`Step ${step}: Email may not have been deleted, item still visible`, 'warn');
      }
      return;
    }

    // Strategy 2: Select checkbox then click toolbar delete button
    log(`Step ${step}: Trash icon not found, trying checkbox + toolbar delete...`);
    const checkbox = item.querySelector('[sign="checkbox"], .nui-chk');
    if (checkbox) {
      checkbox.click();
      await sleep(300);

      // Click toolbar delete button
      const toolbarBtns = document.querySelectorAll('.nui-btn .nui-btn-text');
      for (const btn of toolbarBtns) {
        if (btn.textContent.replace(/\s/g, '').includes('删除')) {
          btn.closest('.nui-btn').click();
          log(`Step ${step}: Clicked toolbar delete`, 'ok');
          await sleep(1500);
          return;
        }
      }
    }

    log(`Step ${step}: Could not delete email (no delete button found)`, 'warn');
  } catch (err) {
    log(`Step ${step}: Failed to delete email: ${err.message}`, 'warn');
  }
}

// ============================================================
// Inbox Refresh
// ============================================================

async function refreshInbox() {
  // Try toolbar "刷 新" button
  const toolbarBtns = document.querySelectorAll('.nui-btn .nui-btn-text');
  for (const btn of toolbarBtns) {
    if (btn.textContent.replace(/\s/g, '') === '刷新') {
      btn.closest('.nui-btn').click();
      console.log(MAIL163_PREFIX, 'Clicked "刷新" button');
      await sleep(800);
      return;
    }
  }

  // Fallback: click sidebar "收 信"
  const shouXinBtns = document.querySelectorAll('.ra0');
  for (const btn of shouXinBtns) {
    if (btn.textContent.replace(/\s/g, '').includes('收信')) {
      btn.click();
      console.log(MAIL163_PREFIX, 'Clicked "收信" button');
      await sleep(800);
      return;
    }
  }

  console.log(MAIL163_PREFIX, 'Could not find refresh button');
}

// ============================================================
// Verification Code Extraction
// ============================================================

function extractVerificationCode(text) {
  const matchCn = text.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/);
  if (matchCn) return matchCn[1];

  const matchEn = text.match(/code[:\s]+is[:\s]+(\d{6})|code[:\s]+(\d{6})/i);
  if (matchEn) return matchEn[1] || matchEn[2];

  const match6 = text.match(/\b(\d{6})\b/);
  if (match6) return match6[1];

  return null;
}

} // end of isTopFrame else block
})();
