(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.MailFreshness = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const MAX_VERIFICATION_EMAIL_AGE_MS = 5 * 60 * 1000;
  const FILTER_AFTER_SLACK_MS = 60 * 1000;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function toTimestamp(year, month, day, hour = 0, minute = 0) {
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      0
    ).getTime();
  }

  function parseMailTimestamp(value, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value.getTime();
    }

    const text = String(value || '').trim();
    if (!text) {
      return 0;
    }

    const lowered = text.toLowerCase();

    if (/^(刚刚|just now)$/.test(lowered)) {
      return now;
    }

    let match = text.match(/^(\d+)\s*分钟前$/);
    if (match) {
      return now - (Number(match[1]) * 60 * 1000);
    }

    match = text.match(/^(\d+)\s*minutes?\s*ago$/i);
    if (match) {
      return now - (Number(match[1]) * 60 * 1000);
    }

    const nowDate = new Date(now);
    const currentYear = nowDate.getFullYear();
    const currentMonth = nowDate.getMonth() + 1;
    const currentDay = nowDate.getDate();

    match = text.match(/^昨天\s*(\d{1,2}):(\d{2})$/);
    if (match) {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return toTimestamp(date.getFullYear(), date.getMonth() + 1, date.getDate(), match[1], match[2]);
    }

    match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      let timestamp = toTimestamp(currentYear, currentMonth, currentDay, match[1], match[2]);
      if (timestamp - now > 2 * 60 * 1000) {
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        timestamp = toTimestamp(date.getFullYear(), date.getMonth() + 1, date.getDate(), match[1], match[2]);
      }
      return timestamp;
    }

    match = text.match(/^(\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (match) {
      return toTimestamp(currentYear, match[1], match[2], match[3], match[4]);
    }

    match = text.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日]?\s*(\d{1,2}):(\d{2})$/);
    if (match) {
      return toTimestamp(match[1], match[2], match[3], match[4], match[5]);
    }

    match = text.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日]?$/);
    if (match) {
      return toTimestamp(match[1], match[2], match[3]);
    }

    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function parseMailTimestampCandidates(values, options = {}) {
    for (const value of values || []) {
      const timestamp = parseMailTimestamp(value, options);
      if (timestamp > 0) {
        return timestamp;
      }
    }
    return 0;
  }

  function getFreshMailCutoff(options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const filterAfterTimestamp = Number.isFinite(options.filterAfterTimestamp) ? options.filterAfterTimestamp : 0;
    const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : MAX_VERIFICATION_EMAIL_AGE_MS;

    const freshnessCutoff = now - maxAgeMs;
    const flowCutoff = filterAfterTimestamp > 0 ? Math.max(0, filterAfterTimestamp - FILTER_AFTER_SLACK_MS) : 0;
    return Math.max(freshnessCutoff, flowCutoff);
  }

  function isMailFresh(emailTimestamp, options = {}) {
    if (!Number.isFinite(emailTimestamp) || emailTimestamp <= 0) {
      return false;
    }
    return emailTimestamp >= getFreshMailCutoff(options);
  }

  return {
    FILTER_AFTER_SLACK_MS,
    MAX_VERIFICATION_EMAIL_AGE_MS,
    getFreshMailCutoff,
    isMailFresh,
    parseMailTimestamp,
    parseMailTimestampCandidates,
  };
});
