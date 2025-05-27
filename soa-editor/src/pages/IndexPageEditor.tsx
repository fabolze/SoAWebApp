// /soa-editor/src/pages/IndexPageEditor.tsx
// This file is responsible for rendering the index page of the application.
// It contains links to all the other pages in the application.
import { Link } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '../components/Sidebar';
// import './IndexPage.css'; // Assuming you will add custom styles for the grid layout

const IndexPage = () => {
  const [dark, setDark] = useState(false);
  const pages = [
    { path: '/abilities', name: 'Abilities Editor' },
    { path: '/effects', name: 'Effects Editor' },
    { path: '/attributes', name: 'Attributes Editor' },
    { path: '/characterclasses', name: 'CharacterClasses Editor' },
    { path: '/dialogue-nodes', name: 'Dialogue Nodes Editor' },
    { path: '/dialogues', name: 'Dialogues Editor' },
    { path: '/encounters', name: 'Encounters Editor' },
    { path: '/enemies', name: 'Enemies Editor' },
    { path: '/events', name: 'Events Editor' },
    { path: '/factions', name: 'Factions Editor' },
    { path: '/flags', name: 'Flags Editor' },
    { path: '/items', name: 'Items Editor' },
    { path: '/locations', name: 'Locations Editor' },
    { path: '/lore-entries', name: 'Lore Entries Editor' },
    { path: '/npcs', name: 'NPCs Editor' },
    { path: '/quests', name: 'Quests Editor' },
    { path: '/requirements', name: 'Requirements Editor' },
    { path: '/shops', name: 'Shops Editor' },
    { path: '/shops-inventory', name: 'Shops Inventory Editor' },
    { path: '/stats', name: 'Stats Editor' },
    { path: '/story-arcs', name: 'Story Arcs Editor' },
    { path: '/timelines', name: 'Timelines Editor' },
  ];

  // Toggle dark mode by toggling the 'dark' class on html
  const handleToggleDark = () => {
    setDark((d) => {
      const html = document.documentElement;
      if (!d) {
        html.setAttribute('data-theme', 'dark');
        html.classList.add('dark');
      } else {
        html.setAttribute('data-theme', 'corporate');
        html.classList.remove('dark');
      }
      return !d;
    });
  };

  return (
    <div className="min-h-screen flex bg-gray-100 font-sans">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-primary">Welcome to the SoA Editor</h1>
          <button
            className="btn btn-sm btn-outline btn-primary"
            onClick={handleToggleDark}
            aria-label="Toggle dark mode"
          >
            {dark ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {pages.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="card bg-white rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-1 p-8 flex flex-col items-center justify-center text-lg font-medium text-gray-800 border border-gray-200 hover:border-primary dark:bg-gray-900 dark:text-white dark:border-gray-700 group focus:outline-none focus:ring-2 focus:ring-primary/40"
              tabIndex={0}
              aria-label={page.name}
            >
              <span className="mb-3 w-12 h-12 flex items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition text-2xl">
                <img src="/vite.svg" alt="icon" className="w-8 h-8" />
              </span>
              <h2 className="text-xl font-semibold text-primary mb-0 dark:text-primary-content text-center group-hover:text-white transition">{page.name}</h2>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};

export default IndexPage;