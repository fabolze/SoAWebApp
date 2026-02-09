const DEFAULT_API_BASE_URL = "http://localhost:5000";

function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw || DEFAULT_API_BASE_URL).trim();
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildApiUrl(path), init);
}
