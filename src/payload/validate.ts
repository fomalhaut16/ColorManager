import { HEX_PATTERN } from '../color/hex';
import type { Payload } from '../settingsKeys';
import { REGISTRY } from './registry';

export const LIMITS = {
  colors: [100, 1500],
  textMateRules: [100, 250],
  semanticRules: [20, 60],
} as const;

/** Plan 9.2 step 3. Returns a list of problems; empty means the payload may be written. */
export function validatePayload(payload: Payload): string[] {
  const errors: string[] = [];
  const colors = payload['workbench.colorCustomizations'];
  const colorIds = Object.keys(colors);
  if (colorIds.length < LIMITS.colors[0] || colorIds.length > LIMITS.colors[1]) {
    errors.push(`unexpected color count ${colorIds.length}`);
  }
  for (const [id, v] of Object.entries(colors)) {
    if (typeof v !== 'string' || !HEX_PATTERN.test(v)) errors.push(`invalid hex for ${id}: ${String(v)}`);
    else if (REGISTRY[id]?.needsTransparency && (v.length !== 9 || v.slice(7).toLowerCase() === 'ff')) {
      errors.push(`${id} must be translucent but is ${v}`);
    }
  }

  const tm = payload['editor.tokenColorCustomizations'].textMateRules;
  if (!Array.isArray(tm)) {
    errors.push('textMateRules is not an array');
  } else {
    if (tm.length < LIMITS.textMateRules[0] || tm.length > LIMITS.textMateRules[1]) {
      errors.push(`unexpected textMateRules count ${tm.length}`);
    }
    for (const r of tm as Array<{ scope?: unknown; settings?: { foreground?: unknown; fontStyle?: unknown } }>) {
      if (typeof r.scope !== 'string') errors.push(`textMate scope must be a string: ${JSON.stringify(r.scope)}`);
      if (typeof r.settings?.foreground !== 'string' || !HEX_PATTERN.test(r.settings.foreground)) {
        errors.push(`invalid textMate foreground for ${String(r.scope)}`);
      }
      if (typeof r.settings?.fontStyle !== 'string') errors.push(`missing fontStyle for ${String(r.scope)}`);
    }
  }

  const sem = payload['editor.semanticTokenColorCustomizations'];
  if (sem.enabled !== true) errors.push('semantic enabled must be true');
  const rules = (sem.rules ?? {}) as Record<string, { foreground?: unknown }>;
  const n = Object.keys(rules).length;
  if (n < LIMITS.semanticRules[0] || n > LIMITS.semanticRules[1]) errors.push(`unexpected semantic rule count ${n}`);
  for (const [sel, s] of Object.entries(rules)) {
    if (typeof s.foreground !== 'string' || !HEX_PATTERN.test(s.foreground)) errors.push(`invalid semantic foreground for ${sel}`);
  }
  return errors;
}
