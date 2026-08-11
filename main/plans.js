'use strict';

const { app, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const eve = require('../eve');

function getPlansFile() {
  return path.join(app.getPath('userData'), 'skillPlans.json');
}

function loadPlans() {
  try {
    const raw = fs.readFileSync(getPlansFile(), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
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

  const plan = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    scope,
    characterId,
    createdAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      name: String(entry.name || ''),
      level: Number(entry.level || 1),
      skillId: entry.skillId ? Number(entry.skillId) : null
    }))
  };

  plans.push(plan);
  savePlansFile(plans);

  return plan;
}

function deletePlan(planId) {
  let plans = loadPlans();
  plans = plans.filter((plan) => plan.id !== planId);
  savePlansFile(plans);
  return true;
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

  return imported;
}

module.exports = {
  loadPlans,
  readClipboardPlan,
  savePlan,
  deletePlan,
  mergePlans
};