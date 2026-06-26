import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { createTelemetryRepository } from "./db/repository";
import { createAdminRouter } from "./routes/admin";
import { createCatalogRouter } from "./routes/catalog";
import { createChatRouter } from "./routes/chat";
import { createIngestRouter } from "./routes/ingest";
import { getGoogleAnalyticsStatus } from "./services/googleAnalytics";

type ServerAppOptions = {
  serveClient?: boolean;
};

export function createApp(options: ServerAppOptions = {}) {
  const { serveClient = false } = options;
  const app = express();
  const repository = createTelemetryRepository();
  const clientDistPath = path.resolve(process.cwd(), "dist/client");
  const indexHtmlPath = path.join(clientDistPath, "index.html");

  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get(["/health", "/api/health"], (_request, response) => {
    response.json({
      status: "ok",
      mode: env.openaiApiKey ? "live_openai" : "demo",
      model: env.openaiModel,
      vectorStoreConfigured: Boolean(env.openaiVectorStoreId),
      openai: {
        configured: Boolean(env.openaiApiKey),
        fallbackToDemo: env.openaiFallbackToDemo,
        insecureTlsAllowed: env.openaiAllowInsecureTls,
        extraCaCertsConfigured: env.nodeExtraCaCertsConfigured
      },
      googleAnalytics: getGoogleAnalyticsStatus()
    });
  });

  app.use(["/api/chat", "/chat"], createChatRouter(repository));
  app.use(["/api/admin", "/admin"], createAdminRouter(repository));
  app.use(["/api/products", "/products"], createCatalogRouter());
  app.use(["/api/ingest", "/ingest"], createIngestRouter());

  if (serveClient && existsSync(indexHtmlPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api") || request.path === "/health") {
        next();
        return;
      }

      response.sendFile(indexHtmlPath);
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown server error";
    response.status(500).json({ error: message });
  });

  return app;
}
