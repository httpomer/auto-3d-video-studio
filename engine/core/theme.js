// Visual identity. Every video picks one theme; all scenes and on-screen
// graphics draw their colours from it so the channel keeps a consistent look.

const base = {
  text: '#f4f7fb',
  textDim: '#9fb0c8',
  fontHead: '"Space Grotesk", "Inter", sans-serif',
  fontBody: '"Inter", sans-serif',
  fontMono: '"JetBrains Mono", monospace',
};

export const THEMES = {
  // cool blue technology look
  tech: { ...base, bg0: '#03050a', bg1: '#0a1626', floor: '#05080f', accent: '#3fa9ff', accent2: '#6ff3d0', warm: '#ffb65c', danger: '#ff5d6c', metal: '#aab4c4' },
  // green silicon look (semiconductors, GPUs)
  silicon: { ...base, bg0: '#030605', bg1: '#0a1a14', floor: '#050a08', accent: '#7ee04a', accent2: '#3fd9ff', warm: '#ffc857', danger: '#ff5d6c', metal: '#b0b8b4' },
  // emerald + gold financial look
  finance: { ...base, bg0: '#04060a', bg1: '#0c1a1c', floor: '#06090c', accent: '#2fe6a0', accent2: '#f6c453', warm: '#f6c453', danger: '#ff5a5f', metal: '#b9b4a4' },
  // violet AI look
  ai: { ...base, bg0: '#05040c', bg1: '#140f2c', floor: '#07060f', accent: '#a688ff', accent2: '#3fe0ff', warm: '#ff9f6b', danger: '#ff5d8a', metal: '#b2aec8' },
  // warm amber look (energy, economy, history)
  amber: { ...base, bg0: '#070504', bg1: '#1d130b', floor: '#0a0706', accent: '#ffb347', accent2: '#5fd4ff', warm: '#ff7e47', danger: '#ff5a5f', metal: '#c2b6a4' },
};

export function getTheme(name, overrides = {}) {
  const t = THEMES[name] || THEMES.tech;
  return { name: THEMES[name] ? name : 'tech', ...t, ...overrides };
}
