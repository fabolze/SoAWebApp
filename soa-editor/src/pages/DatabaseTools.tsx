import DarkModeToggle from '../components/DarkModeToggle';

export default function DatabaseToolsPage() {
  const exportCsv = () => {
    window.open('http://localhost:5000/api/export?format=csv', '_blank');
  };

  const exportJson = () => {
    window.open('http://localhost:5000/api/export?format=json', '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900 font-sans">
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-primary dark:text-primary-content">Database Tools</h1>
          <DarkModeToggle />
        </div>
        <section className="bg-white dark:bg-slate-800 p-6 rounded shadow max-w-md">
          <h2 className="text-xl font-semibold mb-4">Export DB</h2>
          <div className="flex gap-2 mb-2">
            <button onClick={exportCsv} className="btn btn-sm btn-primary">CSV</button>
            <button onClick={exportJson} className="btn btn-sm btn-secondary">JSON</button>
          </div>
          <p className="text-sm text-slate-500">CSV is recommended for Unreal Engine DataTables; JSON contains full structure.</p>
        </section>
      </main>
    </div>
  );
}
