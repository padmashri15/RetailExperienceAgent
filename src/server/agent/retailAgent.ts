import OpenAI from "openai";
import type { ChatRequest, ChatResponse, ConversationMessage } from "../../shared/types";
import { env, isLiveOpenAIConfigured } from "../config/env";
import type { TelemetryRepository } from "../db/repository";
import { buildOpenAITools } from "../tools/definitions";
import { collectProductsFromToolResults, executeToolCall } from "../tools/handlers";
import { extractCitations } from "./citations";
import { runDemoAgent } from "./demoAgent";
import { searchCatalog } from "../services/catalog";
import { buildMerchandisingSuggestions } from "../services/merchandising";
import { buildAgentInstructions, evaluateBrandGovernance, getGuardrailFlags, inferIntent, inferJourneyStage } from "./policy";

type ResponseLike = {
  id?: string;
  output_text?: string;
  output?: Array<Record<string, unknown>>;
};

export async function runRetailAgent(request: ChatRequest, repository: TelemetryRepository): Promise<ChatResponse> {
  if (!isLiveOpenAIConfigured()) {
    return runDemoAgent(request, repository);
  }

  try {
    return await runLiveRetailAgent(request, repository);
  } catch (error) {
    const message = formatAgentError(error);

    if (env.openaiFallbackToDemo) {
      console.warn(`[RetailAgent] Live OpenAI request failed; falling back to demo agent: ${message}`);
      return runDemoAgent(request, repository);
    }

    console.error(`[RetailAgent] Live OpenAI request failed: ${message}`);
    throw new Error(`Live OpenAI request failed: ${message}`);
  }
}

async function runLiveRetailAgent(request: ChatRequest, repository: TelemetryRepository): Promise<ChatResponse> {
  const started = Date.now();
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const guardrailFlags = getGuardrailFlags(request.message);
  const inferredIntent = inferIntent(request.message);
  const inferredStage = inferJourneyStage(request.message, request.customerProfile);
  const tools = buildOpenAITools();
  const input: Array<Record<string, unknown>> = buildInput(request);
  const toolResults: unknown[] = [];

  let response = (await client.responses.create({
    model: env.openaiModel,
    instructions: buildAgentInstructions(request.customerProfile),
    input,
    tools,
    include: env.openaiVectorStoreId ? ["file_search_call.results"] : undefined,
    store: true
  } as never)) as unknown as ResponseLike;

  input.push(...(response.output ?? []));

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const output = response.output ?? [];
    const functionCalls = output.filter((item) => item.type === "function_call");

    if (!functionCalls.length) {
      break;
    }

    for (const item of functionCalls) {
      const name = String(item.name ?? "");
      const args = parseArguments(item.arguments);
      const result = await executeToolCall(name, args, {
        conversationId: request.conversationId,
        customerId: request.customerProfile?.id,
        repository
      });

      toolResults.push(result);
      input.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(result)
      });
    }

    response = (await client.responses.create({
      model: env.openaiModel,
      instructions: buildAgentInstructions(request.customerProfile),
      input,
      tools,
      include: env.openaiVectorStoreId ? ["file_search_call.results"] : undefined,
      store: true
    } as never)) as unknown as ResponseLike;
    input.push(...(response.output ?? []));
  }

  const answer =
    response.output_text ??
    "I found relevant product and policy context, but I need a human associate to review the final response.";
  const recommendedProducts = await resolveRecommendedProducts(request, toolResults);
  const merchandising = await buildMerchandisingSuggestions(recommendedProducts);
  const citations = extractCitations(response);
  const governance = evaluateBrandGovernance({
    message: request.message,
    answer,
    citations,
    guardrailFlags,
    recommendedProductCount: recommendedProducts.length
  });
  const latencyMs = Date.now() - started;
  const responseId = response.id;

  const conversationId = await repository.saveConversationTurn({
    conversationId: request.conversationId,
    customerId: request.customerProfile?.id,
    customerName: request.customerProfile?.name,
    userMessage: request.message,
    assistantMessage: answer,
    intent: inferredIntent,
    journeyStage: inferredStage,
    responseId,
    guardrailFlags,
    citations,
    recommendedProductIds: recommendedProducts.map((product) => product.id),
    merchandising,
    governance,
    latencyMs
  });

  return {
    conversationId,
    responseId,
    answer,
    intent: inferredIntent,
    journeyStage: inferredStage,
    recommendedProducts,
    merchandising,
    citations,
    guardrailFlags,
    governance,
    latencyMs,
    mode: "live_openai"
  };
}

function formatAgentError(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const code = cause?.code ?? (error as { code?: string }).code;
    const causeMessage = cause?.message;
    const message = code && !error.message.includes(code) ? `${error.message} (${code})` : error.message;

    if (code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
      return `${message}. Node cannot verify the enterprise TLS certificate for api.openai.com. Prefer NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem; for a local hackathon demo only, set OPENAI_ALLOW_INSECURE_TLS=true.`;
    }

    if (code === "ENOTFOUND") {
      return `${message}. Node could not resolve api.openai.com. Check DNS, VPN, proxy, or run the server outside the restricted sandbox.`;
    }

    return causeMessage && causeMessage !== error.message ? `${message}: ${causeMessage}` : message;
  }

  return "Unknown agent error";
}

async function resolveRecommendedProducts(request: ChatRequest, toolResults: unknown[]) {
  const toolProducts = collectProductsFromToolResults(toolResults).slice(0, 4);
  if (toolProducts.length) return toolProducts;

  if (inferIntent(request.message).startsWith("product") || request.customerProfile?.preferences?.length) {
    return searchCatalog({
      query: request.message,
      maxPrice: request.customerProfile?.budget,
      tags: request.customerProfile?.preferences,
      strictBudget: false,
      limit: 4
    });
  }

  return [];
}

function buildInput(request: ChatRequest): Array<Record<string, unknown>> {
  const history = (request.history ?? []).slice(-8).map(toResponseMessage);
  const customerContext = {
    customerProfile: request.customerProfile ?? {},
    currentMessage: request.message
  };

  return [
    ...history,
    {
      role: "user",
      content: `Customer context and message:\n${JSON.stringify(customerContext, null, 2)}`
    }
  ];
}

function toResponseMessage(message: ConversationMessage) {
  return {
    role: message.role,
    content: message.content
  };
}

function parseArguments(argumentsValue: unknown): Record<string, unknown> {
  if (typeof argumentsValue !== "string") {
    return {};
  }

  try {
    return JSON.parse(argumentsValue) as Record<string, unknown>;
  } catch {
    return {};
  }
}
