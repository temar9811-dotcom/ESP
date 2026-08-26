'use strict';

window.ESP = window.ESP || {};

// --- State helpers ---

function assetsState() {
  const st = ESP.state;
  st.assetsSubTabByCharacter = st.assetsSubTabByCharacter || {};
  st.assetsCacheByCharacter = st.assetsCacheByCharacter || {};
  st.assetsExpandByCharacter = st.assetsExpandByCharacter || {};
  st.assetTypeNames = st.assetTypeNames || new Map();
  return st;
}

// The ESI sequencer's live lock state, polled so the per-char refresh
// button can flip to "Queue refresh" while another section holds the lock.
function sequencerLocked() {
  return Boolean(ESP.state.sequencer && ESP.state.sequencer.locked);
}

ESP.refreshSequencerState = function () {
  if (!window.eveApi || !window.eveApi.getSequencerState) return Promise.resolve();
  return window.eveApi
    .getSequencerState()
    .then((seq) => {
      ESP.state.sequencer = seq || { locked: false };
    })
    .catch(() => {});
};

function cacheSlot(id, kind) {
  const st = assetsState();
  st.assetsCacheByCharacter[id] = st.assetsCacheByCharacter[id] || {};
  if (!st.assetsCacheByCharacter[id][kind]) {
    st.assetsCacheByCharacter[id][kind] = { status: 'idle', data: null };
  }
  return st.assetsCacheByCharacter[id][kind];
}

// --- Data loading ---

// Background sweeps write fresh trees to disk and broadcast accounts, but an
// already-open pane keeps its in-memory slot. Reset slots whose fetch
// timestamp changed so the next render re-reads the disk cache.
ESP.invalidateStaleAssetCaches = function (accounts) {
  const st = assetsState();
  st.assetsFetchSeen = st.assetsFetchSeen || {};
  for (const account of accounts || []) {
    const id = Number(account.characterId);
    const slots = st.assetsCacheByCharacter[id];
    const seen = st.assetsFetchSeen[id] ||
      (st.assetsFetchSeen[id] = { personal: undefined, corp: undefined });
    if (slots && slots.personal && seen.personal !== undefined &&
        seen.personal !== account.assetLastFetch) {
      slots.personal.status = 'idle';
    }
    if (slots && slots.corp && seen.corp !== undefined &&
        seen.corp !== account.corpAssetLastFetch) {
      slots.corp.status = 'idle';
    }
    seen.personal = account.assetLastFetch;
    seen.corp = account.corpAssetLastFetch;
  }
};

// Group raw asset rows into the region/system/station tree the renderer
// expects. Locations are looked up in the resolved-names map by their
// TOP-LEVEL location id (walkToTop) — the resolver keys its map that way,
// and an item's raw location_id may just be its parent container. Falls
// back to raw ids/flags when no name has been resolved yet.
function buildTreeFromRaw(rows, namesMap) {
  const tree = { regions: {} };
  const loc = namesMap || {};
  const list = Array.isArray(rows) ? rows : [];
  const byItemId = new Map(list.map((a) => [a.item_id, a]));

  // Mirror of main/assets.js walkToTop: climb location_type 'item' parents
  // to the top-level location.
  function walkToTop(asset) {
    let cur = asset;
    let missingParentId = null;
    const seen = new Set();
    while (cur && cur.location_type === 'item') {
      if (seen.has(cur.item_id)) { missingParentId = cur.location_id; break; }
      seen.add(cur.item_id);
      const parent = byItemId.get(cur.location_id);
      if (!parent) { missingParentId = cur.location_id; cur = null; break; }
      cur = parent;
    }
    return { top: cur, missingParentId };
  }

  for (const asset of list) {
    const { top, missingParentId } = walkToTop(asset);

    // Key by the same id the resolver uses: the top asset's own item_id when
    // a top exists (the resolver keys every resolved location by top.item_id),
    // else the missing parent id.
    let id;
    if (top) {
      id = top.item_id != null ? Number(top.item_id) : null;
    } else {
      id = missingParentId != null
        ? Number(missingParentId)
        : (asset.location_id != null ? Number(asset.location_id) : null);
    }
    const info = id != null ? loc[id] : null;

    const region = info && info.regionName ? info.regionName : 'Assets';
    const system = info && info.systemName
      ? info.systemName
      : 'Location ' + (id != null ? id : '?');
    const name = info && info.name
      ? info.name
      : (asset.location_flag ? String(asset.location_flag) : 'Items');

    if (!tree.regions[region]) tree.regions[region] = { name: region, systems: {} };
    if (!tree.regions[region].systems[system]) {
      tree.regions[region].systems[system] = { name: system, stations: {} };
    }
    if (!tree.regions[region].systems[system].stations[name]) {
      tree.regions[region].systems[system].stations[name] = { name, items: [], count: 0 };
    }

    const st = tree.regions[region].systems[system].stations[name];
    st.items.push({
      typeId: asset.type_id,
      quantity: asset.quantity,
      isSingleton: asset.is_singleton,
      itemId: asset.item_id
    });
    st.count++;
  }
  return tree;
}

