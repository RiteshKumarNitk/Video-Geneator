import path from 'path';

export function getStoragePath(subDir: string = ''): string {
  // If running in docker, use /app/shared-storage, else use local next-app/shared-storage
  const baseDir = process.env.SHARED_STORAGE_PATH || 
    (process.platform === 'win32' 
      ? path.join(process.cwd(), 'shared-storage') 
      : '/app/shared-storage');
    
  return subDir ? path.join(baseDir, subDir) : baseDir;
}
