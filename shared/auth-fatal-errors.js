(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.AuthFatalErrors = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const UNSUPPORTED_COUNTRY_REGION_TERRITORY_CODE = /unsupported_country_region_territory/i;
  const UNSUPPORTED_COUNTRY_REGION_TERRITORY_MESSAGE = /country,\s*region,\s*or\s*territory\s*not\s*supported/i;
  const AUTH_OPERATION_TIMEOUT_PATTERN = /operation\s+timed\s+out/i;
  const FATAL_PATTERNS = [
    /糟糕，出错了/i,
    /验证过程中出错/i,
    /max_check_attempts/i,
    /请重试/i,
    AUTH_OPERATION_TIMEOUT_PATTERN,
    /oops,\s*something\s*went\s*wrong/i,
    /something\s*went\s*wrong\s*during\s*verification/i,
    /try\s*again/i,
  ];

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function isUnsupportedCountryRegionTerritoryText(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    return UNSUPPORTED_COUNTRY_REGION_TERRITORY_CODE.test(normalized)
      && UNSUPPORTED_COUNTRY_REGION_TERRITORY_MESSAGE.test(normalized);
  }

  function getUnsupportedCountryRegionTerritoryMessage(step) {
    return `Step ${step} blocked: OpenAI does not support the current country, region, or territory. Please change node and retry.`;
  }

  function isAuthOperationTimedOutText(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    return AUTH_OPERATION_TIMEOUT_PATTERN.test(normalized);
  }

  function getAuthOperationTimedOutMessage(step) {
    return `Step ${step} blocked: OpenAI auth page timed out before credentials could be submitted. Refresh the VPS OAuth link and retry with the same email and password.`;
  }

  function isAuthFatalErrorText(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    if (isUnsupportedCountryRegionTerritoryText(normalized)) {
      return true;
    }

    const hasFatalHeadline = /糟糕，出错了|oops,\s*something\s*went\s*wrong/i.test(normalized);
    const hasVerificationFailure = /验证过程中出错|max_check_attempts|something\s*went\s*wrong\s*during\s*verification/i.test(normalized);

    if (hasFatalHeadline && hasVerificationFailure) {
      return true;
    }

    return FATAL_PATTERNS.filter((pattern) => pattern.test(normalized)).length >= 2;
  }

  return {
    getAuthOperationTimedOutMessage,
    getUnsupportedCountryRegionTerritoryMessage,
    isAuthFatalErrorText,
    isAuthOperationTimedOutText,
    isUnsupportedCountryRegionTerritoryText,
  };
});
