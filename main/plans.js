'use strict';

const { app, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const eve = require('../eve');
const logger = require('./debug/logger');

function getPlansFile() {
  return path.join(app.getPath('userData'), 'skillPlans.json');
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function newPlanId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRealAccounts() {
  try { return require('./accounts').getAccounts(); } catch { return []; }
}

// A global plan is a template: one parent record plus one child copy per real
// (non-test-pilot) account. Children remember parentId so they can be edited
// per character or re-synced globally when the "Applies to" scope is flipped
// back to "All characters".
function makeChildPlan(parent, characterId) {
  return {
    id: newPlanId(),
    name: parent.name,
    scope: 'character',
    characterId: Number(characterId),
    parentId: parent.id,
    diverged: false,
    createdAt: new Date().toISOString(),
    entries: clone(parent.entries || [])
  };
}

function ensureGlobalChildren(plans) {
  let changed = false;
  const accounts = getRealAccounts();
  for (const plan of plans) {
    if (!plan || plan.scope !== 'global' || plan.parentId) continue;
    for (const acc of accounts) {
      if (!acc || acc.testPilot) continue;
      const charId = Number(acc.characterId);
      if (!Number.isInteger(charId)) continue;
      const hasChild = plans.some((p) => p.parentId === plan.id && Number(p.characterId) === charId);
      if (!hasChild) {
        plans.push(makeChildPlan(plan, charId));
        changed = true;
      }
    }
  }
  return changed;
}

function syncChildren(plans, parentId, name, entries) {
  for (const p of plans) {
    if (p.parentId === parentId) {
      p.name = name;
      p.entries = clone(entries);
      p.diverged = false;
    }
  }
}

function loadPlans() {
  try {
    const raw = fs.readFileSync(getPlansFile(), 'utf8');
    const data = JSON.parse(raw);
    const plans = Array.isArray(data) ? data : [];
    if (ensureGlobalChildren(plans)) savePlansFile(plans);
    return plans;
  } catch {
    return [];
  }
}

function savePlansFile(plans) {
  const file = getPlansFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plans, null, 2), 'utf8');
}

function parseClipboardPlan(text) {
  const lines = String(text || '').split(/\r?\n/);
  const entries = [];
  const errors = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^(.+?)\s+(\d{1,2})$/);
    if (!match) {
      errors.push(`Line ${index + 1}: could not parse "${line}".`);
      return;
    }

    const name = match[1].trim();
    const level = Number(match[2]);

    if (!Number.isInteger(level) || level < 1 || level > 5) {
      errors.push(`Line ${index + 1}: invalid level "${match[2]}".`);
      return;
    }

    entries.push({ name, level });
  });

  return { entries, errors };
}

async function resolvePlanEntries(entries) {
  const names = [...new Set(entries.map((entry) => entry.name))];
  let idsMap = new Map();

  try {
    idsMap = await eve.getSkillIdsFromNames(names);
  } catch {
    idsMap = new Map();
  }

  return entries.map((entry) => ({
    name: entry.name,
    level: entry.level,
    skillId: idsMap.get(entry.name) || null
  }));
}

async function readClipboardPlan() {
  const text = clipboard.readText();
  const parsed = parseClipboardPlan(text);

  if (!parsed.entries.length) {
    throw new Error('No valid skill lines found in the clipboard.');
  }

  const entries = await resolvePlanEntries(parsed.entries);

  return { entries, errors: parsed.errors };
}

