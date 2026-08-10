-- Schema definition for Mini-n8n PostgreSQL Database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS auth;

-- Custom Auth Users Table (Simulating Nhost / Supabase Auth)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Multi-Tenant Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  calls_used INT NOT NULL DEFAULT 0,
  max_calls_allowed INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Memberships (Junction Table for Row-Level Security)
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Workflows Table
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow Steps Table (Sequential Steps)
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, step_order)
);

-- Workflow Triggers Table (Manual, Webhook, Schedule, DB Event)
CREATE TABLE IF NOT EXISTS public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'webhook', 'scheduled', 'db_event')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow Execution Runs Table
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES auth.users(id),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')) DEFAULT 'pending',
  current_step_index INT NOT NULL DEFAULT 0,
  context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step Runs Table (Individual Step Execution Logs)
CREATE TABLE IF NOT EXISTS public.step_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')) DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data Records Table (Target table for db_write step type)
CREATE TABLE IF NOT EXISTS public.data_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Computed Field Helper Function for Hasura Computed Fields
CREATE OR REPLACE FUNCTION public.org_usage_summary(o public.organizations)
RETURNS JSONB AS $$
  SELECT json_build_object(
    'calls_used', o.calls_used,
    'max_calls_allowed', o.max_calls_allowed,
    'remaining_calls', GREATEST(0, o.max_calls_allowed - o.calls_used),
    'quota_exceeded', (o.calls_used >= o.max_calls_allowed)
  )::jsonb;
$$ LANGUAGE sql STABLE;

-- Indexes for performance & rapid permissions checking
CREATE INDEX IF NOT EXISTS idx_org_members_user_org ON public.org_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_org ON public.workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON public.workflow_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_run ON public.step_runs(workflow_run_id);

-- Initial Seed Data for Instant Out-of-the-Box Demo
INSERT INTO auth.users (id, email, display_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@acme.com', 'Alice (Org A Owner)'),
  ('22222222-2222-2222-2222-222222222222', 'bob@acme.com', 'Bob (Org A Editor)'),
  ('33333333-3333-3333-3333-333333333333', 'charlie@acme.com', 'Charlie (Org A Viewer)'),
  ('44444444-4444-4444-4444-444444444444', 'david@beta.com', 'David (Org B Owner)'),
  ('55555555-5555-5555-5555-555555555555', 'eva@beta.com', 'Eva (Org B Editor)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, calls_used, max_calls_allowed) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Acme AI Corp (Org A)', 12, 50),
  ('b0000000-0000-0000-0000-000000000002', 'Beta Dynamics (Org B)', 2, 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('f0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'owner'),
  ('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'editor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflows (id, org_id, name, description, is_active, created_by) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Multi-Step Enterprise AI Pipeline', 'Automated customer ticket classification, API lookup, approval gate, and DB persistence', true, '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Marketing Lead Scraper', 'Extracts and classifies marketing leads for Beta Dynamics', true, '44444444-4444-4444-4444-444444444444')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_steps (id, workflow_id, step_order, name, type, config) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 'LLM Customer Sentiment Analysis', 'llm_call', '{"prompt": "Analyze customer ticket sentiment", "model": "gemini-2.5-flash"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2, 'HTTP CRM Lead Status Verification', 'http_request', '{"endpoint": "https://httpbin.org/post", "method": "POST"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 3, 'Conditional Branch on Positive Sentiment', 'conditional_branch', '{"condition_field": "step1.sentiment", "expected_value": "positive"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 4, 'Executive Approval Gate', 'approval_gate', '{"message": "High-value lead detected. Requires explicit executive approval.", "required_role": "editor"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 5, 'Write Verified Lead to Production Database', 'db_write', '{"table": "data_records", "fields": ["title", "payload"]}'::jsonb),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 6, 'Slack / Email Executive Notification', 'notify', '{"channel": "leadership-alerts", "template": "Lead processed successfully"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_triggers (id, workflow_id, trigger_type, config) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'manual', '{}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'manual', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
