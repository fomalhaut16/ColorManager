// Role tables from docs/implementation-plan.md section 6.
// Hue = H (main hue) + offset unless `hue` fixes an absolute hue.

export type FontStyle = '' | 'italic' | 'bold' | 'underline' | 'strikethrough';

export interface RoleDef {
  L: number;
  C: number;
  /** Degrees added to the main hue. */
  offset?: number;
  /** Absolute hue; overrides `offset`. */
  hue?: number;
  /** Vivid text gets the anchor corrections (plan 6.7). */
  group?: 'vivid';
  /** Alpha appended as-is to the hex (not a composited target). */
  alpha?: number;
}

/** UI roles (plan 6.5). */
export const UI_ROLES = {
  'editor.bg': { L: 0.955, C: 0.022 },
  'sideBar.bg': { L: 0.935, C: 0.03 },
  'tabs.strip': { L: 0.928, C: 0.032 },
  'titleBar.bg': { L: 0.922, C: 0.034 },
  'activityBar.bg': { L: 0.91, C: 0.04 },
  'widget.bg': { L: 0.975, C: 0.012 },
  'widget.shadow': { L: 0.3, C: 0.02, alpha: 0x29 / 255 },
  'input.bg': { L: 0.985, C: 0.008 },
  border: { L: 0.86, C: 0.03 },
  'border.strong': { L: 0.78, C: 0.04 },
  lineHighlight: { L: 0.935, C: 0.03 },
  'list.hover': { L: 0.915, C: 0.036 },
  'list.activeSelection': { L: 0.865, C: 0.06 },
  'list.inactiveSelection': { L: 0.895, C: 0.04 },
  'sel.editor': { L: 0.875, C: 0.06 },
  'sel.editor.inactive': { L: 0.9, C: 0.04 },
  selHighlight: { L: 0.9, C: 0.045 },
  wordHighlight: { L: 0.91, C: 0.04 },
  'find.current': { L: 0.82, C: 0.11, offset: 120 },
  'find.other': { L: 0.885, C: 0.07, offset: 120 },
  indentGuide: { L: 0.88, C: 0.02 },
  'indentGuide.active': { L: 0.74, C: 0.04 },
  scrollbar: { L: 0.8, C: 0.02, alpha: 0x80 / 255 },
  'scrollbar.active': { L: 0.68, C: 0.08, alpha: 0x80 / 255 },
  lineNumber: { L: 0.66, C: 0.03 },
  'lineNumber.active': { L: 0.42, C: 0.05 },
  'fg.primary': { L: 0.3, C: 0.025 },
  'editor.fg': { L: 0.28, C: 0.025 },
  'fg.secondary': { L: 0.47, C: 0.03 },
  'fg.disabled': { L: 0.66, C: 0.02 },
  accent: { L: 0.54, C: 0.13 },
  'accent.hover': { L: 0.49, C: 0.13 },
  textLink: { L: 0.49, C: 0.13 },
  cursor: { L: 0.49, C: 0.15 },
  focus: { L: 0.58, C: 0.13 },
  'statusBar.bg': { L: 0.5, C: 0.11 },
  'statusBar.alt': { L: 0.5, C: 0.11, offset: 180 },
  'button.secondary': { L: 0.88, C: 0.04 },
} as const satisfies Record<string, RoleDef>;

/** Syntax roles (plan 6.6). */
export const TOKEN_ROLES = {
  'tok.keyword': { L: 0.49, C: 0.15, group: 'vivid' },
  'tok.storage': { L: 0.42, C: 0.11, offset: 20, group: 'vivid' },
  'tok.function': { L: 0.49, C: 0.13, offset: -60, group: 'vivid' },
  'tok.type': { L: 0.49, C: 0.11, offset: -120, group: 'vivid' },
  'tok.string': { L: 0.515, C: 0.12, offset: 180, group: 'vivid' },
  'tok.number': { L: 0.49, C: 0.13, offset: 120, group: 'vivid' },
  'tok.parameter': { L: 0.45, C: 0.08, offset: 60, group: 'vivid' },
  'tok.regexp': { L: 0.45, C: 0.11, offset: 150, group: 'vivid' },
  'tok.property': { L: 0.42, C: 0.05, offset: -120 },
  'tok.variable': { L: 0.28, C: 0.025 },
  'tok.comment': { L: 0.62, C: 0.035 },
  'tok.operator': { L: 0.4, C: 0.02 },
} as const satisfies Record<string, RoleDef>;

/** Fixed-hue status colors (plan 6.8). `dir`/`amp` drive the lightness dodge. */
export const STATUS_ROLES = {
  'status.error': { L: 0.55, C: 0.19, hue: 27, dir: -1, amp: 0.1 },
  'status.warning': { L: 0.64, C: 0.14, hue: 70, dir: 1, amp: 0.06 },
  'status.info': { L: 0.55, C: 0.14, hue: 250, dir: -1, amp: 0.1 },
  'status.success': { L: 0.58, C: 0.15, hue: 145, dir: 1, amp: 0.06 },
} as const;

export const DIFF_ROLES = {
  'diff.insertedBg': { L: 0.9, C: 0.05, hue: 145 },
  'diff.removedBg': { L: 0.9, C: 0.05, hue: 27 },
} as const satisfies Record<string, RoleDef>;

