'use strict';

// Settings / plans persistence roundtrip tests.

module.exports = {
  'settings.roundtrip': async () => {
    const settings = require('../main/settings');
    const before = settings.getSettings();
    const testVal = Number(before.queueWarnHours) === 5 ? 6 : 5;
    settings.setSettings({ queueWarnHours: testVal });
    const mid = settings.getSettings();
    settings.setSettings({ queueWarnHours: before.queueWarnHours });
    const after = settings.getSettings();
    return {
      ok:
        Number(mid.queueWarnHours) === testVal &&
        Number(after.queueWarnHours) === Number(before.queueWarnHours),
      result: {
        original: before.queueWarnHours,
        testVal,
        restored: after.queueWarnHours
      }
    };
  },

  'plans.roundtrip': async () => {
    const plans = require('../main/plans');
    const temp = {
      name: 'ESP Self-Test Plan',
      scope: 'global',
      characterId: null,
      entries: [{ skillId: 3412, name: 'Self Test Skill', level: 4 }]
    };
    await plans.savePlan(temp);
    const list = await plans.loadPlans();
    const found = (list || []).find((p) => p.name === 'ESP Self-Test Plan');
    if (!found) {
      return { ok: false, error: 'Saved plan not found in list.' };
    }
    await plans.deletePlan(found.id);
    const after = await plans.loadPlans();
    const gone = !(after || []).some((p) => p.id === found.id);
    return { ok: gone, result: { savedId: found.id, deleted: gone } };
  }
};