CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  name TEXT,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  loyalty_tier TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  journey_stage TEXT NOT NULL DEFAULT 'awareness',
  intent TEXT NOT NULL DEFAULT 'unknown',
  response_id TEXT,
  guardrail_flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_product_ids TEXT[] NOT NULL DEFAULT '{}',
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intent_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  intent TEXT NOT NULL,
  journey_stage TEXT NOT NULL,
  confidence NUMERIC(4, 3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS function_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unanswered_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  openai_file_id TEXT,
  vector_store_id TEXT,
  title TEXT NOT NULL,
  source_path TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model TEXT NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
