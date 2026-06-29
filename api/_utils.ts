import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};

export type ApiResponse = ServerResponse;

export function sendJson(response: ApiResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function sendMethodNotAllowed(response: ApiResponse, methods: string[]) {
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { error: `Method not allowed. Use ${methods.join(" or ")}.` });
}

export async function readJsonBody(request: ApiRequest) {
  if (request.body !== undefined) {
    return typeof request.body === "string" ? parseJson(request.body) : request.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? parseJson(rawBody) : {};
}

export function getQuery(request: ApiRequest) {
  const url = new URL(request.url ?? "/", "https://retail-experience-agent.local");
  return url.searchParams;
}

export function getQueryValue(searchParams: URLSearchParams, name: string) {
  return searchParams.get(name) ?? undefined;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
