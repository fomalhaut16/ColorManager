export const TARGET_THEME = 'Visual Studio Light';
export const THEME_KEY = `[${TARGET_THEME}]`;

export const MANAGED_KEYS = [
  'workbench.colorCustomizations',
  'editor.tokenColorCustomizations',
  'editor.semanticTokenColorCustomizations',
] as const;
export type ManagedKey = (typeof MANAGED_KEYS)[number];

/** Values written under THEME_KEY of each managed key. */
export type Payload = Record<ManagedKey, Record<string, unknown>>;

export const COLOR_THEME_KEY = 'workbench.colorTheme';
