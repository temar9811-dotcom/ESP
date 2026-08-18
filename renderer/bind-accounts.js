'use strict';

window.ESP = window.ESP || {};

ESP.bindAccountEvents = function () {
  const accountsEl = document.getElementById('accounts');

  if (!accountsEl) return;

  accountsEl.addEventListener('input', (event) => {
    if (event.target.classList.contains('notes-input')) {
      const id = Number(event.target.dataset.id);
      ESP.state.notesDraft = ESP.state.notesDraft || {};
      ESP.state.notesDraft[id] = event.target.value;
    }
  });

  accountsEl.addEventListener('click', async (event) => {
    const starBtn = event.target.closest('.group-star');

    if (starBtn) {
      const id = Number(starBtn.dataset.id);

      try {
        await window.eveApi.setGroupPrimary(id);
        await ESP.loadGroups();
        ESP.render(ESP.state.lastAccounts);
        ESP.setStatus('Primary character set.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }

    const groupHeader = event.target.closest('.group-header');

    if (groupHeader) {
      const name = groupHeader.dataset.group;

      try {
        await window.eveApi.toggleGroup(name);
        await ESP.loadGroups();
        ESP.render(ESP.state.lastAccounts);
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }

    const characterTab = event.target.closest('.character-tab');

    if (characterTab) {
      const id = Number(characterTab.dataset.id);

      ESP.state.openCharacterId =
        ESP.state.openCharacterId === id ? null : id;

      ESP.render(ESP.state.lastAccounts);

      if (ESP.state.openCharacterId === id) {
        ESP.loadCorpInfo(id);
      }

      return;
    }

    const sheetTab = event.target.closest('.sheet-tab');

    if (sheetTab) {
      const id = Number(sheetTab.dataset.id);
      const tab = sheetTab.dataset.tab;

      ESP.state.activeTabByCharacter[id] = tab;

      if (tab === 'wallet') {
        ESP.loadWalletDetails(id);
      }

      ESP.render(ESP.state.lastAccounts);
      return;
    }

    const retryBtn = event.target.closest('.wallet-retry');

    if (retryBtn) {
      const id = Number(retryBtn.dataset.id);
      ESP.loadWalletDetails(id, true);
      return;
    }

    const setGroupBtn = event.target.closest('.set-group');

    if (setGroupBtn) {
      const id = Number(setGroupBtn.dataset.id);

      let current = '';

      for (const [name, group] of Object.entries(ESP.state.groups || {})) {
        if (name === '__ungrouped__') continue;

        if ((group.members || []).map(Number).includes(id)) {
          current = name;
          break;
        }
      }

      ESP.openGroupModal(id, current);
      return;
    }

    const removeBtn = event.target.closest('.remove');

    if (removeBtn) {
      const id = Number(removeBtn.dataset.id);

      if (!confirm('Remove this character?')) return;

      removeBtn.disabled = true;

      try {
        await window.eveApi.removeAccount(id);

        if (ESP.state.openCharacterId === id) {
          ESP.state.openCharacterId = null;
        }

        delete ESP.state.walletState[id];
        delete ESP.state.activeTabByCharacter[id];

        await ESP.load();
        ESP.setStatus('Character removed.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      } finally {
        removeBtn.disabled = false;
      }

      return;
    }

    const planDeleteBtn = event.target.closest('.plan-delete');

    if (planDeleteBtn) {
      const planId = planDeleteBtn.dataset.planId;

      if (!confirm('Delete this skill plan?')) return;

      try {
        await window.eveApi.deletePlan(planId);

        if (ESP.state.planDetail && ESP.state.planDetail.id === planId) {
          ESP.state.planDetail = null;
        }

        await ESP.loadPlans();
        ESP.setStatus('Skill plan deleted.');
        ESP.render(ESP.state.lastAccounts);
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }

    const planBox = event.target.closest('.plan-box');

    if (planBox) {
      const planId = planBox.dataset.planId;

      const plan =
        ESP.state.plans.find((p) => p.id === planId) || null;

      ESP.state.planDetail = plan;

      if (plan && window.eveApi && window.eveApi.getSkillMeta) {
        const ids = (plan.entries || [])
          .map((entry) => entry.skillId)
          .filter(Boolean);

        try {
          plan.meta = await window.eveApi.getSkillMeta(ids);
        } catch {
          plan.meta = {};
        }
      }

      ESP.renderModals();
    }

    const notesSaveBtn = event.target.closest('.notes-save');

    if (notesSaveBtn) {
      const id = Number(notesSaveBtn.dataset.id);
      const draftMap = ESP.state.notesDraft || {};
      const text = draftMap[id] != null ? draftMap[id] : '';

      try {
        await window.eveApi.setNotes(id, text);

        const account = ESP.state.lastAccounts.find(
          (a) => Number(a.characterId) === id
        );
        if (account) account.notes = text;

        delete draftMap[id];
        ESP.setStatus('Notes saved.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }
  });
};
ESP.bindTopbarEvents = function () {
  const addBtn = document.getElementById('add');
  const refreshBtn = document.getElementById('refresh');
  const addPlanBtn = document.getElementById('addPlan');
  const settingsBtn = document.getElementById('settings');

  if (addPlanBtn) {
    addPlanBtn.addEventListener('click', () => {
      ESP.openAddPlanModal();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      ESP.openSettingsModal();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      ESP.openAddCharacterModal();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      ESP.setStatus('Refreshing...');

      try {
        await window.eveApi.refreshAll();
        await ESP.load();
        ESP.setStatus('Refresh complete.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      } finally {
        refreshBtn.disabled = false;
      }
    });
  }

  if (window.eveApi && window.eveApi.onAccountsUpdated) {
    const unsubscribe = window.eveApi.onAccountsUpdated((accounts) => {
      ESP.render(accounts);
    });

    window.addEventListener('beforeunload', () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  }
};

ESP.renderSearchDropdown = function () {
  const dropdown = document.querySelector('.skill-search-dropdown');
  if (!dropdown) return;

  const ss = ESP.state.skillSearch;
  if (!ss.suggestions.length) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    return;
  }

  dropdown.style.display = 'block';
  dropdown.innerHTML = ss.suggestions
    .map((entry, i) => {
      const cls =
        i === ss.selectedIndex
          ? 'skill-search-suggestion active'
          : 'skill-search-suggestion';
      const count = entry.characters.length;
      return `<div class="${cls}" data-index="${i}">${ESP.escapeHtml(entry.name)} <span class="skill-search-count">(${count})</span></div>`;
    })
    .join('');
};

ESP.renderSkillSearch = function () {
  const existing = document.getElementById('skillSearchInputWrap');
  const ss = ESP.state.skillSearch;

  if (!ss.open) {
    if (existing) existing.remove();
    ESP.renderSearchDropdown();
    return;
  }

  if (!existing) {
    const wrap = document.createElement('div');
    wrap.id = 'skillSearchInputWrap';
    wrap.className = 'skill-search-input-wrap';
    wrap.innerHTML = `
      <input
        type="text"
        class="skill-search-input"
        placeholder="Search skills across all characters..."
        value="${ESP.escapeHtml(ss.query)}"
      />
      <div class="skill-search-dropdown"></div>
    `;
    const actions = document.querySelector('.actions');
    if (actions) actions.parentNode.insertBefore(wrap, actions);
  }

  ESP.renderSearchDropdown();
  ESP.renderModals();
};

ESP.selectSkillSearchResult = function (entry) {
  const ss = ESP.state.skillSearch;
  ss.suggestions = [];
  ss.query = entry.name;
  ss.minimized = false;

  const results = ESP.state.lastAccounts.map((account) => {
    const charName = account.characterName || `Character ${account.characterId}`;
    const match = entry.characters.find(
      (c) => Number(c.characterId) === Number(account.characterId)
    );
    return {
      characterId: account.characterId,
      characterName: charName,
      level: match ? match.level : 0
    };
  });

  results.sort((a, b) => a.characterName.localeCompare(b.characterName));

  ss.popup = { skillName: entry.name, results };

  ESP.renderSearchDropdown();
  ESP.renderModals();
};

ESP.bindSkillSearchListeners = function () {
  if (ESP.skillSearchListenersBound) return;
  ESP.skillSearchListenersBound = true;

  document.addEventListener('input', (event) => {
    if (event.target.classList.contains('skill-search-input')) {
      const query = event.target.value;
      ESP.state.skillSearch.query = query;

      if (!ESP.state.skillSearch.index) return;

      const q = query.toLowerCase().trim();
      if (!q) {
        ESP.state.skillSearch.suggestions = [];
      } else {
        const matches = [];
        for (const entry of ESP.state.skillSearch.index.values()) {
          if (entry.name.toLowerCase().includes(q)) {
            matches.push(entry);
            if (matches.length >= 8) break;
          }
        }
        matches.sort(
          (a, b) =>
            a.name.toLowerCase().indexOf(q) -
            b.name.toLowerCase().indexOf(q)
        );
        ESP.state.skillSearch.suggestions = matches;
      }
      ESP.state.skillSearch.selectedIndex = 0;
      ESP.renderSearchDropdown();
    }
  });

  document.addEventListener('click', (event) => {
    const suggestion = event.target.closest('.skill-search-suggestion');

    if (suggestion) {
      const idx = Number(suggestion.dataset.index);
      const pick = ESP.state.skillSearch.suggestions[idx];
      if (pick) ESP.selectSkillSearchResult(pick);
      return;
    }

    const ssMinimize = event.target.closest('.skill-search-minimize');
    if (ssMinimize) {
      ESP.state.skillSearch.minimized = true;
      ESP.renderModals();
      return;
    }

    const ssPill = event.target.closest('.skill-search-pill');
    if (ssPill) {
      ESP.state.skillSearch.minimized = false;
      ESP.renderModals();
      return;
    }
  });
};

ESP.bindSkillSearch = function () {
  const searchBtn = document.getElementById('skillSearch');
  if (!searchBtn || ESP.skillSearchButtonBound) return;
  ESP.skillSearchButtonBound = true;

  searchBtn.addEventListener('click', async () => {
    const ss = ESP.state.skillSearch;

    if (ss.open) {
      ss.open = false;
      ss.query = '';
      ss.suggestions = [];
      ss.popup = null;
      ss.minimized = false;
      ESP.renderSkillSearch();
      return;
    }

    ss.open = true;
    ESP.renderSkillSearch();

    if (!ss.index) {
      try {
        const allIds = new Set();
        for (const account of ESP.state.lastAccounts) {
          for (const id of Object.keys(account.skillLevels || {})) {
            allIds.add(Number(id));
          }
        }

        const nameMapRaw = await window.eveApi.resolveNames([...allIds]);
        const nameMap = new Map(
          Object.entries(nameMapRaw).map(([k, v]) => [Number(k), v])
        );
        ss.index = ESP.buildSkillIndex(ESP.state.lastAccounts, nameMap);
      } catch {
        ss.index = new Map();
      }
    }

    const input = document.querySelector('.skill-search-input');
    if (input) input.focus();
  });

  ESP.bindSkillSearchListeners();

  if (!ESP.skillSearchKeydownBound) {
    ESP.skillSearchKeydownBound = true;

    document.addEventListener('keydown', (event) => {
      const ss = ESP.state.skillSearch;
      if (!ss || !ss.open) return;

      if (event.key === 'Escape') {
        if (ss.popup && !ss.minimized) {
          ss.popup = null;
          ss.minimized = false;
          ESP.renderModals();
        } else if (ss.suggestions.length) {
          ss.suggestions = [];
          ESP.renderSearchDropdown();
        } else {
          ss.open = false;
          ss.query = '';
          ss.suggestions = [];
          ss.popup = null;
          ss.minimized = false;
          ESP.renderSkillSearch();
        }
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (ss.suggestions.length) {
          const pick =
            ss.suggestions[ss.selectedIndex] || ss.suggestions[0];
          ESP.selectSkillSearchResult(pick);
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        ss.selectedIndex = Math.min(
          ss.selectedIndex + 1,
          ss.suggestions.length - 1
        );
        ESP.renderSearchDropdown();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        ss.selectedIndex = Math.max(ss.selectedIndex - 1, 0);
        ESP.renderSearchDropdown();
        return;
      }
    });
  }
};