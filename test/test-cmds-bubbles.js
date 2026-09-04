'use strict';

// Bubble notification test commands.

module.exports = {
  'bubble.skill': async (payload) => {
    const notifications = require('../main/notifications');
    notifications.notifySkillCompleted({
      characterName: payload.characterName || 'Test Character',
      skillName: payload.skillName || 'Test Skill',
      level: payload.level ?? 5
    });
    return { ok: true };
  },

  'bubble.queue': async (payload) => {
    const notifications = require('../main/notifications');
    notifications.notifyQueueWarning({
      characterName: payload.characterName || 'Test Character',
      remainingMs: Number(payload.remainingMs ?? 7 * 3600000 + 25 * 60000)
    });
    return { ok: true };
  },

  'bubble.wallet': async (payload) => {
    const notifications = require('../main/notifications');
    const rawAmount = payload.amount;
    const parsedAmount = Number(rawAmount);
    const amount =
      rawAmount == null || !Number.isFinite(parsedAmount)
        ? 1000000
        : parsedAmount;
    notifications.notifyWalletActivity({
      characterName: payload.characterName || 'Test Character',
      entries: [
        { description: payload.description || 'Test transaction', amount }
      ]
    });
    return { ok: true };
  }
};