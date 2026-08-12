'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const UNGROUPED_KEY = '__ungrouped__';

let data = null;

function groupsFile() {
  return path.join(app.getPath('userData'), 'character-groups.json');
}

function loadData() {
  if (data) return data;

  try {
    data = JSON.parse(fs.readFileSync(groupsFile(), 'utf8'));
  } catch {
    data = {};
  }

  if (!data || typeof data !== 'object') {
    data = {};
  }

  return data;
}

function saveData() {
  fs.mkdirSync(path.dirname(groupsFile()), { recursive: true });
  fs.writeFileSync(
    groupsFile(),
    JSON.stringify(data || {}, null, 2),
    'utf8'
  );
}

function getGroups() {
  return JSON.parse(JSON.stringify(loadData()));
}

function findGroupOf(characterId) {
  const id = Number(characterId);

  for (const [name, group] of Object.entries(loadData())) {
    if (name === UNGROUPED_KEY) continue;

    if (Array.isArray(group.members) && group.members.includes(id)) {
      return name;
    }
  }

  return null;
}

function setGroup(characterId, name) {
  loadData();

  const id = Number(characterId);
  const clean = String(name || '').trim();
  const current = findGroupOf(id);

  if (current) {
    const group = data[current];
    group.members = (group.members || []).filter((m) => m !== id);

    if (!group.members.length) {
      delete data[current];
    } else if (group.primaryCharacterId === id) {
      group.primaryCharacterId = group.members[0];
    }
  }

  if (clean) {
    if (!data[clean]) {
      data[clean] = {
        name: clean,
        primaryCharacterId: id,
        collapsed: false,
        members: []
      };
    }

    data[clean].members.push(id);

    if (!data[clean].primaryCharacterId) {
      data[clean].primaryCharacterId = id;
    }
  }

  saveData();
  return getGroups();
}

function setPrimary(characterId) {
  loadData();

  const id = Number(characterId);
  const name = findGroupOf(id);

  if (name) {
    data[name].primaryCharacterId = id;
    saveData();
  }

  return getGroups();
}

function toggleCollapsed(groupName) {
  loadData();

  if (!data[groupName]) {
    data[groupName] = {
      name: groupName,
      primaryCharacterId: null,
      collapsed: false,
      members: []
    };
  }

  data[groupName].collapsed = !data[groupName].collapsed;
  saveData();
  return getGroups();
}

module.exports = {
  getGroups,
  setGroup,
  setPrimary,
  toggleCollapsed,
  UNGROUPED_KEY
};