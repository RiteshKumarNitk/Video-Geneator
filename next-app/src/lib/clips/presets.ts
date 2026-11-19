import { sql, InputError } from './db';
import { validLayout, validStyle, type Preset } from './model';

export async function presets(user: string) {
  return sql<
    Preset[]
  >`select name,layout,style from clip_user_preset where owner=${user} order by lower(name),name`;
}
export async function savePreset(p: Preset, user: string) {
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name || name.length > 80 || !validLayout(p.layout) || !validStyle(p.style))
    throw new InputError('Invalid preset name, layout or caption style.');
  const rows =
    await sql`insert into clip_user_preset(owner,name,layout,style) values(${user},${name},${sql.json(p.layout)},${sql.json(p.style)}) on conflict do nothing returning name`;
  if (!rows.length) throw new InputError('A preset already uses this name.', 409);
}