// Lazy-load the disk cache for one character + kind ('personal' | 'corp')
ESP.loadAssets = async function (id, kind, force) {
  const slot = cacheSlot(id, kind);
  if (slot.status === 'loading') return;
  if (slot.status === 'done' && !force) return;

  slot.status = 'loading';
  ESP.render(ESP.state.lastAccounts);

  try {
    if (kind === 'personal') {
      // Prefer the sequenced raw cache (single sequenced ESI pull) merged
      // with the 24h resolved-names map; fall back to the legacy tree cache
      // when no raw pull has landed yet.
      const raw = window.eveApi.getRawAssets
        ? await window.eveApi.getRawAssets(id)
        : null;
      if (raw && Array.isArray(raw.assets)) {
        const names = window.eveApi.getAssetNames
          ? await window.eveApi.getAssetNames(id)
          : null;
        const namesMap = names && names.locations ? names.locations : null;
        slot.data = {
          fetchedAt: raw.fetchedAt,
          tree: buildTreeFromRaw(raw.assets, namesMap)
        };
      } else {
        slot.data = await window.eveApi.getPersonalAssets(id);
      }
    } else {
      slot.data = await window.eveApi.getCorpAssets(id);
    }

    slot.status = 'done';

    if (slot.data && slot.data.tree) {
      await ESP.ensureAssetTypeNames(slot.data.tree);
    }
  } catch (err) {
    slot.status = 'error';
    slot.error = err?.message || String(err);
  }

  ESP.render(ESP.state.lastAccounts);
};

// Resolve item type ids to names (shared bridge, cached main-side)
ESP.ensureAssetTypeNames = async function (tree) {
  const ids = new Set();
  for (const region of Object.values(tree.regions || {})) {
    for (const system of Object.values(region.systems || {})) {
      for (const station of Object.values(system.stations || {})) {
        for (const item of station.items || []) {
          if (!ESP.state.assetTypeNames.has(item.typeId)) ids.add(item.typeId);
        }
      }
    }
  }
  if (!ids.size) return;

  try {
    const raw = await window.eveApi.resolveNames([...ids]);
    for (const [k, v] of Object.entries(raw || {})) {
      ESP.state.assetTypeNames.set(Number(k), v);
    }
  } catch {
    // Names stay as "Type <id>" fallback
  }
};

// --- Rendering ---

