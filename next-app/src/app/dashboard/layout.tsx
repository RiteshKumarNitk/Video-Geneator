import { session } from '@/lib/auth';
import { AccountForm } from '../clips/Account';
import '../clips/clips.css';
export default async function Layout({ children }: { children: React.ReactNode }) {
  return (await session()) ? children : <AccountForm />;
}
