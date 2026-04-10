// sidepanel/sidepanel.js — Side Panel logic

const STATUS_ICONS = {
  pending: '',
  running: '',
  completed: '\u2713',  // ✓
  failed: '\u2717',     // ✗
  stopped: '\u25A0',    // ■
};

const logArea = document.getElementById('log-area');
const displayOauthUrl = document.getElementById('display-oauth-url');
const displayLocalhostUrl = document.getElementById('display-localhost-url');
const displayStatus = document.getElementById('display-status');
const statusBar = document.getElementById('status-bar');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const btnCopyEmail = document.getElementById('btn-copy-email');
const btnCopyPassword = document.getElementById('btn-copy-password');
const btnFetchEmail = document.getElementById('btn-fetch-email');
const btnTogglePassword = document.getElementById('btn-toggle-password');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const stepsProgress = document.getElementById('steps-progress');
const btnAutoRun = document.getElementById('btn-auto-run');
const btnAutoContinue = document.getElementById('btn-auto-continue');
const autoContinueBar = document.getElementById('auto-continue-bar');
const autoContinueHint = document.getElementById('auto-continue-hint');
const btnClearLog = document.getElementById('btn-clear-log');
const inputVpsUrl = document.getElementById('input-vps-url');
const displayRunSuccess = document.getElementById('display-run-success');
const displayRunFailure = document.getElementById('display-run-failure');
const rowMailProvider = document.getElementById('row-mail-provider');
const selectMailProvider = document.getElementById('select-mail-provider');
const selectEmailSource = document.getElementById('select-email-source');
const row33MailSettings = document.getElementById('row-33mail-settings');
const row33MailRotate = document.getElementById('row-33mail-rotate');
const input33MailDomain163 = document.getElementById('input-33mail-domain-163');
const input33MailDomainQq = document.getElementById('input-33mail-domain-qq');
const inputAutoRotateMailProvider = document.getElementById('input-auto-rotate-mail-provider');
const rowInbucketHost = document.getElementById('row-inbucket-host');
const inputInbucketHost = document.getElementById('input-inbucket-host');
const rowInbucketMailbox = document.getElementById('row-inbucket-mailbox');
const inputInbucketMailbox = document.getElementById('input-inbucket-mailbox');
const inputRunCount = document.getElementById('input-run-count');
const inputRunInfinite = document.getElementById('input-run-infinite');
  const rowTmailorDomains = document.getElementById('row-tmailor-domains');
  const summaryTmailorWhitelist = document.getElementById('summary-tmailor-whitelist');
  const summaryTmailorBlacklist = document.getElementById('summary-tmailor-blacklist');
  const tbodyTmailorWhitelist = document.getElementById('tbody-tmailor-whitelist');
  const tbodyTmailorBlacklist = document.getElementById('tbody-tmailor-blacklist');
  const selectTmailorDomainMode = document.getElementById('select-tmailor-domain-mode');
const mailDomainGroups = [...document.querySelectorAll('.mail-domain-group')];
const mailDomainInputs = {
  '163': input33MailDomain163,
  qq: input33MailDomainQq,
};
const DEFAULT_AUTO_RUN_COUNT = 1;
const {
  DEFAULT_EMAIL_SOURCE,
  createDefault33MailDomainSettings,
  normalize33MailDomainSettings,
  sanitizeEmailSource,
} = EmailAddresses;
const {
  buildTopSettingPayload,
} = SidepanelSettings;
const { shouldDisableStepButton } = ManualStepControls;
  const {
    normalizeTmailorDomainState,
    sanitizeTmailorDomainMode,
    DEFAULT_TMAILOR_DOMAIN_MODE,
    TMAILOR_DOMAIN_MODES,
    validateTmailorEmail,
  } = TmailorDomains;
  const TMAILOR_DOMAIN_MODE_LABELS = {
    com_only: '仅 .com / 白名单',
    whitelist_only: '仅白名单',
  };
const { buildToastKey, canonicalizeToastMessage, getToastDuration } = ToastFeedback;
  let mailDomainSettingsState = createDefault33MailDomainSettings();
  let tmailorDomainState = normalizeTmailorDomainState();
  renderTmailorModeOptions();

