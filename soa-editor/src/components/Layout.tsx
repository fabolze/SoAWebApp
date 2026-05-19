import { Outlet } from 'react-router-dom';
import RecoverySyncBanner from './RecoverySyncBanner';
import Sidebar from './Sidebar';

export default function Layout({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <main className="relative flex-1 overflow-y-auto">
        <RecoverySyncBanner />
        <Outlet />
      </main>
    </div>
  );
}
