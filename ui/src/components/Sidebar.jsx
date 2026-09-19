// ui/src/components/Sidebar.jsx
// VERSION: 2.2
import React, { useEffect, useState, useCallback } from 'react';
import { useAccounts, eveApi } from '../hooks/useEveApi';

const sendDebugLog = (level, source, message, data) => {
  try {
    window.eveApi?.debugLog?.({ level, source, message, data });
  } catch {}
};

const matchId = (account, id) => Number(account.characterId) === Number(id);

export default function Sidebar({ selectedAccount, onSelect }) {
  const accounts = useAccounts();
  const [charData, setCharData] = useState({});
  const [universeNames, setUniverseNames] = useState({});
  const [groups, setGroups] = useState({});

  const loadGroups = useCallback(async () => {
    if (!eveApi.getGroups) return;
    try {
      setGroups((await eveApi.getGroups()) || {});
    } catch (err) {
      sendDebugLog('ERROR', 'SIDEBAR', 'Failed to load groups', { error: err?.message });
      setGroups({});
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups, accounts]);

  useEffect(() => {
    const fetchData = async () => {
      const cData = {};
      for (const acc of accounts) {
        if (eveApi.getCharData) cData[acc.characterId] = await eveApi.getCharData(acc.characterId);
      }
      setCharData(cData);

      if (eveApi.getUniverseNames) {
        const uNames = await eveApi.getUniverseNames();
        setUniverseNames(uNames || {});
      }
    };
    fetchData();
  }, [accounts]);

  const handleRemove = async (id, isTest) => {
    try {
      if (isTest) {
        if (window.confirm('Remove all test pilots?')) await eveApi.testRun('pilots.remove', {});
      } else if (window.confirm('Remove this character?')) {
        await eveApi.removeAccount(id);
      }
    } catch (err) {
      sendDebugLog('ERROR', 'SIDEBAR', 'Failed to remove character', { error: err?.message });
    }
  };

  const handleSetGroup = async (id, current) => {
    const name = window.prompt(
      'Account group name for this character (leave empty to ungroup):',
      current || ''
    );
    if (name === null) return;

    try {
      await eveApi.setGroup(id, name);
      await loadGroups();
    } catch (err) {
      sendDebugLog('ERROR', 'SIDEBAR', 'Failed to set group', { error: err?.message });
    }
  };

  const handleSetPrimary = async (id) => {
    try {
      await eveApi.setGroupPrimary(id);
      await loadGroups();
    } catch (err) {
      sendDebugLog('ERROR', 'SIDEBAR', 'Failed to set primary character', { error: err?.message });
    }
  };

  const handleToggleGroup = async (name) => {
    try {
      await eveApi.toggleGroup(name);
      await loadGroups();
    } catch (err) {
      sendDebugLog('ERROR', 'SIDEBAR', 'Failed to toggle group', { error: err?.message });
    }
  };

  const characterCard = (acc, opts = {}) => {
    const cd = charData[acc.characterId] || {};
    const systemName = cd.system_name || `System ${cd.location?.solar_system_id || 'Unknown'}`;
    const corpName = universeNames[cd.corporation_id] || `Corp ${cd.corporation_id || 'Unknown'}`;
    const isPrimary = opts.grouped && matchId(acc, opts.primaryId);
    const groupName = opts.grouped ? opts.groupName : undefined;

    return (
      <div
        key={acc.characterId}
        onClick={() => onSelect(acc)}
        title={acc.characterName}
        className={`min-w-0 w-full p-3 rounded-lg cursor-pointer flex flex-col overflow-hidden border ${
          selectedAccount?.characterId === acc.characterId
            ? 'bg-blue-600 border-blue-500'
            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
        }`}
      >
        <div className="flex justify-between items-start gap-2 min-w-0">
          {opts.grouped && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSetPrimary(acc.characterId); }}
              title={isPrimary ? 'Primary character' : 'Make primary character'}
              className={`shrink-0 text-sm px-0.5 ${isPrimary ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
            >
              {isPrimary ? '★' : '☆'}
            </button>
          )}
          <p className="flex-1 min-w-0 text-sm font-medium text-white break-words leading-snug overflow-hidden">
            {acc.characterName}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(acc.characterId, acc.testPilot); }}
            className="text-gray-400 hover:text-red-400 shrink-0 text-sm px-1"
            title={acc.testPilot ? 'Remove test pilots' : 'Remove character'}
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-400 break-words mt-1 leading-snug min-w-0 overflow-hidden">{corpName}</p>
        <p className="text-xs text-gray-300 break-words mt-1 leading-snug min-w-0 overflow-hidden">{systemName}</p>
        <p className="text-xs text-gray-300 break-words mt-1 leading-snug min-w-0 overflow-hidden" title={acc.activeSkill?.skillName || 'Idle'}>
          {acc.activeSkill ? acc.activeSkill.skillName : 'Idle'}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); handleSetGroup(acc.characterId, groupName); }}
          title="Set account group for this character"
          className="mt-2 max-w-full w-fit truncate text-xs px-1.5 py-0.5 rounded border border-gray-600 bg-gray-800 text-gray-400 hover:text-blue-300 hover:border-blue-500"
        >
          Group: {groupName || 'None'}
        </button>
      </div>
    );
  };

  const groupHeader = (name, count, collapsed, onClick, key) => (
    <div
      key={key}
      onClick={onClick}
      className={`col-span-full flex justify-between items-center mt-2 mb-1 px-3 py-1.5 rounded-md select-none ${
        onClick
          ? 'cursor-pointer bg-blue-900/40 border border-blue-800/50 hover:bg-blue-900/60'
          : 'bg-gray-800/60 border border-gray-700'
      }`}
    >
      <span className="text-xs font-bold uppercase text-blue-300">{name}</span>
      <span className="text-xs font-normal text-gray-400">
        {count} character{count === 1 ? '' : 's'} {collapsed ? '▸' : '▾'}
      </span>
    </div>
  );

  const byId = new Map(accounts.map((acc) => [Number(acc.characterId), acc]));
  const renderedIds = new Set();
  const rows = [];

  for (const [groupName, group] of Object.entries(groups)) {
    const members = (group.members || [])
      .map((memberId) => byId.get(Number(memberId)))
      .filter(Boolean);

    if (!members.length) continue;

    const primary =
      members.find((member) => matchId(member, group.primaryCharacterId)) || members[0];
    const shown = group.collapsed ? [primary] : members;

    rows.push(
      groupHeader(
        groupName,
        members.length,
        Boolean(group.collapsed),
        () => handleToggleGroup(groupName),
        `group-${groupName}`
      )
    );

    for (const account of shown) {
      rows.push(
        characterCard(account, {
          grouped: true,
          groupName,
          primaryId: primary.characterId
        })
      );
      renderedIds.add(Number(account.characterId));
    }
  }

  const ungrouped = accounts.filter(
    (acc) => !renderedIds.has(Number(acc.characterId))
  );

  if (ungrouped.length) {
    if (rows.length) {
      rows.push(groupHeader('Ungrouped', ungrouped.length, false, null, 'group-__ungrouped__'));
    }

    for (const account of ungrouped) {
      rows.push(characterCard(account, { grouped: false }));
    }
  }

  return (
    <aside className="relative w-72 min-[1350px]:w-[32rem] border-r border-gray-700 bg-gray-800 p-4 overflow-y-auto">
      <div className="sidebar-content relative z-10">
        <h2 className="text-xs font-bold uppercase text-gray-400 mb-3">Characters</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No characters added.</p>
        ) : (
          <div className="grid grid-cols-1 min-[1350px]:grid-cols-2 gap-2">
            {rows}
          </div>
        )}
      </div>
    </aside>
  );
}