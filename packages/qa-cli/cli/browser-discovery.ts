import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

/** A browser selected for a QA environment. */
export interface SelectedBrowser {
  channel: 'chrome' | 'msedge' | 'chromium';
  path: string;
  scope: 'system-or-user' | 'environment';
}

/** Find an existing Chrome, Edge or Chromium without launching or modifying it. */
export function findSystemBrowser(environment: NodeJS.ProcessEnv, channel?: SelectedBrowser['channel']): SelectedBrowser | undefined {
  const windows = process.platform === 'win32';
  const home = environment.HOME ?? environment.USERPROFILE;
  const programDirs = [environment.LOCALAPPDATA, environment.ProgramFiles, environment['ProgramFiles(x86)']].filter((value): value is string => Boolean(value));
  const candidates: Record<SelectedBrowser['channel'], string[]> = {
    chrome: [],
    msedge: [],
    chromium: [],
  };
  if (windows) {
    candidates.chrome.push(...programDirs.map(dir => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')));
    candidates.msedge.push(...programDirs.map(dir => join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')));
    candidates.chromium.push(...programDirs.map(dir => join(dir, 'Chromium', 'Application', 'chrome.exe')));
  } else if (process.platform === 'darwin') {
    for (const dir of ['/Applications', ...(home ? [join(home, 'Applications')] : [])]) {
      candidates.chrome.push(join(dir, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
      candidates.msedge.push(join(dir, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'));
      candidates.chromium.push(join(dir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
    }
  }
  const names = windows ? { chrome: ['chrome.exe'], msedge: ['msedge.exe'], chromium: ['chromium.exe'] }
    : { chrome: ['google-chrome', 'google-chrome-stable'], msedge: ['microsoft-edge', 'microsoft-edge-stable'], chromium: ['chromium', 'chromium-browser'] };
  for (const dir of (environment.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names.chrome) candidates.chrome.push(join(dir.replace(/^"|"$/gu, ''), name));
    for (const name of names.msedge) candidates.msedge.push(join(dir.replace(/^"|"$/gu, ''), name));
    for (const name of names.chromium) candidates.chromium.push(join(dir.replace(/^"|"$/gu, ''), name));
  }
  for (const selected of channel ? [channel] : ['chrome', 'msedge', 'chromium'] as const) {
    for (const path of candidates[selected]) {
      try {
        if (!statSync(path).isFile()) continue;
        accessSync(path, windows ? constants.F_OK : constants.X_OK);
        return { channel: selected, path: resolve(path), scope: 'system-or-user' };
      } catch { /* Check the next existing installation. */ }
    }
  }
  return undefined;
}
