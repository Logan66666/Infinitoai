(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.SidepanelSettings = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const DEFAULT_AUTO_RUN_COUNT = 1;
  const DEFAULT_AUTO_RUN_INFINITE = false;
  const DEFAULT_AUTO_ROTATE_MAIL_PROVIDER = false;
  const DEFAULT_MAIL_PROVIDER = '163';
  const DEFAULT_EMAIL_SOURCE = 'tmailor';
  const PERSISTED_TOP_SETTING_KEYS = [
    'vpsUrl',
    'mailProvider',
    'emailSource',
    'mailDomainSettings',
    'inbucketHost',
    'inbucketMailbox',
    'autoRunCount',
    'autoRunInfinite',
    'autoRotateMailProvider',
  ];

  function sanitizeAutoRunCount(value) {
    const numeric = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return DEFAULT_AUTO_RUN_COUNT;
    }
    return numeric;
  }

  function sanitizeInfiniteAutoRun(value) {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false' || normalized === '') return false;
    }
    return Boolean(value);
  }

  function sanitizeAutoRotateMailProvider(value) {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false' || normalized === '') return false;
    }
    if (value === undefined || value === null) {
      return DEFAULT_AUTO_ROTATE_MAIL_PROVIDER;
    }
    return Boolean(value);
  }

  function sanitizeMailProvider(value) {
    return value === 'qq' || value === '163' || value === 'inbucket'
      ? value
      : DEFAULT_MAIL_PROVIDER;
  }

  function sanitizeEmailSource(value) {
    return value === '33mail' || value === 'duck' || value === 'tmailor'
      ? value
      : DEFAULT_EMAIL_SOURCE;
  }

  function normalizeEmailDomain(domain) {
    return String(domain || '').trim().replace(/^@+/, '').toLowerCase();
  }

  function normalizeMailDomainSettings(value = {}) {
    return {
      '163': { emailDomain: normalizeEmailDomain(value?.['163']?.emailDomain) },
      qq: { emailDomain: normalizeEmailDomain(value?.qq?.emailDomain) },
      inbucket: { emailDomain: normalizeEmailDomain(value?.inbucket?.emailDomain) },
    };
  }

  function normalizePersistentSettings(value = {}) {
    return {
      vpsUrl: typeof value.vpsUrl === 'string' ? value.vpsUrl : '',
      mailProvider: sanitizeMailProvider(value.mailProvider),
      emailSource: sanitizeEmailSource(value.emailSource),
      mailDomainSettings: normalizeMailDomainSettings(value.mailDomainSettings),
      inbucketHost: typeof value.inbucketHost === 'string' ? value.inbucketHost : '',
      inbucketMailbox: typeof value.inbucketMailbox === 'string' ? value.inbucketMailbox : '',
      autoRunCount: sanitizeAutoRunCount(value.autoRunCount),
      autoRunInfinite: sanitizeInfiniteAutoRun(value.autoRunInfinite),
      autoRotateMailProvider: sanitizeAutoRotateMailProvider(value.autoRotateMailProvider),
    };
  }

  function buildTopSettingPayload(value = {}) {
    const normalized = normalizePersistentSettings(value);
    return {
      ...normalized,
      vpsUrl: normalized.vpsUrl.trim(),
      inbucketHost: normalized.inbucketHost.trim(),
      inbucketMailbox: normalized.inbucketMailbox.trim(),
    };
  }

  return {
    buildTopSettingPayload,
    DEFAULT_AUTO_RUN_COUNT,
    DEFAULT_AUTO_RUN_INFINITE,
    DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
    DEFAULT_EMAIL_SOURCE,
    PERSISTED_TOP_SETTING_KEYS,
    normalizePersistentSettings,
    sanitizeAutoRunCount,
    sanitizeAutoRotateMailProvider,
    sanitizeEmailSource,
    sanitizeInfiniteAutoRun,
  };
});
