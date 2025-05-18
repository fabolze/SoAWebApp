// Utility to generate a readable ID based on type and name
export function generateId(type: string, name: string) {
  if (!type || !name) return '';
  // Remove spaces, lowercase, replace special chars
  const safeName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `id_${type}_${safeName}`;
}
