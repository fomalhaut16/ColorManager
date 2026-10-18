// Launches the installed VSCode with a throwaway user-data-dir and runs a task
// inside it. The real ~/Library/Application Support/Code is never touched.
//
// Usage:
//   node test/integration/run.mjs            # integration tests (default)
//   node test/integration/run.mjs dump-registry
//   node test/integration/run.mjs audit
import { runTests } from '@vscode/test-electron';
import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// When launched from inside VSCode (e.g. its terminal), this is inherited and
// would make the VSCode binary start as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const task = process.argv[2] ?? 'test';
const vscodeExecutablePath =
  process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';

const sandbox = resolve(root, '.vscode-test', task);
const userDataDir = resolve(sandbox, 'user-data');
const extensionsDir = resolve(sandbox, 'extensions');
rmSync(sandbox, { recursive: true, force: true });
mkdirSync(resolve(userDataDir, 'User'), { recursive: true });
mkdirSync(extensionsDir, { recursive: true });
writeFileSync(
  resolve(userDataDir, 'User/settings.json'),
  JSON.stringify(
    {
      'workbench.colorTheme': 'Visual Studio Light',
      'colorManager.enabled': false,
      'workbench.startupEditor': 'none',
      'security.workspace.trust.enabled': false,
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'telemetry.telemetryLevel': 'off',
    },
    null,
    2,
  ),
);

const suite = resolve(root, 'out/integration/suite.js');
await esbuild.build({
  entryPoints: [resolve(root, 'test/integration/suite.ts')],
  bundle: true,
  outfile: suite,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
});

try {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: suite,
    extensionTestsEnv: { CM_TASK: task, CM_ROOT: root, CM_USER_DIR: resolve(userDataDir, 'User') },
    launchArgs: [
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
    ],
  });
} catch (err) {
  console.error(`integration task "${task}" failed`, err);
  process.exit(1);
}
