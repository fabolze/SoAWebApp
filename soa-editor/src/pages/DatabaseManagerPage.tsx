import { useEffect, useState } from 'react';

export default function DatabaseManagerPage() {
  const [dbs, setDbs] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [name, setName] = useState('preview');

  const loadDbs = () => {
    fetch('/api/db/list')
      .then((r) => r.json())
      .then((data) => {
        setDbs(data.databases || []);
        setActive(data.active);
      });
  };

  useEffect(() => { loadDbs(); }, []);

  const createDb = async () => {
    await fetch('/api/db/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    loadDbs();
  };

  const deleteDb = async (n: string) => {
    if (!window.confirm(`Delete database ${n}?`)) return;
    await fetch('/api/db/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n.replace('db_','').replace('.sqlite','') })
    });
    loadDbs();
  };

  const resetDb = async () => {
    if (!window.confirm('Reset main database? This will delete all data.')) return;
    await fetch('/api/db/reset', { method: 'POST' });
    loadDbs();
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Database Manager</h1>
      <p className="mb-4">Active database: <strong>{active}</strong></p>
      <div className="flex items-center gap-2 mb-6">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="border p-2 rounded"
          placeholder="database name"
        />
        <button onClick={createDb} className="bg-blue-600 text-white px-3 py-1 rounded">
          Create
        </button>
        <button onClick={resetDb} className="ml-4 bg-orange-600 text-white px-3 py-1 rounded">
          Reset Main
        </button>
      </div>
      <ul className="space-y-2">
        {dbs.map(db => (
          <li key={db} className="flex items-center gap-2">
            <span className="flex-1">{db}</span>
            {db !== active ? (
              <button
                onClick={() => deleteDb(db)}
                className="bg-red-600 text-white px-2 py-1 rounded"
              >
                Delete
              </button>
            ) : (
              <span className="text-sm text-gray-500">Active</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
