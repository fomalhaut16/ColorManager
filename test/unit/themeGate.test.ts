import { describe, expect, it } from 'vitest';
import { isTargetThemeActive, ThemeKind, type ThemeInputs } from '../../src/themeGate';

const base: ThemeInputs = {
  kind: ThemeKind.Light,
  autoDetectHighContrast: true,
  autoDetectColorScheme: false,
  colorTheme: 'Visual Studio Light',
  preferredLightColorTheme: 'Light+',
  preferredDarkColorTheme: 'Dark+',
};

describe('isTargetThemeActive', () => {
  it('uses workbench.colorTheme by default', () => {
    expect(isTargetThemeActive(base)).toBe(true);
    expect(isTargetThemeActive({ ...base, colorTheme: 'Visual Studio Dark' })).toBe(false);
  });

  it('follows the preferred theme when auto-detecting the color scheme', () => {
    expect(isTargetThemeActive({ ...base, autoDetectColorScheme: true })).toBe(false);
    expect(
      isTargetThemeActive({ ...base, autoDetectColorScheme: true, preferredLightColorTheme: 'Visual Studio Light' }),
    ).toBe(true);
    expect(
      isTargetThemeActive({
        ...base,
        kind: ThemeKind.Dark,
        autoDetectColorScheme: true,
        preferredLightColorTheme: 'Visual Studio Light',
      }),
    ).toBe(false);
  });

  it('is inactive in OS high contrast mode', () => {
    expect(isTargetThemeActive({ ...base, kind: ThemeKind.HighContrastLight })).toBe(false);
    expect(isTargetThemeActive({ ...base, kind: ThemeKind.HighContrastLight, autoDetectHighContrast: false })).toBe(true);
  });
});
