import { createScanner, findNodeAtLocation, parseTree, SyntaxKind, type ParseError } from 'jsonc-parser';
import { getNodeValue } from 'jsonc-parser';
import { COLOR_THEME_KEY, MANAGED_KEYS, type ManagedKey } from './settingsKeys';

export interface SettingsAnalysis {
  /** Parse errors under the same options VSCode uses when writing. */
  errors: ParseError[];
  /** Parsed values of the managed keys (undefined = absent). */
  values: Record<ManagedKey, unknown>;
  colorTheme: unknown;
  /** Managed keys whose value range contains a comment. */
  keysWithComments: ManagedKey[];
}

const PARSE_OPTIONS = { allowTrailingComma: true, allowEmptyContent: true, disallowComments: false };

export function analyzeSettingsText(text: string): SettingsAnalysis {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, PARSE_OPTIONS);
  const values = {} as Record<ManagedKey, unknown>;
  const keysWithComments: ManagedKey[] = [];
  let colorTheme: unknown;
  if (root && errors.length === 0) {
    for (const key of MANAGED_KEYS) {
      const node = findNodeAtLocation(root, [key]);
      values[key] = node ? getNodeValue(node) : undefined;
      if (node && hasComment(text.slice(node.offset, node.offset + node.length))) keysWithComments.push(key);
    }
    const themeNode = findNodeAtLocation(root, [COLOR_THEME_KEY]);
    colorTheme = themeNode ? getNodeValue(themeNode) : undefined;
  }
  return { errors, values, colorTheme, keysWithComments };
}

function hasComment(fragment: string): boolean {
  const scanner = createScanner(fragment, false);
  for (let t = scanner.scan(); t !== SyntaxKind.EOF; t = scanner.scan()) {
    if (t === SyntaxKind.LineCommentTrivia || t === SyntaxKind.BlockCommentTrivia) return true;
  }
  return false;
}

/** True if every managed key value is a plain object or absent. */
export function managedValuesAreObjects(values: Record<ManagedKey, unknown>): boolean {
  return MANAGED_KEYS.every((k) => {
    const v = values[k];
    return v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v));
  });
}
