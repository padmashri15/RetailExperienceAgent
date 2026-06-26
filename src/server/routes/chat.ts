import { Router } from "express";
import type { ChatRequest } from "../../shared/types";
import type { TelemetryRepository } from "../db/repository";
import { runRetailAgent } from "../agent/retailAgent";

export function createChatRouter(repository: TelemetryRepository) {
  const router = Router();

  router.post("/", async (request, response, next) => {
    try {
      const body = request.body as ChatRequest;

      if (!body.message || typeof body.message !== "string") {
        response.status(400).json({ error: "message is required" });
        return;
      }

      const result = await runRetailAgent(body, repository);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