const ACTION_ICONS = {
  copy: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2"></rect>
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path>
    </svg>
  `,
  fetch: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v4"></path>
      <path d="M12 17v4"></path>
      <path d="M4.93 4.93l2.83 2.83"></path>
      <path d="M16.24 16.24l2.83 2.83"></path>
      <path d="M3 12h4"></path>
      <path d="M17 12h4"></path>
      <path d="M4.93 19.07l2.83-2.83"></path>
      <path d="M16.24 7.76l2.83-2.83"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `,
  pasteCheck: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 4h8"></path>
      <path d="M9 2h6v4H9z"></path>
      <path d="M7 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8"></path>
      <path d="M14 16l2 2 4-4"></path>
    </svg>
  `,
  busy: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3.2-6.9"></path>
      <path d="M21 3v6h-6"></path>
    </svg>
  `,
  eye: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `,
  eyeOff: `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 3l18 18"></path>
      <path d="M10.6 10.6A3 3 0 0 0 14.4 14.4"></path>
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.08 3.81"></path>
      <path d="M6.61 6.61A17.33 17.33 0 0 0 2 12s3.5 7 10 7a10.94 10.94 0 0 0 5.39-1.61"></path>
    </svg>
  `,
};

// ============================================================
// Toast Notifications
// ============================================================

const toastContainer = document.getElementById('toast-container');
const activeToasts = new Map();

const TOAST_ICONS = {
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function showToast(message, type = 'error', duration, options = {}) {
  const resolvedDuration = getToastDuration(type, duration);
  const toastKey = buildToastKey(message, type);
  const existing = activeToasts.get(toastKey);
  const displayMessage = options.canonicalizeDisplay
    ? canonicalizeToastMessage(message)
    : message;

  if (existing?.toast?.parentNode) {
    existing.messageEl.textContent = displayMessage;
    scheduleToastDismiss(existing.toast, resolvedDuration);
    return existing.toast;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${TOAST_ICONS[type] || ''}<span class="toast-msg">${escapeHtml(displayMessage)}</span><button class="toast-close">&times;</button>`;
  toast.dataset.toastKey = toastKey;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  activeToasts.set(toastKey, {
    toast,
    messageEl: toast.querySelector('.toast-msg'),
  });
  toastContainer.appendChild(toast);
  scheduleToastDismiss(toast, resolvedDuration);
  return toast;
}

function scheduleToastDismiss(toast, duration) {
  if (toast._dismissTimer) {
    clearTimeout(toast._dismissTimer);
    toast._dismissTimer = null;
  }
  if (duration > 0) {
    toast._dismissTimer = setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  if (toast._dismissTimer) {
    clearTimeout(toast._dismissTimer);
    toast._dismissTimer = null;
  }
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => {
    const toastKey = toast.dataset.toastKey;
    if (toastKey && activeToasts.get(toastKey)?.toast === toast) {
      activeToasts.delete(toastKey);
    }
    toast.remove();
  }, { once: true });
}

// ============================================================
// State Restore on load
// ============================================================

async function restoreState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });

    if (state.oauthUrl) {
      displayOauthUrl.textContent = state.oauthUrl;
      displayOauthUrl.classList.add('has-value');
    }
    if (state.localhostUrl) {
      displayLocalhostUrl.textContent = state.localhostUrl;
      displayLocalhostUrl.classList.add('has-value');
    }
    if (state.email) {
      inputEmail.value = state.email;
    }
    syncPasswordField(state);
    if (state.vpsUrl) {
      inputVpsUrl.value = state.vpsUrl;
    }
    if (state.mailProvider) {
      selectMailProvider.value = state.mailProvider;
    }
    selectEmailSource.value = sanitizeEmailSource(state.emailSource);
    mailDomainSettingsState = normalize33MailDomainSettings(state.mailDomainSettings);
    tmailorDomainState = normalizeTmailorDomainState(state.tmailorDomainState);
    inputAutoRotateMailProvider.checked = Boolean(state.autoRotateMailProvider);
    if (state.inbucketHost) {
      inputInbucketHost.value = state.inbucketHost;
    }
    if (state.inbucketMailbox) {
      inputInbucketMailbox.value = state.inbucketMailbox;
    }
    inputRunCount.value = String(state.autoRunCount || DEFAULT_AUTO_RUN_COUNT);
    inputRunInfinite.checked = Boolean(state.autoRunInfinite);

    if (state.stepStatuses) {
      for (const [step, status] of Object.entries(state.stepStatuses)) {
        updateStepUI(Number(step), status);
      }
    }

    if (state.logs) {
      for (const entry of state.logs) {
        appendLog(entry);
      }
    }

    updateAutoRunStatsDisplay(state.autoRunStats);
    updateStatusDisplay(state);
    updateProgressCounter();
    updateMailProviderUI();
    updateEmailSourceUI();
    renderTmailorDomainTables();
    updateRunModeUI();
  } catch (err) {
    console.error('Failed to restore state:', err);
  }
}

