import { Router } from "express";
import { env } from "../config/env";

export function createIngestRouter() {
  const router = Router();

  router.get("/status", (_request, response) => {
    response.json({
      vectorStoreConfigured: Boolean(env.openaiVectorStoreId),
      vectorStoreId: env.openaiVectorStoreId ?? null,
      ingestionCommand: "npm run ingest"
    });
  });

  return router;
}
