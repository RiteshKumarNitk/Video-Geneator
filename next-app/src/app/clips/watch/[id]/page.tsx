import { notFound } from 'next/navigation';
import Link from 'next/link';
import { session } from '@/lib/auth';
import { uuid, sql } from '@/lib/clips/db';
import { AccountForm } from '../../Account';
export default async function Watch({ params }: { params: Promise<{ id: string }> }) {
  const user = (await session())?.user;
  if (!user) return <AccountForm />;
  const { id } = await params;
  if (!uuid(id)) notFound();
  const [row] =
    await sql`select c.title,c.id from clip_export e join clip c on c.id=e.clip join clip_source s on s.id=c.source where e.id=${id} and e.status='completed' and s.owner=${user.id}`;
  if (!row) notFound();
  return (
    <div className="page-container clips">
      <h1>{row.title}</h1>
      <video
        style={{ maxHeight: '75vh', maxWidth: '100%' }}
        controls
        playsInline
        src={'/api/clips/export/' + id + '?play=1'}
      />
      <div className="clip-row">
        <a className="btn btn-primary" download href={'/api/clips/export/' + id}>
          Download MP4
        </a>
        <a download href={'/api/clips/pack/' + id + '?platform=facebook&scope=export'}>Download Facebook Reel pack</a>
        <Link href={'/clips/' + row.id}>Open draft</Link>
      </div>
    </div>
  );
}
