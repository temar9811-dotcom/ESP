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
  }
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