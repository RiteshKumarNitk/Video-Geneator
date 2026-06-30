import { NextResponse } from 'next/server';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import Busboy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const jobId = uuidv4();
    const uploadDir = getStoragePath('uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const contentType = req.headers.get('content-type') || '';
    
    // Check if it's multipart form upload
    if (contentType.includes('multipart/form-data')) {
      return new Promise((resolve) => {
        const headers = { 'content-type': contentType };
        const busboy = Busboy({ headers });
        let fileSaved = false;
        let filePath = '';
        const writePromises: Promise<void>[] = [];

        busboy.on('file', (fieldname, file, info) => {
          const { filename } = info;
          const ext = path.extname(filename) || '.mp4';
          filePath = path.join(uploadDir, `${jobId}${ext}`);
          
          const writeStream = createWriteStream(filePath);
          
          const p = new Promise<void>((resolveStream, rejectStream) => {
            writeStream.on('finish', () => {
              fileSaved = true;
              resolveStream();
            });
            writeStream.on('error', (err) => {
              console.error('File write stream error:', err);
              rejectStream(err);
            });
          });
          writePromises.push(p);

          file.pipe(writeStream);
        });

        busboy.on('finish', async () => {
          try {
            // Wait for all active file write streams to completely flush to disk
            await Promise.all(writePromises);

            if (!fileSaved || !filePath) {
              resolve(NextResponse.json({ error: 'No file was saved.' }, { status: 400 }));
              return;
            }

            // Create pending job in db (JSON store)
            const job = await createJob({
              id: jobId,
              status: 'PENDING',
              originalVideo: filePath,
            });
            resolve(NextResponse.json(job));
          } catch (err: any) {
            console.error('Error finalising file upload:', err);
            resolve(NextResponse.json({ error: 'Failed to write file to disk' }, { status: 500 }));
          }
        });

        busboy.on('error', (err: any) => {
          console.error('Busboy parsing error:', err);
          resolve(NextResponse.json({ error: err.message || 'Error parsing upload.' }, { status: 500 }));
        });

        // Convert Web ReadableStream to Node.js Readable stream and pipe to busboy
        if (req.body) {
          Readable.fromWeb(req.body as any).pipe(busboy);
        } else {
          resolve(NextResponse.json({ error: 'Empty request body.' }, { status: 400 }));
        }
      });
    } else {
      // Raw upload (alternative)
      const filenameHeader = req.headers.get('x-file-name') || 'video.mp4';
      const ext = path.extname(filenameHeader) || '.mp4';
      const filePath = path.join(uploadDir, `${jobId}${ext}`);
      
      const writeStream = createWriteStream(filePath);
      const nodeStream = Readable.fromWeb(req.body as any);
      
      await new Promise((resolve, reject) => {
        nodeStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const job = await createJob({
        id: jobId,
        status: 'PENDING',
        originalVideo: filePath,
      });

      return NextResponse.json(job);
    }
  } catch (err: any) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
