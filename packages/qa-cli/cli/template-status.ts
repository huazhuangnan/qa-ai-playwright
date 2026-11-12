import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, digest, templateVersion } from './shared.ts';

type TemplateStatus = { name: string; path: string; version: string | null; files: number; status: 'ok' | 'missing' | 'broken' };

function inspect(name: string, path: string): TemplateStatus {
  if (!existsSync(path) || !lstatSync(path).isDirectory()) return { name, path, version: null, files: 0, status: 'missing' };
  try {
    const version = templateVersion(path);
    let files = 0;
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const child = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`linked template path: ${child}`);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) { digest(child); files += 1; }
        else throw new Error(`unsupported template entry: ${child}`);
      }
    };
    visit(path);
    return { name, path, version, files, status: 'ok' };
  } catch { return { name, path, version: null, files: 0, status: 'broken' }; }
}

/** List delivered language and QA templates without changing files. */
export function listTemplates(repo = REPO): TemplateStatus[] {
  return [inspect('python', join(repo, 'packages/templates/python')), inspect('typescript', join(repo, 'packages/templates/typescript')), inspect('qa', join(repo, 'packages/templates/qa'))];
}

/** Check delivered templates and return a nonzero-compatible status. */
export function checkTemplates(repo = REPO): { templates: TemplateStatus[]; ok: boolean } {
  const templates = listTemplates(repo);
  return { templates, ok: templates.every((item) => item.status === 'ok') };
}
