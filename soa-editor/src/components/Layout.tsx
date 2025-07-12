import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useEffect, useState } from 'react';

export default function Layout({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const [activeDb, setActiveDb] = useState('');

  useEffect(() => {
    fetch('/api/db/list')
      .then((r) => r.json())
      .then((data) => setActiveDb(data.active));
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="bg-slate-800 text-white px-4 py-2 text-sm">
        Active database: {activeDb || 'loading...'}
      </div>
      <div className="flex flex-1">
        <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