function syncPasswordField(state) {
  inputPassword.value = state.customPassword || state.password || '';
}

function updateAutoRunStatsDisplay(stats = {}) {
  const successfulRuns = Math.max(0, Number.parseInt(String(stats.successfulRuns ?? 0), 10) || 0);
  const failedRuns = Math.max(0, Number.parseInt(String(stats.failedRuns ?? 0), 10) || 0);
  displayRunSuccess.textContent = `成功 ${successfulRuns}`;
  displayRunFailure.textContent = `失败 ${failedRuns}`;
}

function updateMailProviderUI() {
  const source = sanitizeEmailSource(selectEmailSource.value);
  const useInbucket = selectMailProvider.value === 'inbucket';
  rowMailProvider.style.display = source === 'tmailor' ? 'none' : '';
  rowInbucketHost.style.display = useInbucket ? '' : 'none';
  rowInbucketMailbox.style.display = useInbucket ? '' : 'none';
}

function getEmailSourceLabel() {
  if (selectEmailSource.value === '33mail') return '33mail';
  if (selectEmailSource.value === 'tmailor') return 'TMailor';
  return 'Duck';
}

function getCurrentProviderLabel() {
  if (selectMailProvider.value === 'qq') return 'QQ';
  if (selectMailProvider.value === 'inbucket') return 'Inbucket';
  return '163';
}

function update33MailGroupUI() {
  input33MailDomain163.value = mailDomainSettingsState['163']?.emailDomain || '';
  input33MailDomainQq.value = mailDomainSettingsState.qq?.emailDomain || '';

  mailDomainGroups.forEach((group) => {
    const provider = group.dataset.provider;
    group.classList.toggle('active', provider === selectMailProvider.value);
  });
}

function updateEmailSourceUI() {
  const emailSource = sanitizeEmailSource(selectEmailSource.value);
  const is33Mail = emailSource === '33mail';
  const isTmailor = emailSource === 'tmailor';
  const currentProvider = selectMailProvider.value;
  const isGroupedMailProvider = currentProvider === '163' || currentProvider === 'qq';

  row33MailSettings.style.display = is33Mail ? '' : 'none';
  row33MailRotate.style.display = is33Mail ? '' : 'none';
  rowTmailorDomains.style.display = isTmailor ? '' : 'none';
  update33MailGroupUI();
  updateMailProviderUI();

  inputEmail.placeholder = is33Mail
    ? isGroupedMailProvider
      ? 'Step 3 will generate a 33mail address automatically'
      : '33mail uses the 163 / QQ groups'
    : isTmailor
      ? 'Step 3 will generate a TMailor address automatically'
    : 'Paste DuckDuckGo email';
  renderFetchButton(false);
  autoContinueHint.textContent = is33Mail
    ? inputAutoRotateMailProvider.checked
      ? 'Auto mode will rotate the 163 / QQ 33mail groups by run'
      : 'Select 163 or QQ, configure its domain, then continue'
    : isTmailor
      ? 'Use Auto to generate a TMailor address, then continue'
    : 'Use Auto to fetch Duck email, or paste manually, then continue';
}

