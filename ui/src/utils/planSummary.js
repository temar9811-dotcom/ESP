// ui/src/utils/planSummary.js
// VERSION: 1.0
//
// Shared SP / training-time math for skill plans. Lives here so the plan list
// and the plan editor can never disagree about a plan's totals.

export const MAX_LEVEL = 5;

export const CHAR_ATTR_KEY = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower'
};

// SP needed to take a rank-R skill from level 0 to `level`.
export const spAtLevel = (rank, level) => {
  const r = Number(rank) > 0 ? Number(rank) : 1;
  const l = Number(level) || 0;
  return l <= 0 ? 0 : Math.round(250 * r * Math.pow(Math.sqrt(32), l - 1));
};

export const formatSP = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
};

export const formatTrain = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return '0m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = Math.floor(m % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (mm > 0 || parts.length === 0) parts.push(`${mm}m`);
  return parts.join(' ');
};

// Remaining SP + estimated training time for a set of plan entries, excluding
// levels the character has already trained. Falls back to a default SP rate when
// the skill's attributes are unknown.
export function summarizePlan(entries, catalogById, skillLevels, attributes) {
  let totalRemainingSP = 0;
  let totalMinutes = 0;
  let attrCount = 0;
  if (attributes) {
    const names = Object.keys(CHAR_ATTR_KEY).map((k) => CHAR_ATTR_KEY[k]);
    attrCount = names.filter((n) => typeof attributes[n] === 'number').length;
  }
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const skill = catalogById?.get(entry.skillId);
    const rank = Number(skill?.rank) > 0 ? Number(skill.rank) : 1;
    const charLevel = skillLevels?.[entry.skillId] || 0;
    if (charLevel >= entry.level) return;
    const targetSp = spAtLevel(rank, entry.level);
    const knownSp = spAtLevel(rank, charLevel);
    const remaining = Math.max(0, targetSp - knownSp);
    totalRemainingSP += remaining;
    if (remaining > 0 && attributes) {
      const pKey = CHAR_ATTR_KEY[skill?.primaryAttr];
      const sKey = CHAR_ATTR_KEY[skill?.secondaryAttr];
      const p = typeof attributes[pKey] === 'number' ? attributes[pKey] : null;
      const s = typeof attributes[sKey] === 'number' ? attributes[sKey] : null;
      const spPerMin = (p !== null && s !== null) ? (p + s / 2) : 45;
      totalMinutes += remaining / spPerMin;
    }
  });
  return { totalRemainingSP, totalMinutes, hasAttributes: attrCount === 5 };
}
