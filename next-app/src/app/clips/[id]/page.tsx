import { notFound, redirect } from 'next/navigation';
import { session } from '@/lib/auth';
import { uuid, sql } from '@/lib/clips/db';
import { AccountForm } from '../Account';
export default async function Draft({ params }: { params: Promise<{ id: string }> }) {
  const user = (await session())?.user;
  if (!user) return <AccountForm />;
  const { id } = await params;
  if (!uuid(id)) notFound();
  const [clip] =
    await sql`select c.source from clip c join clip_source s on s.id=c.source where c.id=${id} and s.owner=${user.id}`;
  if (!clip) notFound();
  redirect('/clips#source=' + clip.source + '&clip=' + id);
}
