import { session } from '@/lib/auth';
import Workspace from './ClipsWorkspace';
import { AccountForm } from './Account';
export default async function Clips() {
  const user = (await session())?.user;
  return user ? <Workspace email={user.email} /> : <AccountForm />;
}
