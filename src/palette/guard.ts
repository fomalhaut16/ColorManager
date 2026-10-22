import type { RoleName } from './roles';

// Contrast pairs checked (and, as a safety net, corrected) after generation.
// Lc values are absolute APCA lightness contrast.

export interface ContrastPair {
  text: RoleName;
  background: RoleName;
  minLc: number;
}

const VIVID_AND_PLAIN_TOKENS: RoleName[] = [
  'tok.keyword',
  'tok.storage',
  'tok.function',
  'tok.type',
  'tok.string',
  'tok.number',
  'tok.parameter',
  'tok.regexp',
  'tok.property',
  'tok.operator',
  'tok.variable',
];

function many(text: RoleName, backgrounds: RoleName[], minLc: number): ContrastPair[] {
  return backgrounds.map((background) => ({ text, background, minLc }));
}

export const PAIRS: readonly ContrastPair[] = [
  ...many('editor.fg', ['editor.bg', 'lineHighlight'], 75),
  ...many('fg.primary', ['editor.bg', 'sideBar.bg', 'activityBar.bg', 'titleBar.bg', 'widget.bg'], 75),
  ...many('fg.primary', ['list.activeSelection'], 60),
  ...many('editor.fg', ['sel.editor', 'find.current'], 60),
  ...many('fg.secondary', ['sideBar.bg', 'editor.bg'], 60),
  ...many('textLink', ['editor.bg'], 60),
  ...many('onAccent', ['accent', 'statusBar.bg', 'statusBar.alt'], 60),
  ...VIVID_AND_PLAIN_TOKENS.map((text) => ({ text, background: 'editor.bg' as RoleName, minLc: 60 })),
  { text: 'tok.comment', background: 'editor.bg', minLc: 45 },
  { text: 'lineNumber', background: 'editor.bg', minLc: 40 },
];