function createDomainRowHtml(domain, stats) {
  const successCount = Math.max(0, Number.parseInt(String(stats?.successCount ?? 0), 10) || 0);
  const failureCount = Math.max(0, Number.parseInt(String(stats?.failureCount ?? 0), 10) || 0);
  return `
    <tr>
      <td>${escapeHtml(domain)}</td>
      <td class="num">${successCount}</td>
      <td class="num">${failureCount}</td>
    </tr>
  `;
}

  function renderDomainRows(tbody, domains) {
    if (domains.length === 0) {
      tbody.innerHTML = '<tr><td class="empty" colspan="3">暂无数据</td></tr>';
      return;
    }

    tbody.innerHTML = domains
      .map((domain) => createDomainRowHtml(domain, tmailorDomainState.stats?.[domain] || {}))
      .join('');
  }

  function renderTmailorModeOptions() {
    if (!selectTmailorDomainMode) {
      return;
    }

    selectTmailorDomainMode.innerHTML = TMAILOR_DOMAIN_MODES
      .map((mode) => `<option value="${mode}">${TMAILOR_DOMAIN_MODE_LABELS[mode] || mode}</option>`)
      .join('');
  }

  async function persistTmailorDomainMode(rawMode) {
    if (!selectTmailorDomainMode) {
      return;
    }

    const nextMode = sanitizeTmailorDomainMode(rawMode);
    if (nextMode === tmailorDomainState.mode) {
      selectTmailorDomainMode.value = nextMode;
      return;
    }

    tmailorDomainState = normalizeTmailorDomainState({
      ...tmailorDomainState,
      mode: nextMode,
    });

    selectTmailorDomainMode.value = nextMode;
    renderTmailorDomainTables();

    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_TMAILOR_DOMAIN_STATE',
        source: 'sidepanel',
        payload: { mode: nextMode },
      });
    } catch (err) {
      console.error('Failed to save TMailor domain mode:', err);
    }
  }

  function renderTmailorDomainTables() {
    const normalizedState = normalizeTmailorDomainState(tmailorDomainState);
    tmailorDomainState = normalizedState;
    if (selectTmailorDomainMode) {
      selectTmailorDomainMode.value = normalizedState.mode;
    }

    const whitelistDomains = [...normalizedState.whitelist].sort((left, right) => left.localeCompare(right));
  const blacklistDomains = [...normalizedState.blacklist].sort((left, right) => left.localeCompare(right));
  const whitelistTotals = whitelistDomains.reduce((acc, domain) => {
    const stats = normalizedState.stats?.[domain] || {};
    acc.success += Math.max(0, Number.parseInt(String(stats.successCount ?? 0), 10) || 0);
    acc.failure += Math.max(0, Number.parseInt(String(stats.failureCount ?? 0), 10) || 0);
    return acc;
  }, { success: 0, failure: 0 });
  const blacklistTotals = blacklistDomains.reduce((acc, domain) => {
    const stats = normalizedState.stats?.[domain] || {};
    acc.success += Math.max(0, Number.parseInt(String(stats.successCount ?? 0), 10) || 0);
    acc.failure += Math.max(0, Number.parseInt(String(stats.failureCount ?? 0), 10) || 0);
    return acc;
  }, { success: 0, failure: 0 });

  summaryTmailorWhitelist.textContent = `白名单域名 (${whitelistDomains.length}) · 成 ${whitelistTotals.success} / 败 ${whitelistTotals.failure}`;
  summaryTmailorBlacklist.textContent = `黑名单域名 (${blacklistDomains.length}) · 成 ${blacklistTotals.success} / 败 ${blacklistTotals.failure}`;

  renderDomainRows(tbodyTmailorWhitelist, whitelistDomains);
  renderDomainRows(tbodyTmailorBlacklist, blacklistDomains);
}

function updateRunModeUI() {
  inputRunCount.disabled = btnAutoRun.disabled || inputRunInfinite.checked;
  inputRunCount.title = inputRunInfinite.checked ? 'Ignored in infinite mode' : 'Number of runs';
}

function renderFetchButton(isBusy = false) {
  const emailSource = sanitizeEmailSource(selectEmailSource.value);
  const idleIcon = emailSource === 'tmailor' ? ACTION_ICONS.pasteCheck : ACTION_ICONS.fetch;
  btnFetchEmail.innerHTML = isBusy ? ACTION_ICONS.busy : idleIcon;
  btnFetchEmail.classList.toggle('is-busy', isBusy);
  btnFetchEmail.title = isBusy
    ? emailSource === 'tmailor'
      ? 'Pasting and validating email...'
      : 'Generating or fetching email...'
    : emailSource === 'tmailor'
      ? 'Paste and validate email'
      : emailSource === '33mail'
      ? 'Generate email'
      : 'Fetch email';
  btnFetchEmail.setAttribute('aria-label', btnFetchEmail.title);
}

function renderPasswordToggleButton() {
  const hidden = inputPassword.type === 'password';
  btnTogglePassword.innerHTML = hidden ? ACTION_ICONS.eye : ACTION_ICONS.eyeOff;
  btnTogglePassword.title = hidden ? 'Show password' : 'Hide password';
  btnTogglePassword.setAttribute('aria-label', btnTogglePassword.title);
}

async function copyFieldValue(input, emptyMessage, successMessage) {
  const value = input.value.trim();
  if (!value) {
    showToast(emptyMessage, 'warn', 2500);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage, 'success', 2200);
  } catch (err) {
    showToast(`Copy failed: ${err.message}`, 'error');
  }
}

function renderStaticActionButtons() {
  btnCopyEmail.innerHTML = ACTION_ICONS.copy;
  btnCopyPassword.innerHTML = ACTION_ICONS.copy;
}

