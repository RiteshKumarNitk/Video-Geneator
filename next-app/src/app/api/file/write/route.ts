import {owner} from '@/lib/auth';
import {getStoragePath} from '@/lib/storage';
import {InputError,failure} from '@/lib/clips/db';
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';



export async function POST(req: Request) {
  try {
    const PROJECT_ROOT=getStoragePath('user-files/'+await owner());
    const { filePath: relativePath, content, overwrite } = await req.json();

    if (!relativePath || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing filePath or content' }, { status: 400 });
    }

    // Security: prevent path traversal
    const normalized = path.normalize(relativePath).replace(/^[\\/]+/, '');
    const fullPath = path.resolve(PROJECT_ROOT, normalized);

    if (!fullPath.startsWith(PROJECT_ROOT+path.sep)) {
      return NextResponse.json({ error: 'Path outside project directory' }, { status: 403 });
    }

    // Check if file exists
    if (fs.existsSync(fullPath) && !overwrite) {
      return NextResponse.json({
        error: 'File already exists',
        exists: true,
        filePath: normalized,
      }, { status: 409 });
    }

    // Create directory if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      filePath: normalized,
      action: fs.existsSync(fullPath) && !overwrite ? 'created' : 'written',
    });
  } catch (err: any) {
    if(err instanceof InputError)return failure(err);
    return NextResponse.json({ error: err.message || 'Write failed' }, { status: 500 });
  }
}
