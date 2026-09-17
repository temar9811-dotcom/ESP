/* ui/src/theme.js | Adapted from MIL (E:\AI\Mrchi Apps\MIL\src\renderer\ui-settings-other.js) */
export const THEME_OPTIONS = [
  { value: 'kick-mrchi', label: 'Kick MRCHI (Default)' },
  { value: '', label: 'Default (Original)' },
  { value: 'standout',   label: 'Standout' },
  { value: 'lonely-night', label: 'Lonely Night' },
  { value: 'shine-bright', label: 'Shine Bright' }
];

export const VALID_THEMES = THEME_OPTIONS.map(o => o.value);

export function applyTheme(theme) {
  const safe = VALID_THEMES.includes(theme) ? theme : '';
  if (safe) document.body.setAttribute('data-theme', safe);
  else document.body.removeAttribute('data-theme');
}

export function fadeToward(hex, bg, t) {
  const nums = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = nums(hex), [r2, g2, b2] = nums(bg);
  const mix = (a, b) => Math.round(a * t + b * (1 - t));
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

/* Assets tree: alternating region hues + depth fade (kick-mrchi) */
export const ASSET_REGION_COLORS = ['#67e8f9', '#5eead4'];
export const ASSET_BG = '#0b1526';
export const ASSET_DEPTH_FADE = [1, 0.78, 0.62, 0.48, 0.34];

export const assetColorVars = (hue, depth) => ({
  '--k-color': fadeToward(hue, ASSET_BG, ASSET_DEPTH_FADE[Math.max(0, Math.min(depth, ASSET_DEPTH_FADE.length - 1))]),
  '--k-hue': hue
});
