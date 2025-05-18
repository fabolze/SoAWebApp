// /soa-editor/src/pages/IndexPageEditor.tsx
// This file is responsible for rendering the index page of the application.
// It contains links to all the other pages in the application.
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
// import './IndexPage.css'; // Assuming you will add custom styles for the grid layout

const IndexPage = () => {
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

  return (
    <div className="app">
      <Sidebar />
      <div className="editor-panel">
        <div>
          <h1>Welcome to the SoA Editor</h1>
        </div>
        <div className="main-content">
          <div className="grid">
            {pages.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="card"
              >
                <h2>{page.name}</h2>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndexPage;