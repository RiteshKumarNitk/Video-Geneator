import { session } from '@/lib/auth';
import Workspace from './ClipsWorkspace';
import { AccountForm, SignOut } from './Account';
export default async function Clips() {
  const user = (await session())?.user;
  return user ? (
    <>
      <div className="clips clip-user">
        <SignOut email={user.email} />
      </div>
      <Workspace />
    </>
  ) : (
    <AccountForm />
  );
}
