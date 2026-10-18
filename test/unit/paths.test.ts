import { describe, expect, it } from 'vitest';
import { sameFilePath } from '../../src/paths';

describe('sameFilePath', () => {
  it('ignores drive letter and case differences on Windows', () => {
    expect(sameFilePath('/c:/Users/me/AppData/Roaming/Code/User/settings.json', '/C:/Users/Me/AppData/Roaming/Code/User/settings.json', 'win32')).toBe(true);
    expect(sameFilePath('c:\\Users\\me\\settings.json', '/C:/Users/me/settings.json'.slice(1), 'win32')).toBe(true);
  });

  it('stays exact elsewhere', () => {
    expect(sameFilePath('/Users/me/settings.json', '/Users/me/settings.json', 'darwin')).toBe(true);
    expect(sameFilePath('/Users/me/settings.json', '/Users/Me/settings.json', 'darwin')).toBe(false);
  });

  it('tells different files apart', () => {
    expect(sameFilePath('/c:/a/settings.json', '/c:/b/settings.json', 'win32')).toBe(false);
  });
});
