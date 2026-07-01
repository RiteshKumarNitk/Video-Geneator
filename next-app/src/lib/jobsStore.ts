import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath } from './storage';

export interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalVideo: string | null;
  processedVideo: string | null;
  progress: number;
  duration: number | null;
  error: string | null;
  backgroundType?: string;
  type?: 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'TEXT_TO_SPEECH' | 'GENERATION';
  youtubeUrl?: string | null;
  processedClips?: string[];
  videoQuality?: string;
  orientation?: string;
  ttsLanguage?: string;
  ttsSlow?: boolean;
  createdAt: string;
  updatedAt: string;
}

function getJobsFilePath(): string {
  return getStoragePath('jobs.json');
}

export async function readJobs(): Promise<Job[]> {
  const filePath = getJobsFilePath();
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

export async function writeJobs(jobs: Job[]): Promise<void> {
  const filePath = getJobsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(jobs, null, 2), 'utf-8');
}

export async function getJob(id: string): Promise<Job | null> {
  const jobs = await readJobs();
  return jobs.find((j) => j.id === id) || null;
}

export async function createJob(data: Partial<Job> & { id: string }): Promise<Job> {
  const jobs = await readJobs();
  const base: Job = {
    id: data.id,
    status: 'PENDING',
    originalVideo: data.originalVideo || null,
    processedVideo: null,
    progress: 0,
    duration: null,
    error: null,
    backgroundType: 'green',
    type: 'MATTING',
    youtubeUrl: null,
    processedClips: [],
    videoQuality: '1080p',
    orientation: 'horizontal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const newJob: Job = { ...base, ...data as Record<string, any> };
  jobs.push(newJob);
  await writeJobs(jobs);
  return newJob;
}

export async function updateJob(id: string, data: Partial<Job>): Promise<Job> {
  const jobs = await readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw new Error('Job not found');
  
  jobs[idx] = {
    ...jobs[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await writeJobs(jobs);
  return jobs[idx];
}

export async function deleteJobRecord(id: string): Promise<void> {
  const jobs = await readJobs();
  const filtered = jobs.filter((j) => j.id !== id);
  await writeJobs(filtered);
}
