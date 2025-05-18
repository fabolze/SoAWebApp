// soa-editor/components/Sidebar.tsx
// This file is responsible for rendering the sidebar of the application.
import { Link } from 'react-router-dom';
import { useState } from 'react';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button className="toggle-button" onClick={toggleSidebar}>
        {collapsed ? '➡️' : '⬅️'}
      </button>
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/abilities">Abilities Editor</Link></li>
        <li><Link to="/effects">Effects Editor</Link></li>
        <li><Link to="/attributes">Attributes Editor</Link></li>
        <li><Link to="/characterclasses">CharacterClasses Editor</Link></li>
        <li><Link to="/dialogue-nodes">Dialogue Nodes Editor</Link></li>
        <li><Link to="/dialogues">Dialogues Editor</Link></li>
        <li><Link to="/encounters">Encounters Editor</Link></li>
        <li><Link to="/enemies">Enemies Editor</Link></li>
        <li><Link to="/events">Events Editor</Link></li>
        <li><Link to="/factions">Factions Editor</Link></li>
        <li><Link to="/flags">Flags Editor</Link></li>
        <li><Link to="/items">Items Editor</Link></li>
        <li><Link to="/locations">Locations Editor</Link></li>
        <li><Link to="/lore-entries">Lore Entries Editor</Link></li>
        <li><Link to="/npcs">NPCs Editor</Link></li>
        <li><Link to="/quests">Quests Editor</Link></li>
        <li><Link to="/requirements">Requirements Editor</Link></li>
        <li><Link to="/shops">Shops Editor</Link></li>
        <li><Link to="/shops-inventory">Shops Inventory Editor</Link></li>
        <li><Link to="/stats">Stats Editor</Link></li>
        <li><Link to="/story-arcs">Story Arcs Editor</Link></li>
        <li><Link to="/timelines">Timelines Editor</Link></li>
      </ul>
    </div>
  );
};

export default Sidebar;