ESP.assetsTabHtml = function (account) {
  const id = Number(account.characterId);
  const st = assetsState();
  const sub = st.assetsSubTabByCharacter[id] || 'clones';

  let content = '';
  if (sub === 'clones') {
    content = typeof ESP.clonesTabHtml === 'function'
      ? ESP.clonesTabHtml(account)
      : '<div class="idle">Clones module not available.</div>';
  } else if (sub === 'assets') {
    content = ESP.assetPaneHtml(account, 'personal');
  } else if (sub === 'corp') {
    content = ESP.assetPaneHtml(account, 'corp');
  }

  const corpBtn = account.hasCorpAccess
    ? `<button type="button" class="assets-subtab ${sub === 'corp' ? 'active' : ''}" data-assets-subtab="corp" data-id="${id}">Corp Assets</button>`
    : '';

  return `
<div class="assets-subtabs">
  <button type="button" class="assets-subtab ${sub === 'clones' ? 'active' : ''}" data-assets-subtab="clones" data-id="${id}">Clones</button>
  <button type="button" class="assets-subtab ${sub === 'assets' ? 'active' : ''}" data-assets-subtab="assets" data-id="${id}">Assets</button>
  ${corpBtn}
</div>
<div class="assets-content">${content}</div>
`;
};

ESP.assetPaneHtml = function (account, kind) {
  const id = Number(account.characterId);
  const slot = cacheSlot(id, kind);

  const lastFetch = kind === 'personal'
    ? account.assetLastFetch
    : account.corpAssetLastFetch;

  const diag = slot.data && slot.data.tree && slot.data.tree._diag ? slot.data.tree._diag : null;
  const parts = [];
  if (diag && diag.fallbackCount > 0) parts.push(`${diag.fallbackCount} unresolved`);
  if (diag && diag.containerHits > 0) parts.push(`${diag.containerHits} in containers/ships`);
  const diagBadge =
    ESP.state.testEnabled && parts.length
      ? ` <span style="opacity:0.6">${parts.join(', ')}</span>`
      : '';

  const refreshLabel = sequencerLocked() ? 'Queue refresh' : 'Refresh now';
  const header = `
<div class="assets-pane-header">
  <span class="assets-last-fetch">Last live fetch: ${lastFetch ? ESP.formatDate(lastFetch) : 'never'}</span>
  <button type="button" class="assets-refresh" data-assets-refresh="${kind}" data-id="${id}">${refreshLabel}</button>${diagBadge}
</div>`;

  if (slot.status === 'idle') {
    ESP.loadAssets(id, kind, false); // lazy trigger, guarded against loops
    return header + '<div class="idle">Loading assets…</div>';
  }
  if (slot.status === 'loading') {
    return header + '<div class="idle">Loading assets…</div>';
  }
  if (slot.status === 'error') {
    return header + `<div class="error">${ESP.escapeHtml(slot.error || 'Failed to load assets.')}</div>`;
  }
  if (!slot.data || !slot.data.tree) {
    return header + '<div class="idle">No asset data yet — the background queue will fetch it soon.</div>';
  }

  const expand = assetsState().assetsExpandByCharacter[id] || {};
  return header + ESP.assetTreeHtmlFor(id, expand, kind, slot.data.tree);
};

