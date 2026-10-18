import { TARGET_THEME } from './settingsKeys';

/** Mirrors vscode.ColorThemeKind. */
export enum ThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export interface ThemeInputs {
  kind: ThemeKind;
  autoDetectHighContrast: boolean;
  autoDetectColorScheme: boolean;
  colorTheme: string | undefined;
  preferredLightColorTheme: string | undefined;
  preferredDarkColorTheme: string | undefined;
}

/** Same order VSCode uses to pick the effective theme (plan 9.9). */
export function effectiveThemeId(t: ThemeInputs): string | undefined {
  const highContrast = t.kind === ThemeKind.HighContrast || t.kind === ThemeKind.HighContrastLight;
  if (t.autoDetectHighContrast && highContrast) return undefined;
  if (t.autoDetectColorScheme) {
    return t.kind === ThemeKind.Dark ? t.preferredDarkColorTheme : t.preferredLightColorTheme;
  }
  return t.colorTheme;
}

export function isTargetThemeActive(t: ThemeInputs): boolean {
  return effectiveThemeId(t) === TARGET_THEME;
}
