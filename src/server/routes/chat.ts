import { Router } from "express";
import { validateChatRequest } from "../../shared/validation";
import type { TelemetryRepository } from "../db/repository";
import { runRetailAgent } from "../agent/retailAgent";

export function createChatRouter(repository: TelemetryRepository) {
  const router = Router();

  router.post("/", async (request, response, next) => {
    try {
      const validation = validateChatRequest(request.body);

      if (!validation.ok) {
        response.status(400).json({ error: validation.error });
        return;
      }

      const result = await runRetailAgent(validation.value, repository);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
