// src/pages/AbilitiesEditor.tsx
import { useState } from 'react';
import SchemaForm from '../components/SchemaForm';
import abilitySchema from '../../../backend/app/schemas/abilities.json'

export default function AbilitiesEditor() {
  const [formData, setFormData] = useState({});

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Ability Editor</h1>
      <SchemaForm
        schema={abilitySchema}
        data={formData}
        onChange={setFormData}
      />
    </div>
  );
}
