import { InputError,failure } from '@/lib/clips/db';
import { owner } from '@/lib/auth';
import { createJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { saveUpload } from '@/lib/videoUpload';
import { randomUUID } from 'node:crypto';

export async function POST(req: Request) {
  try {
    const user=await owner();
    const id = randomUUID();
    const { relative, filename } = await saveUpload(req, id);
    return Response.json(
      await createJob({ owner:user,id, status: 'PENDING', filename, originalVideo: getStoragePath(relative) }),
    );
  } catch (error) {
    if(error instanceof InputError)return failure(error);
    return Response.json({ error: 'Could not save the uploaded file.' }, { status: 400 });
  }
}