function formatAutoRunWaitUntil(waitUntilTimestamp) {
  if (!Number.isFinite(waitUntilTimestamp)) return '';
  const remainingMs = Math.max(0, waitUntilTimestamp - Date.now());
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

// ============================================================
// UI Updates
// ============================================================

function updateStepUI(step, status) {
  const statusEl = document.querySelector(`.step-status[data-step="${step}"]`);
  const row = document.querySelector(`.step-row[data-step="${step}"]`);

  if (statusEl) statusEl.textContent = STATUS_ICONS[status] || '';
  if (row) {
    row.className = `step-row ${status}`;
  }

  updateButtonStates();
  updateProgressCounter();
}

function updateProgressCounter() {
  let completed = 0;
  document.querySelectorAll('.step-row').forEach(row => {
    if (row.classList.contains('completed')) completed++;
  });
  stepsProgress.textContent = `${completed} / 9`;
}

function updateButtonStates() {
  const statuses = {};
  document.querySelectorAll('.step-row').forEach(row => {
    const step = Number(row.dataset.step);
    if (row.classList.contains('completed')) statuses[step] = 'completed';
    else if (row.classList.contains('running')) statuses[step] = 'running';
    else if (row.classList.contains('failed')) statuses[step] = 'failed';
    else if (row.classList.contains('stopped')) statuses[step] = 'stopped';
    else statuses[step] = 'pending';
  });

  const anyRunning = Object.values(statuses).some(s => s === 'running');

  for (let step = 1; step <= 9; step++) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;
    btn.disabled = shouldDisableStepButton({ anyRunning, step, statuses });
  }

  updateStopButtonState(anyRunning || autoContinueBar.style.display !== 'none');
}

function updateStopButtonState(active) {
  btnStop.disabled = !active;
}

function updateStatusDisplay(state) {
  if (!state || !state.stepStatuses) return;

  statusBar.className = 'status-bar';

  const running = Object.entries(state.stepStatuses).find(([, s]) => s === 'running');
  if (running) {
    displayStatus.textContent = `Step ${running[0]} running...`;
    statusBar.classList.add('running');
    return;
  }

  const failed = Object.entries(state.stepStatuses).find(([, s]) => s === 'failed');
  if (failed) {
    displayStatus.textContent = `Step ${failed[0]} failed`;
    statusBar.classList.add('failed');
    return;
  }

  const stopped = Object.entries(state.stepStatuses).find(([, s]) => s === 'stopped');
  if (stopped) {
    displayStatus.textContent = `Step ${stopped[0]} stopped`;
    statusBar.classList.add('stopped');
    return;
  }

  const lastCompleted = Object.entries(state.stepStatuses)
    .filter(([, s]) => s === 'completed')
    .map(([k]) => Number(k))
    .sort((a, b) => b - a)[0];

  if (lastCompleted === 9) {
    displayStatus.textContent = 'All steps completed!';
    statusBar.classList.add('completed');
  } else if (lastCompleted) {
    displayStatus.textContent = `Step ${lastCompleted} done`;
  } else {
    displayStatus.textContent = 'Ready';
  }
}

function appendLog(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const levelLabel = entry.level.toUpperCase();
  const line = document.createElement('div');
  line.className = `log-line log-${entry.level}`;

  const stepMatch = entry.message.match(/Step (\d)/);
  const stepNum = stepMatch ? stepMatch[1] : null;

  let html = `<span class="log-time">${time}</span> `;
  html += `<span class="log-level log-level-${entry.level}">${levelLabel}</span> `;
  if (stepNum) {
    html += `<span class="log-step-tag step-${stepNum}">S${stepNum}</span>`;
  }
  html += `<span class="log-msg">${escapeHtml(entry.message)}</span>`;

  line.innerHTML = html;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setMailDomainForProvider(provider, value) {
  mailDomainSettingsState = normalize33MailDomainSettings({
    ...mailDomainSettingsState,
    [provider]: { emailDomain: value },
  });
}

async function fetchEmailAddress() {
  btnFetchEmail.disabled = true;
  renderFetchButton(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_EMAIL_ADDRESS',
      source: 'sidepanel',
      payload: { generateNew: true },
    });

    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.email) {
      throw new Error('Email address was not returned.');
    }

    if (response.mailProvider) {
      selectMailProvider.value = response.mailProvider;
      updateMailProviderUI();
      updateEmailSourceUI();
    }
    inputEmail.value = response.email;
    const providerLabel = response.mailProvider === 'qq'
      ? 'QQ'
      : response.mailProvider === '163'
        ? '163'
        : getCurrentProviderLabel();
    const isGeneratedSource = response.emailSource === '33mail' || response.emailSource === 'tmailor';
    showToast(
      `${isGeneratedSource ? 'Ready' : 'Fetched'} ${response.email}${response.emailSource === '33mail' ? ` · ${providerLabel}` : ''}`,
      'success',
      3500
    );
    return response.email;
  } catch (err) {
    showToast(`${getEmailSourceLabel()} error: ${err.message}`, 'error');
    throw err;
  } finally {
    btnFetchEmail.disabled = false;
    renderFetchButton(false);
  }
}