function savePlan(payload) {
  const plans = loadPlans();

  const name = String(payload?.name || '').trim();
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const scope = payload?.scope === 'character' ? 'character' : 'global';
  const characterId = scope === 'character' ? Number(payload?.characterId) : null;

  if (!name) {
    throw new Error('Plan name is required.');
  }

  if (!entries.length) {
    throw new Error('Plan has no skills.');
  }

  if (scope === 'character' && !Number.isInteger(characterId)) {
    throw new Error('Select a character for this plan.');
  }

  const nextEntries = entries.map((entry) => ({
    name: String(entry.name || ''),
    level: Math.min(5, Math.max(1, Number(entry.level || 1))),
    skillId: entry.skillId ? Number(entry.skillId) : null
  }));

  const existingId = payload?.id || payload?.planId || null;

  if (existingId) {
    const existing = plans.find((plan) => plan.id === existingId);
    if (!existing) {
      throw new Error('Plan not found.');
    }

    // A child (per-character copy of a global plan) exists when parentId is set.
    const isChild = Boolean(existing.parentId);

    if (scope === 'global') {
      const parentId = isChild ? existing.parentId : existing.id;
      const parent = plans.find((plan) => plan.id === parentId);
      if (!parent) {
        throw new Error('Parent plan not found.');
      }
      parent.name = name;
      parent.scope = 'global';
      parent.characterId = null;
      parent.entries = nextEntries;
      // Re-sync every matching child including the one being edited.
      syncChildren(plans, parentId, name, nextEntries);
      ensureGlobalChildren(plans);
      savePlansFile(plans);
      logger.info('PLANS', isChild
        ? `Plan updated globally via child: ${name} (${parentId})`
        : `Updated plan: ${name} (${existingId})`, { scope: 'global', entries: nextEntries.length });
      return parent;
    }

    // scope === 'character'
    if (isChild) {
      // Detach from the shared parent: this plan is now a per-character edit.
      existing.name = name;
      existing.characterId = characterId;
      existing.entries = nextEntries;
      existing.diverged = true;
      savePlansFile(plans);
      logger.info('PLANS', `Per-character edit of shared plan: ${name} (${existingId})`, { characterId, entries: nextEntries.length });
      return existing;
    }

    if (existing.scope === 'global' && !existing.parentId) {
      // A global plan was narrowed down to one character. To avoid leaving
      // stale shared children around, convert all children into standalone
      // plans first, then keep this one as the per-character plan.
      for (const p of plans) {
        if (p.parentId === existing.id) p.parentId = null;
      }
    }

    existing.name = name;
    existing.scope = 'character';
    existing.characterId = characterId;
    existing.entries = nextEntries;
    savePlansFile(plans);
    logger.info('PLANS', `Updated plan: ${name} (${existingId})`, { scope: 'character', characterId, entries: nextEntries.length });
    return existing;
  }

  if (scope === 'global') {
    const parent = {
      id: newPlanId(),
      name,
      scope: 'global',
      characterId: null,
      createdAt: new Date().toISOString(),
      entries: nextEntries
    };
    plans.push(parent);
    ensureGlobalChildren(plans);
    savePlansFile(plans);
    logger.info('PLANS', `Created global plan: ${name} (${parent.id})`, { scope: 'global', entries: nextEntries.length });
    return parent;
  }

  const plan = {
    id: newPlanId(),
    name,
    scope: 'character',
    characterId,
    createdAt: new Date().toISOString(),
    entries: nextEntries
  };

  plans.push(plan);
  savePlansFile(plans);
  logger.info('PLANS', `Created plan: ${plan.name} (${plan.id})`, { scope: 'character', characterId, entries: nextEntries.length });

  return plan;
}

function deletePlan(planId) {
  const plans = loadPlans();
  const target = plans.find((plan) => plan.id === planId);
  if (!target) {
    savePlansFile(plans);
    return true;
  }
  const idsToDelete = new Set([planId]);
  if (target.scope === 'global' && !target.parentId) {
    for (const p of plans) {
      if (p.parentId === planId) idsToDelete.add(p.id);
    }
  }
  const filtered = plans.filter((plan) => !idsToDelete.has(plan.id));
  const removed = filtered.length !== plans.length;
  savePlansFile(filtered);
  logger.info('PLANS', `Deleted plan: ${planId}`, { removed, cascade: idsToDelete.size > 1 });
  return true;
}

function exportPlanToClipboard(planId) {
  const plan = loadPlans().find((p) => p.id === planId);
  if (!plan) throw new Error('Plan not found.');
  const lines = (plan.entries || [])
    .filter((entry) => entry && entry.name)
    .map((entry) => `${entry.name} ${Math.min(5, Math.max(1, Number(entry.level) || 1))}`);
  clipboard.writeText(lines.join('\n'));
  logger.info('PLANS', `Exported plan to clipboard: ${plan.name}`, { lines: lines.length });
  return { ok: true, lines: lines.length };
}

function mergePlans(incoming) {
  const plans = loadPlans();
  const existingIds = new Set(plans.map((plan) => plan.id));
  let imported = 0;

  for (const plan of Array.isArray(incoming) ? incoming : []) {
    if (!plan || !plan.id || existingIds.has(plan.id)) {
      continue;
    }

    plans.push(plan);
    existingIds.add(plan.id);
    imported += 1;
  }

  if (imported > 0) {
    savePlansFile(plans);
  }

  logger.info('PLANS', `Merged plans: ${imported} imported of ${Array.isArray(incoming) ? incoming.length : 0}`);

  return imported;
}

module.exports = {
  loadPlans,
  readClipboardPlan,
  savePlan,
  deletePlan,
  exportPlanToClipboard,
  mergePlans
};