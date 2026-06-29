import { createApp } from "./app";

type VercelRequest = {
  url?: string;
};

type VercelResponse = unknown;
type ExpressHandler = (request: unknown, response: unknown) => unknown;

const app = createApp() as ExpressHandler;

export function createVercelHandler(routePath: string) {
  return function vercelHandler(request: VercelRequest, response: VercelResponse) {
    request.url = normalizeServerlessUrl(request.url, routePath);
    return app(request, response);
  };
}

function normalizeServerlessUrl(url: string | undefined, routePath: string) {
  if (!url || url === "/") return routePath;
  if (url.startsWith("/?")) return `${routePath}${url.slice(1)}`;
  if (url === routePath || url.startsWith(`${routePath}/`) || url.startsWith(`${routePath}?`)) return url;
  if (!url.startsWith("/api")) return `${routePath}${url.startsWith("/") ? url : `/${url}`}`;
  return url;
}
