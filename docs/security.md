# Security Architecture

## Trust Boundaries

- Browser clients can request conversations and dashboard summaries but never receive OpenAI credentials.
- The Node.js API owns all OpenAI calls, tool execution, telemetry writes, and commerce integrations.
- PostgreSQL stores conversation telemetry and should be isolated on a private network in production.
- Vector stores contain approved brand and policy knowledge only.

## Controls

- Store `OPENAI_API_KEY`, `DATABASE_URL`, and integration credentials in a managed secret store.
- Validate all API inputs before tool execution.
- Keep tool handlers allowlisted by name.
- Log tool calls and conversion events for auditability.
- Use role-based access control before exposing admin analytics outside local development.
- Apply rate limits to `/api/chat`.
- Redact payment data, authentication tokens, and sensitive customer notes from logs.

## Brand and Compliance Guardrails

- Unsupported discounts, warranties, delivery promises, and claims are disallowed in the agent instructions.
- Sensitive requests are flagged for human escalation.
- File search should only contain approved content.
- Source citations are returned when retrieval supports the response.

## Data Retention

Production deployments should define retention windows for:

- Raw conversation transcripts
- Intent events
- Conversion events
- Evaluation outputs
- Vector store source documents

For strict retention programs, disable response storage where required and persist only approved telemetry fields.