function getClipboardEmailCandidate(rawText) {
  const text = String(rawText || '').trim();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return (match?.[0] || text).trim();
}

async function pasteAndValidateTmailorEmail() {
  btnFetchEmail.disabled = true;
  renderFetchButton(true);

  try {
    const clipboardText = await navigator.clipboard.readText();
    const candidate = getClipboardEmailCandidate(clipboardText);
    const validation = validateTmailorEmail(tmailorDomainState, candidate);

    if (!validation.ok) {
      if (validation.reason === 'invalid_email') {
        throw new Error('No valid email found in clipboard.');
      }

      const modeLabel = tmailorDomainState.mode === 'whitelist_only' ? '当前仅白名单模式' : '当前域名规则';
      throw new Error(`${validation.domain || 'unknown domain'} not allowed by ${modeLabel}.`);
    }

    inputEmail.value = validation.email;
    await chrome.runtime.sendMessage({
      type: 'SAVE_EMAIL',
      source: 'sidepanel',
      payload: { email: validation.email },
    });

    if (autoContinueBar.style.display !== 'none') {
      autoContinueBar.style.display = 'none';
      await chrome.runtime.sendMessage({
        type: 'RESUME_AUTO_RUN',
        source: 'sidepanel',
        payload: { email: validation.email },
      });
      showToast(`Accepted ${validation.email} · resumed`, 'success', 3000);
      return validation.email;
    }

    showToast(`Accepted ${validation.email}`, 'success', 2600);
    return validation.email;
  } catch (err) {
    showToast(`Paste check failed: ${err.message}`, 'error');
    throw err;
  } finally {
    btnFetchEmail.disabled = false;
    renderFetchButton(false);
  }
}

function syncPasswordToggleLabel() {
  renderPasswordToggleButton();
}

// ============================================================
// Button Handlers
// ============================================================

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const step = Number(btn.dataset.step);
    await persistCurrentTopSettings();
    if (step === 3) {
      const email = inputEmail.value.trim();
      if (!['33mail', 'tmailor'].includes(sanitizeEmailSource(selectEmailSource.value)) && !email) {
        showToast('Please paste email address or use Auto first', 'warn');
        return;
      }
      await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: email ? { step, email } : { step } });
    } else {
      await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step } });
    }
  });
});

btnFetchEmail.addEventListener('click', async () => {
  await persistCurrentTopSettings();
  if (sanitizeEmailSource(selectEmailSource.value) === 'tmailor') {
    await pasteAndValidateTmailorEmail().catch(() => {});
    return;
  }
  await fetchEmailAddress().catch(() => {});
});

btnCopyEmail.addEventListener('click', async () => {
  await copyFieldValue(inputEmail, 'Email is empty', 'Email copied');
});

btnCopyPassword.addEventListener('click', async () => {
  await copyFieldValue(inputPassword, 'Password is empty', 'Password copied');
});

btnTogglePassword.addEventListener('click', () => {
  inputPassword.type = inputPassword.type === 'password' ? 'text' : 'password';
  syncPasswordToggleLabel();
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await chrome.runtime.sendMessage({ type: 'STOP_FLOW', source: 'sidepanel', payload: {} });
  showToast('Stopping...', 'warn', 2200);
});

// Auto Run
btnAutoRun.addEventListener('click', async () => {
  const totalRuns = parseInt(inputRunCount.value) || 1;
  const infiniteMode = inputRunInfinite.checked;
  await persistCurrentTopSettings({ autoRunCount: totalRuns, autoRunInfinite: infiniteMode });
  btnAutoRun.disabled = true;
  inputRunInfinite.disabled = true;
  updateRunModeUI();
  btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Running...';
  await chrome.runtime.sendMessage({ type: 'AUTO_RUN', source: 'sidepanel', payload: { totalRuns, infiniteMode } });
});

