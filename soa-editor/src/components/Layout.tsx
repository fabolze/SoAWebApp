import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <div className="flex">
      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