ESP.assetTreeHtmlFor = function (id, expand, kind, tree) {
  const prefix = kind === 'personal' ? 'p:' : 'c:';
  const names = assetsState().assetTypeNames;
  const nameOf = (typeId) => names.get(typeId) || ('Type ' + typeId);

  const regionNames = Object.keys(tree.regions || {}).sort();
  if (!regionNames.length) return '<div class="idle">No assets found.</div>';

  return `<div class="asset-tree">${regionNames.map((regionName) => {
    const region = tree.regions[regionName];
    const rKey = prefix + 'r:' + regionName;
    const rOpen = Boolean(expand[rKey]);

    const systemsHtml = rOpen ? Object.keys(region.systems || {}).sort().map((systemName) => {
      const system = region.systems[systemName];
      const sKey = prefix + 's:' + regionName + '|' + systemName;
      const sOpen = Boolean(expand[sKey]);

      const stationsHtml = sOpen ? Object.keys(system.stations || {}).sort().map((stationName) => {
        const station = system.stations[stationName];
        const tKey = prefix + 't:' + regionName + '|' + systemName + '|' + stationName;
        const tOpen = Boolean(expand[tKey]);

        const items = groupItems(station.items || []);
        items.sort((a, b) => nameOf(a.typeId).localeCompare(nameOf(b.typeId)));

        const itemsHtml = tOpen ? `
<table class="asset-items">
  <thead><tr><th>Item</th><th>Qty</th></tr></thead>
  <tbody>${items.map((it) => `
    <tr>
      <td>${ESP.escapeHtml(nameOf(it.typeId))}</td>
      <td>${ESP.formatNumber(it.quantity)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '';

        return `
<div class="asset-node station">
  <div class="asset-node-row" data-assets-toggle="${tKey}" data-id="${id}">
    <span class="expand-icon">${tOpen ? '▾' : '▸'}</span>
    <span class="node-name">${ESP.escapeHtml(stationName)}</span>
    <span class="node-count">${items.length}</span>
  </div>
  ${tOpen ? `<div class="asset-children">${itemsHtml}</div>` : ''}
</div>`;
      }).join('') : '';

      return `
<div class="asset-node system">
  <div class="asset-node-row" data-assets-toggle="${sKey}" data-id="${id}">
    <span class="expand-icon">${sOpen ? '▾' : '▸'}</span>
    <span class="node-name">${ESP.escapeHtml(systemName)}</span>
    <span class="node-count">${Object.keys(system.stations || {}).length}</span>
  </div>
  ${sOpen ? `<div class="asset-children">${stationsHtml}</div>` : ''}
</div>`;
    }).join('') : '';

    return `
<div class="asset-node region">
  <div class="asset-node-row" data-assets-toggle="${rKey}" data-id="${id}">
    <span class="expand-icon">${rOpen ? '▾' : '▸'}</span>
    <span class="node-name">${ESP.escapeHtml(regionName)}</span>
    <span class="node-count">${Object.keys(region.systems || {}).length}</span>
  </div>
  ${rOpen ? `<div class="asset-children">${systemsHtml}</div>` : ''}
</div>`;
  }).join('')}</div>`;
};

function groupItems(items) {
  const byType = new Map();
  for (const item of items) {
    const cur = byType.get(item.typeId) || { typeId: item.typeId, quantity: 0 };
    cur.quantity += Number(item.quantity) || 1;
    byType.set(item.typeId, cur);
  }
  return [...byType.values()];
}

// --- Event bindings (delegated, bound once) ---

ESP.bindAssetsListeners = function () {
  if (ESP.assetsListenersBound) return;
  ESP.assetsListenersBound = true;

  document.addEventListener('click', async (event) => {
    const subBtn = event.target.closest('[data-assets-subtab]');
    if (subBtn) {
      const id = Number(subBtn.dataset.id);
      assetsState().assetsSubTabByCharacter[id] = subBtn.dataset.assetsSubtab;
      ESP.render(ESP.state.lastAccounts);
      return;
    }

    const toggle = event.target.closest('[data-assets-toggle]');
    if (toggle) {
      const id = Number(toggle.dataset.id);
      const key = toggle.dataset.assetsToggle;
      const st = assetsState();
      st.assetsExpandByCharacter[id] = st.assetsExpandByCharacter[id] || {};
      st.assetsExpandByCharacter[id][key] = !st.assetsExpandByCharacter[id][key];
      ESP.render(ESP.state.lastAccounts);
      return;
    }

    const refreshBtn = event.target.closest('[data-assets-refresh]');
    if (refreshBtn) {
      const id = Number(refreshBtn.dataset.id);
      const kind = refreshBtn.dataset.assetsRefresh;
      refreshBtn.disabled = true;
      try {
        // Re-check the sequencer at click time — the label may be a render
        // behind. When locked, queue through the sequencer; otherwise take
        // the direct refresh.
        await ESP.refreshSequencerState();
        if (sequencerLocked() && window.eveApi.queueAssetsRefresh) {
          await window.eveApi.queueAssetsRefresh(id);
        } else {
          await window.eveApi.refreshAssetsNow(id);
        }
        await ESP.loadAssets(id, kind, true);
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      } finally {
        refreshBtn.disabled = false;
      }
      return;
    }
  });
};