export interface ApiErrorPayload {
  error?: boolean;
  message?: string;
  path?: string;
  status?: number;
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatApiError(payload: unknown, fallback = "Request failed."): string {
  if (!isRecord(payload)) return fallback;
  const message = typeof payload.message === "string" && payload.message.trim() ? payload.message.trim() : fallback;
  const path = typeof payload.path === "string" && payload.path.trim() ? payload.path.trim() : "";
  return path ? `${message} (${path})` : message;
}

export async function responseErrorMessage(response: Response, fallback = "Request failed."): Promise<string> {
  const payload = await response.json().catch(() => null);
  return formatApiError(payload, fallback);
}