btnAutoContinue.addEventListener('click', async () => {
  const email = inputEmail.value.trim();
  if (!['33mail', 'tmailor'].includes(sanitizeEmailSource(selectEmailSource.value)) && !email) {
    showToast('Fetch or paste an email first', 'warn');
    return;
  }
  autoContinueBar.style.display = 'none';
  await chrome.runtime.sendMessage({ type: 'RESUME_AUTO_RUN', source: 'sidepanel', payload: email ? { email } : {} });
});

// Reset
btnReset.addEventListener('click', async () => {
  if (confirm('Reset all steps and data?')) {
    await chrome.runtime.sendMessage({ type: 'RESET', source: 'sidepanel' });
    displayOauthUrl.textContent = 'Waiting...';
    displayOauthUrl.classList.remove('has-value');
    displayLocalhostUrl.textContent = 'Waiting...';
    displayLocalhostUrl.classList.remove('has-value');
    inputEmail.value = '';
    displayStatus.textContent = 'Ready';
    statusBar.className = 'status-bar';
    logArea.innerHTML = '';
    document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
    document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
    btnAutoRun.disabled = false;
    inputRunInfinite.disabled = false;
    btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Auto';
    autoContinueBar.style.display = 'none';
    updateStopButtonState(false);
    updateButtonStates();
    updateProgressCounter();
    updateRunModeUI();
  }
});

// Clear log
btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
});

async function saveTopSetting(payload) {
  await chrome.runtime.sendMessage({
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload,
  });
}

function collectTopSettingPayload(overrides = {}) {
  return buildTopSettingPayload({
    vpsUrl: inputVpsUrl.value,
    mailProvider: selectMailProvider.value,
    emailSource: selectEmailSource.value,
    mailDomainSettings: mailDomainSettingsState,
    inbucketHost: inputInbucketHost.value,
    inbucketMailbox: inputInbucketMailbox.value,
    autoRunCount: inputRunCount.value,
    autoRunInfinite: inputRunInfinite.checked,
    autoRotateMailProvider: inputAutoRotateMailProvider.checked,
    ...overrides,
  });
}

async function persistCurrentTopSettings(overrides = {}) {
  await saveTopSetting(collectTopSettingPayload(overrides));
}

// Save settings on change
inputEmail.addEventListener('change', async () => {
  const email = inputEmail.value.trim();
  if (email) {
    await chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', source: 'sidepanel', payload: { email } });
  }
});

inputVpsUrl.addEventListener('input', async () => {
  const vpsUrl = inputVpsUrl.value.trim();
  await saveTopSetting({ vpsUrl });
});

inputPassword.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload: { customPassword: inputPassword.value },
  });
});

selectMailProvider.addEventListener('change', async () => {
  updateMailProviderUI();
  updateEmailSourceUI();
  await saveTopSetting({ mailProvider: selectMailProvider.value });
});

selectEmailSource.addEventListener('change', async () => {
  updateEmailSourceUI();
  await saveTopSetting({ emailSource: selectEmailSource.value });
});

Object.entries(mailDomainInputs).forEach(([provider, input]) => {
  input.addEventListener('input', async () => {
    setMailDomainForProvider(provider, input.value.trim());
    updateEmailSourceUI();
    await saveTopSetting({ mailDomainSettings: mailDomainSettingsState });
  });
});

inputAutoRotateMailProvider.addEventListener('change', async () => {
  updateEmailSourceUI();
  await saveTopSetting({ autoRotateMailProvider: inputAutoRotateMailProvider.checked });
});

inputInbucketMailbox.addEventListener('change', async () => {
  await saveTopSetting({ inbucketMailbox: inputInbucketMailbox.value.trim() });
});

inputInbucketHost.addEventListener('change', async () => {
  await saveTopSetting({ inbucketHost: inputInbucketHost.value.trim() });
});

  inputRunCount.addEventListener('input', async () => {
    const count = parseInt(inputRunCount.value, 10);
    await saveTopSetting({ autoRunCount: Number.isFinite(count) && count > 0 ? count : DEFAULT_AUTO_RUN_COUNT });
  });

  inputRunInfinite.addEventListener('change', async () => {
    updateRunModeUI();
    await saveTopSetting({ autoRunInfinite: inputRunInfinite.checked });
  });

  if (selectTmailorDomainMode) {
    selectTmailorDomainMode.addEventListener('change', () => {
      void persistTmailorDomainMode(selectTmailorDomainMode.value);
    });
  }

