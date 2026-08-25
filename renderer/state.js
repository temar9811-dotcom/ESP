'use strict';

window.ESP = window.ESP || {};

ESP.state = {
  lastAccounts: [],
  openCharacterId: null,
  activeTab: 'overview',
  walletState: {},
  allSkillsByCharacter: {},
  skillGroupsCollapse: {},
  plans: [],
  addPlanState: null,
  planDetail: null,
  cloneExpandByCharacter: {},
  skillSearch: {
    open: false,
    query: '',
    suggestions: [],
    selectedIndex: 0,
    popup: null,
    minimized: false,
    index: null
  },
  // Per-character tab glow flags: wallet / skillComplete / queueEmpty.
  // Cleared when the character's tab is selected. The "training but no
  // next skill" purple glow is derived live from the account data.
  charNotifications: {}
};

ESP.setStatus = function (message, isError = false) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = isError ? 'status error' : 'status';
};

ESP.getActiveTab = function () {
  return ESP.state.activeTab || 'overview';
};

ESP.tabSubtitle = function (account) {
  if (account.lastError) {
    return 'Error';
  }
  const active = account.activeSkill;
  if (!active) {
    return 'Idle';
  }
  const skillName = active.skillName || 'Unknown';
  const level = active.finished_level ?? '?';
  const timeLeft = ESP.remaining(active.finish_date);
  return `${skillName} L${level} · ${timeLeft}`;
};

// --- Character tab glow notifications ---

ESP.notifyChar = function (characterId, kind) {
  const id = Number(characterId);
  if (!id) return;
  const map = ESP.state.charNotifications;
  map[id] = map[id] || {};
  map[id][kind] = true;
};

ESP.clearCharNotifications = function (characterId) {
  delete ESP.state.charNotifications[Number(characterId)];
};

// True when the character is training a skill but has nothing queued
// behind it — the "log in and add a skill" purple glow.
ESP.charTrainingNoQueue = function (account) {
  if (!account || !account.activeSkill) return false;
  return !account.nextSkill;
};

// The glow class for a character tab, in priority order. Event-driven
// flags (wallet / skill complete / queue empty) outrank the derived
// training-but-empty purple state.
ESP.charGlowClass = function (account) {
  const id = Number(account && account.characterId);
  if (!id) return '';

  // Selecting the tab clears its notifications, so a selected tab never
  // glows.
  if (Number(ESP.state.openCharacterId) === id) return '';

  const flags = ESP.state.charNotifications[id] || {};

  if (flags.queueEmpty) return 'glow-red';
  if (flags.skillComplete) return 'glow-green';
  if (flags.wallet) return 'glow-yellow';
  if (ESP.charTrainingNoQueue(account)) return 'glow-purple';

  return '';
};

ESP.planAppliesToAccount = function (plan, account) {
  if (!plan) return false;
  if (plan.scope === 'global') {
    return true;
  }
  return Number(plan.characterId) === Number(account.characterId);
};

ESP.planIsSatisfied = function (account, plan) {
  if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) {
    return false;
  }
  const skillLevels = account.skillLevels || {};
  const queue = Array.isArray(account.queue) ? account.queue : [];
  const finalLevels = new Map();
  for (const [skillId, level] of Object.entries(skillLevels)) {
    finalLevels.set(Number(skillId), Number(level) || 0);
  }
  for (const q of queue) {
    const skillId = Number(q.skill_id);
    const level = Number(q.finished_level) || 0;
    if (level > (finalLevels.get(skillId) || 0)) {
      finalLevels.set(skillId, level);
    }
  }
  return plan.entries.every((entry) => {
    if (!entry.skillId) return false;
    const finalLevel = finalLevels.get(Number(entry.skillId)) || 0;
    return finalLevel >= Number(entry.level || 0);
  });
};

ESP.planTrainedSatisfied = function (account, plan) {
  if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) {
    return false;
  }
  const skillLevels = account.skillLevels || {};
  return plan.entries.every((entry) => {
    if (!entry.skillId) return false;
    const trained = Number(skillLevels[entry.skillId]) || 0;
    return trained >= Number(entry.level || 0);
  });
};

ESP.completedPlansForAccount = function (account) {
  return ESP.state.plans.filter(
    (plan) =>
      ESP.planAppliesToAccount(plan, account) &&
      ESP.planIsSatisfied(account, plan) &&
      !ESP.planTrainedSatisfied(account, plan)
  );
};