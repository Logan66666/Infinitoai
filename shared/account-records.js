(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.AccountRecords = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const ACCOUNT_STATUSES = ['pending', 'success', 'add_phone', 'other'];

  function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeTimestamp(value, fallback = '') {
    const text = normalizeString(value);
    if (text) {
      return text;
    }
    return fallback || new Date().toISOString();
  }

  function normalizeAccountStatus(value) {
    const normalized = normalizeString(value).toLowerCase();
    return ACCOUNT_STATUSES.includes(normalized) ? normalized : 'pending';
  }

  function isAddPhoneStatusDetail(detail) {
    return /phone verification|phone number is required|当前 auth 页面要求手机号验证|add-phone|requires phone verification/i.test(String(detail || ''));
  }

  function deriveAccountStatus(detail, fallbackStatus = 'other') {
    if (isAddPhoneStatusDetail(detail)) {
      return 'add_phone';
    }
    return normalizeAccountStatus(fallbackStatus === 'pending' ? 'other' : fallbackStatus);
  }

  function createAccountRecord(payload = {}) {
    const createdAt = normalizeTimestamp(payload.createdAt);
    const updatedAt = normalizeTimestamp(payload.updatedAt, createdAt);

    return {
      id: normalizeString(payload.id) || `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: normalizeString(payload.email).toLowerCase(),
      password: normalizeString(payload.password),
      emailSource: normalizeString(payload.emailSource).toLowerCase(),
      mailProvider: normalizeString(payload.mailProvider).toLowerCase(),
      createdAt,
      updatedAt,
      status: normalizeAccountStatus(payload.status),
      statusDetail: normalizeString(payload.statusDetail),
    };
  }

  function normalizeAccountRecord(record = {}) {
    return createAccountRecord(record);
  }

  function normalizeAccountRecords(records = []) {
    if (!Array.isArray(records)) {
      return [];
    }

    const normalizedRecords = records
      .map(normalizeAccountRecord)
      .filter((record) => record.email || record.password);

    const dedupedRecords = new Map();
    for (const record of normalizedRecords) {
      const key = record.email ? `email:${record.email}` : `id:${record.id}`;
      if (dedupedRecords.has(key)) {
        dedupedRecords.delete(key);
      }
      dedupedRecords.set(key, record);
    }

    return Array.from(dedupedRecords.values());
  }

  function patchAccountRecord(record, updates = {}) {
    return normalizeAccountRecord({
      ...record,
      ...updates,
      id: normalizeString(updates.id) || record.id,
      createdAt: normalizeTimestamp(updates.createdAt, record.createdAt),
      updatedAt: normalizeTimestamp(updates.updatedAt, new Date().toISOString()),
    });
  }

  function updateAccountRecordStatus(record, updates = {}) {
    const detail = normalizeString(updates.statusDetail);
    const requestedStatusRaw = normalizeString(updates.status);
    const requestedStatus = requestedStatusRaw ? normalizeAccountStatus(requestedStatusRaw) : '';
    const nextStatus = detail
      ? deriveAccountStatus(detail, requestedStatus || 'other')
      : (requestedStatus || normalizeAccountStatus(record?.status));

    return patchAccountRecord(record, {
      ...updates,
      status: nextStatus,
      statusDetail: detail,
    });
  }

  function escapeCsvCell(value) {
    const text = String(value ?? '');
    if (!/[",\r\n]/.test(text)) {
      return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  function getAccountRecordMailProviderLabel(record = {}) {
    return normalizeString(record.emailSource).toLowerCase() === 'tmailor'
      ? '--'
      : (normalizeString(record.mailProvider).toLowerCase() || '--');
  }

  function buildAccountRecordsCsv(records = []) {
    const normalizedRecords = normalizeAccountRecords(records);
    const header = [
      'Registered At',
      'Source',
      'Mail Provider',
      'Email',
      'Password',
      'Login Result',
      'Raw Detail',
      'Updated At',
    ];

    const rows = normalizedRecords.map((record) => ([
      record.createdAt,
      record.emailSource,
      getAccountRecordMailProviderLabel(record),
      record.email,
      record.password,
      record.status,
      record.statusDetail,
      record.updatedAt,
    ].map(escapeCsvCell).join(',')));

    return [header.join(','), ...rows].join('\n');
  }

  return {
    ACCOUNT_STATUSES,
    buildAccountRecordsCsv,
    createAccountRecord,
    deriveAccountStatus,
    getAccountRecordMailProviderLabel,
    normalizeAccountRecord,
    normalizeAccountRecords,
    normalizeAccountStatus,
    patchAccountRecord,
    updateAccountRecordStatus,
  };
});