// ============================================================
// Listen for Background broadcasts
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'LOG_ENTRY':
      appendLog(message.payload);
      if (message.payload.level === 'error') {
        showToast(message.payload.message, 'error', undefined, { canonicalizeDisplay: true });
      }
      break;

    case 'STEP_STATUS_CHANGED': {
      const { step, status } = message.payload;
      updateStepUI(step, status);
      chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' }).then(updateStatusDisplay);
      if (status === 'completed') {
        chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' }).then(state => {
          syncPasswordField(state);
          if (state.oauthUrl) {
            displayOauthUrl.textContent = state.oauthUrl;
            displayOauthUrl.classList.add('has-value');
          }
          if (state.localhostUrl) {
            displayLocalhostUrl.textContent = state.localhostUrl;
            displayLocalhostUrl.classList.add('has-value');
          }
        });
      }
      break;
    }

    case 'AUTO_RUN_RESET': {
      // Full UI reset for next run
      displayOauthUrl.textContent = 'Waiting...';
      displayOauthUrl.classList.remove('has-value');
      displayLocalhostUrl.textContent = 'Waiting...';
      displayLocalhostUrl.classList.remove('has-value');
      inputEmail.value = '';
      displayStatus.textContent = 'Ready';
      statusBar.className = 'status-bar';
      logArea.innerHTML = '';
      document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
      document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
      updateStopButtonState(false);
      updateProgressCounter();
      break;
    }

    case 'DATA_UPDATED': {
      if (message.payload.email) {
        inputEmail.value = message.payload.email;
      }
      if (message.payload.password !== undefined) {
        inputPassword.value = message.payload.password || '';
      }
      if (message.payload.mailProvider) {
        selectMailProvider.value = message.payload.mailProvider;
        updateMailProviderUI();
        updateEmailSourceUI();
      }
      if (message.payload.tmailorDomainState) {
        tmailorDomainState = normalizeTmailorDomainState(message.payload.tmailorDomainState);
        renderTmailorDomainTables();
      }
      if (message.payload.oauthUrl) {
        displayOauthUrl.textContent = message.payload.oauthUrl;
        displayOauthUrl.classList.add('has-value');
      }
      if (message.payload.localhostUrl) {
        displayLocalhostUrl.textContent = message.payload.localhostUrl;
        displayLocalhostUrl.classList.add('has-value');
      }
      break;
    }

    case 'AUTO_RUN_STATUS': {
      const { phase, currentRun, totalRuns, infiniteMode, summaryToast, successfulRuns, failedRuns, waitUntilTimestamp } = message.payload;
      updateAutoRunStatsDisplay({ successfulRuns, failedRuns });
      const runLabel = infiniteMode
        ? ` (${currentRun}/∞)`
        : totalRuns > 1 ? ` (${currentRun}/${totalRuns})` : '';
      switch (phase) {
        case 'waiting_email':
          autoContinueBar.style.display = 'flex';
          btnAutoRun.innerHTML = `Paused${runLabel}`;
          updateStopButtonState(true);
          break;
        case 'running':
          btnAutoRun.innerHTML = `Running${runLabel}`;
          updateStopButtonState(true);
          break;
        case 'waiting_rotation': {
          const waitLabel = formatAutoRunWaitUntil(waitUntilTimestamp);
          btnAutoRun.innerHTML = `Waiting${runLabel}`;
          updateStopButtonState(true);
          if (waitLabel) {
            showToast(`33mail 达到上限，约 ${waitLabel} 后继续`, 'warn', 3600);
          }
          break;
        }
        case 'complete':
          btnAutoRun.disabled = false;
          inputRunInfinite.disabled = false;
          btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Auto';
          autoContinueBar.style.display = 'none';
          updateStopButtonState(false);
          updateRunModeUI();
          if (summaryToast) {
            showToast(summaryToast, 'success', 4200);
          }
          break;
        case 'stopped':
          btnAutoRun.disabled = false;
          inputRunInfinite.disabled = false;
          btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Auto';
          autoContinueBar.style.display = 'none';
          updateStopButtonState(false);
          updateRunModeUI();
          if (summaryToast) {
            showToast(summaryToast, 'warn', 3600);
          }
          break;
      }
      break;
    }
  }
});

// ============================================================
// Theme Toggle
// ============================================================

const btnTheme = document.getElementById('btn-theme');

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('multipage-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('multipage-theme');
  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  }
}

btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// ============================================================
// Init
// ============================================================

initTheme();
renderStaticActionButtons();
restoreState().then(() => {
  syncPasswordToggleLabel();
  updateButtonStates();
  updateRunModeUI();
});
