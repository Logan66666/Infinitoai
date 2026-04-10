(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.ManualStepControls = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function shouldDisableStepButton({ anyRunning }) {
    return Boolean(anyRunning);
  }

  return {
    shouldDisableStepButton,
  };
});