const ANSI_BASE = {
  red: { L: 0.55, C: 0.17, hue: 27 },
  green: { L: 0.55, C: 0.14, hue: 145 },
  yellow: { L: 0.58, C: 0.13, hue: 85 },
  blue: { L: 0.52, C: 0.14, hue: 255 },
  magenta: { L: 0.53, C: 0.15, hue: 330 },
  cyan: { L: 0.55, C: 0.09, hue: 200 },
} as const;

/** Bright ANSI colors are slightly lighter and more vivid than the base ones. */
const ANSI_BRIGHT_DL = 0.02;

/** Terminal ANSI colors (plan 6.9). Black/white families follow the main hue. */
export const ANSI_ROLES = {
  'ansi.black': { L: 0.3, C: 0.025 },
  'ansi.white': { L: 0.48, C: 0.02 },
  'ansi.brightBlack': { L: 0.55, C: 0.02 },
  'ansi.brightWhite': { L: 0.7, C: 0.015 },
  'ansi.red': ANSI_BASE.red,
  'ansi.green': ANSI_BASE.green,
  'ansi.yellow': ANSI_BASE.yellow,
  'ansi.blue': ANSI_BASE.blue,
  'ansi.magenta': ANSI_BASE.magenta,
  'ansi.cyan': ANSI_BASE.cyan,
  'ansi.brightRed': { ...ANSI_BASE.red, L: ANSI_BASE.red.L + ANSI_BRIGHT_DL, C: ANSI_BASE.red.C + 0.02 },
  'ansi.brightGreen': { ...ANSI_BASE.green, L: ANSI_BASE.green.L + ANSI_BRIGHT_DL, C: ANSI_BASE.green.C + 0.02 },
  'ansi.brightYellow': { ...ANSI_BASE.yellow, L: ANSI_BASE.yellow.L + ANSI_BRIGHT_DL, C: ANSI_BASE.yellow.C + 0.02 },
  'ansi.brightBlue': { ...ANSI_BASE.blue, L: ANSI_BASE.blue.L + ANSI_BRIGHT_DL, C: ANSI_BASE.blue.C + 0.02 },
  'ansi.brightMagenta': { ...ANSI_BASE.magenta, L: ANSI_BASE.magenta.L + ANSI_BRIGHT_DL, C: ANSI_BASE.magenta.C + 0.02 },
  'ansi.brightCyan': { ...ANSI_BASE.cyan, L: ANSI_BASE.cyan.L + ANSI_BRIGHT_DL, C: ANSI_BASE.cyan.C + 0.02 },
} as const satisfies Record<string, RoleDef>;

/** Bracket pair colorization: six colors rotating with the main hue. */
export const BRACKET_ROLES = {
  'bracket.1': { L: 0.5, C: 0.12, offset: 0 },
  'bracket.2': { L: 0.5, C: 0.12, offset: 60 },
  'bracket.3': { L: 0.5, C: 0.12, offset: 120 },
  'bracket.4': { L: 0.5, C: 0.12, offset: 180 },
  'bracket.5': { L: 0.5, C: 0.12, offset: 240 },
  'bracket.6': { L: 0.5, C: 0.12, offset: 300 },
} as const satisfies Record<string, RoleDef>;

/** Aliases reuse another role's color, optionally with a font style (plan 6.6). */
export const ALIAS_ROLES = {
  'tok.tag': { of: 'tok.keyword', fontStyle: '' },
  'tok.attribute': { of: 'tok.type', fontStyle: '' },
  'tok.escape': { of: 'tok.number', fontStyle: 'bold' },
  'tok.decorator': { of: 'tok.function', fontStyle: 'italic' },
  'md.heading': { of: 'tok.keyword', fontStyle: 'bold' },
  'md.bold': { of: 'editor.fg', fontStyle: 'bold' },
  'md.italic': { of: 'editor.fg', fontStyle: 'italic' },
  'md.link': { of: 'textLink', fontStyle: 'underline' },
  'md.strike': { of: 'fg.secondary', fontStyle: 'strikethrough' },
  'md.quote': { of: 'tok.comment', fontStyle: '' },
  'diff.inserted': { of: 'status.success', fontStyle: '' },
  'diff.deleted': { of: 'status.error', fontStyle: '' },
  'diff.changed': { of: 'status.warning', fontStyle: '' },
  'diff.header': { of: 'status.info', fontStyle: '' },
  fg: { of: 'editor.fg', fontStyle: '' },
} as const satisfies Record<string, { of: string; fontStyle: FontStyle }>;

/** Font styles of base token roles. Everything else is ''. */
export const BASE_FONT_STYLES: Partial<Record<string, FontStyle>> = {
  'tok.parameter': 'italic',
  'tok.comment': 'italic',
};

export const ON_ACCENT_HEX = '#ffffff';

export type UiRole = keyof typeof UI_ROLES;
export type TokenRole = keyof typeof TOKEN_ROLES;
export type StatusRole = keyof typeof STATUS_ROLES;
export type DiffRole = keyof typeof DIFF_ROLES;
export type AnsiRole = keyof typeof ANSI_ROLES;
export type BracketRole = keyof typeof BRACKET_ROLES;
export type AliasRole = keyof typeof ALIAS_ROLES;
export type RoleName =
  | UiRole
  | TokenRole
  | StatusRole
  | DiffRole
  | AnsiRole
  | BracketRole
  | AliasRole
  | 'onAccent';

/** Roles whose L is at least this get their chroma scaled by `tint`. */
export const TINT_MIN_L = 0.86;
