# Brand Experience Agent

Production-ready scaffold for a retail Brand Experience Agent built around the OpenAI Responses API, file search, vector stores, function calling, React, Node.js, TypeScript, Tailwind CSS, PostgreSQL, and an analytics dashboard.

The app runs in demo mode without credentials. Add `OPENAI_API_KEY` and `OPENAI_VECTOR_STORE_ID` to use the live OpenAI workflow.

## OpenAI Framework Alignment

- Uses the Responses API for new agentic interactions, matching OpenAI guidance that Responses is recommended for new projects and supports tools, stateful context, and multimodal inputs: [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses).
- Uses hosted `file_search` with vector stores for brand, FAQ, campaign, and policy retrieval: [File search guide](https://developers.openai.com/api/docs/guides/tools-file-search).
- Implements JSON-schema function tools and feeds `function_call_output` items back into the Responses API loop: [Function calling guide](https://developers.openai.com/api/docs/guides/function-calling).
- Defaults to `gpt-5.5`, OpenAI's current frontier model for complex professional work at the time this scaffold was created: [GPT-5.5 model page](https://developers.openai.com/api/docs/models/gpt-5.5).

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open the client at `http://127.0.0.1:5173`. The API listens at `http://127.0.0.1:8787`.

## Live OpenAI Setup

```bash
cp .env.example .env
# add OPENAI_API_KEY
npm run ingest
# copy the printed OPENAI_VECTOR_STORE_ID into .env
npm run dev
```

Knowledge files live in `data/knowledge`. Product catalog data lives in `data/catalog/products.json`.

## PostgreSQL

Create the database and apply the schema:

```bash
createdb brand_experience
npm run db:schema
```

If `DATABASE_URL` is not set, the API uses an in-memory telemetry repository for local demos.

## Google Analytics 4 Integration

The Conversion / Funnel Agent can forward server-side events to GA4 through Measurement Protocol. The Analytics Agent can optionally read GA4 report counts through the GA4 Data API.

Add these values to `.env`:

```bash
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your_measurement_protocol_secret

# Optional reporting readback
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Use `GA4_SERVICE_ACCOUNT_JSON` instead of `GA4_CLIENT_EMAIL` and `GA4_PRIVATE_KEY` if you prefer to paste the whole service-account JSON. Give the service account Viewer access to the GA4 property.

When configured, `/api/admin/events` still records local telemetry, and the server also forwards events such as `preference_selected`, `product_impression`, `cross_sell_shown`, `upsell_shown`, `cart_add`, and `checkout_started` to GA4. The dashboard shows `Local + GA4` when GA4 reporting is enabled.

Forwarded GA4 events include:

- `preference_selected`
- `product_impression`
- `product_viewed`
- `product_selected`
- `recommendations_returned`
- `intent_detected`
- `governance_review`
- `cross_sell_shown`
- `upsell_shown`
- `product_3d_view`
- `product_3d_selected`
- `product_customized`
- `add_to_cart` from local `cart_add`
- `begin_checkout` from local `checkout_started`
- `purchase_completed`
- `lead_created`

The Measurement Protocol API secret stays on the server. The browser sends local analytics to `/api/admin/events`, and the API forwards the event to GA4 with product item details and safe retail parameters such as preference, budget, loyalty tier, purchase intent, source, categories, governance status, and 3D customization choices.

## Product 3D Models

The product viewer supports real product-specific 3D assets. For the demo, only two products show the 3D icon:

- `prod_terra_grip`
- `prod_trailform_jacket`

Upload `.glb` or `.gltf` files into `public/models/products/` using the product id as the filename:

```text
public/models/products/prod_terra_grip.glb
public/models/products/prod_trailform_jacket.glb
```

When a configured file exists, the Three.js viewer loads that exact asset. When it is missing, the app falls back to a generated model based on product category. See `docs/demo-product-assets.md` for the full product/image upload checklist.

## Commands

```bash
npm run dev       # API and React client
npm run build     # Typecheck and frontend build
npm start         # Serve the production build from the Express API
npm run test      # Unit tests
npm run ingest    # Upload knowledge files to OpenAI vector stores
npm run evals     # Run retail agent evaluation cases
```

## Deployment

This project deploys as a single Node.js service. `npm run build` creates the React frontend in `dist/client` and bundles the Express API in `dist/server`. `npm start` serves both the API and the built frontend from one host.

Use these platform settings:

```text
Build command: npm ci && npm run build
Start command: npm start
Node version: 22.x
```

Set production environment variables in the hosting platform, not in Git. At minimum, set `OPENAI_API_KEY`; add `OPENAI_VECTOR_STORE_ID`, `DATABASE_URL`, and the `GA4_*` variables when those live integrations are enabled. See `docs/deployment.md` for the full checklist.

## Project Structure

- `src/server/agent` - Responses API orchestration, demo fallback, guardrails, citations.
- `src/server/tools` - Function tool schemas and handlers.
- `src/server/routes` - Express API routes.
- `src/client` - React associate workspace and analytics dashboard.
- `db/schema.sql` - PostgreSQL schema.
- `data/knowledge` - Approved brand and policy content for vector ingestion.
- `docs` - Architecture, security, rollout, and system design.
