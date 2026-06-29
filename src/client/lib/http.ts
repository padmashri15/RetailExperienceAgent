export async function readJsonResponse<T>(response: Response, fallback: string, endpoint = response.url): Promise<T> {
  const text = await response.text();
  const body = parseJsonBody(text, response.headers.get("content-type"), fallback, endpoint);

  if (!response.ok) {
    const message = isErrorResponse(body) ? body.error : `${response.status} ${response.statusText}`.trim();
    throw new Error(`${fallback}: ${message}`);
  }

  return body as T;
}

export async function buildApiErrorMessage(response: Response, fallback: string, endpoint = response.url) {
  const text = await response.text().catch(() => "");
  const body = parseJsonBody(text, response.headers.get("content-type"), fallback, endpoint, true) as { error?: string } | undefined;
  return body?.error ? `${fallback}: ${body.error}` : `${fallback}: ${response.status}`;
}

function parseJsonBody(text: string, contentType: string | null, fallback: string, endpoint: string, allowInvalid = false) {
  if (!text.trim()) {
    if (allowInvalid) return undefined;
    throw new Error(`${fallback}: empty response from ${endpoint}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (allowInvalid) return undefined;

    const received = contentType?.split(";")[0] || "non-JSON";
    const preview = text.trim().slice(0, 80);
    const hint = preview.startsWith("<!DOCTYPE") || received === "text/html"
      ? " The API route may be unavailable or routed to the frontend app."
      : "";
    throw new Error(`${fallback}: expected JSON from ${endpoint}, received ${received}.${hint}`);
  }
}

function isErrorResponse(value: unknown): value is { error: string } {
  return value !== null && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string";
}
