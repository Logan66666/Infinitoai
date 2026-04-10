const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldDisableStepButton } = require('../shared/manual-step-controls.js');

test('step buttons stay enabled when no step is running', () => {
  assert.equal(shouldDisableStepButton({ anyRunning: false }), false);
});

test('step buttons are disabled while a step is actively running', () => {
  assert.equal(shouldDisableStepButton({ anyRunning: true }), true);
});
