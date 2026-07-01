import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const IGNORE = new Set([
  'node_modules', '.next', 'out', 'dist', 'build',
  '.git', '.vscode', '.idea', '__pycache__', '.cache',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
]);

function buildTree(dir: string, prefix = ''): string {
  let result = '';
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }

  // Sort: dirs first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;

    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    result += prefix + connector + entry.name + '\n';

    if (entry.isDirectory()) {
      const ext = isLast ? '    ' : '│   ';
      result += buildTree(path.join(dir, entry.name), prefix + ext);
    }
  }

  return result;
}

export async function GET() {
  try {
    const tree = buildTree(PROJECT_ROOT);
    return NextResponse.json({
      root: path.basename(PROJECT_ROOT),
      tree,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
