'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let history = null;

function historyFile() {
  return path.join(app.getPath('userData'), 'skill-history.json');
}

function load() {
  if (history) return history;

  try {
    history = JSON.parse(fs.readFileSync(historyFile(), 'utf8')) || {};
  } catch {
    history = {};
  }

  // Test-injected entries
  for (const key of Object.keys(history)) {
    history[key] = (history[key] || []).filter((e) => !e.test);
  }

  return history;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
    fs.writeFileSync(
      historyFile(),
      JSON.stringify(history || {}, null, 2),
      'utf8'
    );
  } catch {
    // Ignore write errors.
  }
}

function prune(list) {
  const cutoff = Date.now() - 30 * 86400000;

  return (list || []).filter(
    (e) => new Date(e.finishedAt).getTime() >= cutoff
  );
}

function isDuplicate(list, entry) {
  return list.some(
    (e) =>
      Number(e.skillId) === Number(entry.skillId) &&
      Number(e.level) === Number(entry.level) &&
      e.finishedAt === entry.finishedAt
  );
}

function recordCompletion(characterId, entry) {
  const data = load();
  const key = String(characterId);
  const list = data[key] || (data[key] = []);

  if (!isDuplicate(list, entry)) {
    list.push(entry);
    data[key] = prune(list);
    save();
  }
}

function seedFromQueue(characterId, queue) {
  const data = load();
  const key = String(characterId);
  const list = data[key] || (data[key] = []);

  const now = Date.now();
  const cutoff = now - 7 * 86400000;
  let changed = false;

  for (const q of queue || []) {
    const finish = q.finish_date ? new Date(q.finish_date).getTime() : null;

    if (finish && finish <= now && finish >= cutoff) {
      const entry = {
        skillId: q.skill_id,
        skillName: q.skillName || `Unknown ${q.skill_id}`,
        level: Number(q.finished_level || 0),
        finishedAt: new Date(finish).toISOString()
      };

      if (!isDuplicate(list, entry)) {
        list.push(entry);
        changed = true;
      }
    }
  }

  if (changed) {
    data[key] = prune(list);
    save();
  }
}

function getRecent(characterId, days = 7) {
  const data = load();
  const list = data[String(characterId)] || [];
  const cutoff = Date.now() - days * 86400000;

  return list
    .filter((e) => new Date(e.finishedAt).getTime() >= cutoff)
    .sort(
      (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()
    );
}
// remove test skills
function removeTestEntries(characterId) {
  const data = load();
  const key = String(characterId);
  const list = data[key] || [];
  const filtered = list.filter((e) => !e.test);

  if (filtered.length !== list.length) {
    data[key] = filtered;
    save();
    return true;
  }

  return false;
}

module.exports = {
  recordCompletion,
  seedFromQueue,
  getRecent,
  removeTestEntries
};