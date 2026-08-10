-- Schema Migration for AI Agent Workflow Builder
-- Hasura + PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create auth schema if not exists (Nhost compatibility)
CREATE SCHEMA IF NOT EXISTS auth;

-- Auth users table (Nhost compatible)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Public Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  calls_used INT DEFAULT 0 NOT NULL,
  max_calls_allowed INT DEFAULT 50 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Organization Members (Layer 1 Scoping)
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_org_user UNIQUE (org_id, user_id)
);

-- Workflows
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workflow Steps
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
  config JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workflow Triggers
CREATE TABLE IF NOT EXISTS public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'webhook', 'scheduled', 'db_event')),
  config JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workflow Runs
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT DEFAULT 'manual' NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  current_step_index INT DEFAULT 0 NOT NULL,
  context_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Step Runs
CREATE TABLE IF NOT EXISTS public.step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  step_order INT NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  input JSONB DEFAULT '{}'::jsonb NOT NULL,
  output JSONB DEFAULT '{}'::jsonb NOT NULL,
  error TEXT,
  attempt_count INT DEFAULT 1 NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Custom Data Records (Target for db_write steps & watching for db_event triggers)
CREATE TABLE IF NOT EXISTS public.data_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- View: Org Usage & Analytics Aggregation
CREATE OR REPLACE VIEW public.org_usage_summary AS
SELECT 
  o.id AS org_id,
  o.name AS org_name,
  o.calls_used,
  o.max_calls_allowed,
  ROUND((o.calls_used::numeric / NULLIF(o.max_calls_allowed, 0)::numeric) * 100, 1) AS quota_percentage_used,
  COUNT(DISTINCT w.id) AS total_workflows,
  COUNT(DISTINCT r.id) AS total_runs,
  COALESCE(AVG(EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) * 1000) FILTER (WHERE r.status = 'completed'), 0)::INT AS avg_run_duration_ms
FROM public.organizations o
LEFT JOIN public.workflows w ON w.org_id = o.id
LEFT JOIN public.workflow_runs r ON r.workflow_id = w.id
GROUP BY o.id, o.name, o.calls_used, o.max_calls_allowed;

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
  ('aaaaa-11111-org-a', 'Acme AI Corp (Org A)', 12, 50),
  ('bbbbb-22222-org-b', 'Beta Dynamics (Org B)', 2, 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role) VALUES
  ('mem-1', 'aaaaa-11111-org-a', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('mem-2', 'aaaaa-11111-org-a', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('mem-3', 'aaaaa-11111-org-a', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('mem-4', 'bbbbb-22222-org-b', '44444444-4444-4444-4444-444444444444', 'owner'),
  ('mem-5', 'bbbbb-22222-org-b', '55555555-5555-5555-5555-555555555555', 'editor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflows (id, org_id, name, description, is_active, created_by) VALUES
  ('wf-org-a-multistep-scenario', 'aaaaa-11111-org-a', 'Multi-Step Enterprise AI Pipeline', 'Automated customer ticket classification, API lookup, approval gate, and DB persistence', true, '11111111-1111-1111-1111-111111111111'),
  ('wf-org-b-marketing', 'bbbbb-22222-org-b', 'Marketing Lead Scraper', 'Extracts and classifies marketing leads for Beta Dynamics', true, '44444444-4444-4444-4444-444444444444')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_steps (id, workflow_id, step_order, name, type, config) VALUES
  ('st-1', 'wf-org-a-multistep-scenario', 1, 'LLM Customer Sentiment Analysis', 'llm_call', '{"prompt": "Analyze customer ticket sentiment", "model": "gemini-2.5-flash"}'::jsonb),
  ('st-2', 'wf-org-a-multistep-scenario', 2, 'HTTP CRM Lead Status Verification', 'http_request', '{"endpoint": "https://httpbin.org/post", "method": "POST"}'::jsonb),
  ('st-3', 'wf-org-a-multistep-scenario', 3, 'Conditional Branch on Positive Sentiment', 'conditional_branch', '{"condition_field": "step1.sentiment", "expected_value": "positive"}'::jsonb),
  ('st-4', 'wf-org-a-multistep-scenario', 4, 'Executive Approval Gate', 'approval_gate', '{"message": "High-value lead detected. Requires explicit executive approval.", "required_role": "editor"}'::jsonb),
  ('st-5', 'wf-org-a-multistep-scenario', 5, 'Write Verified Lead to Production Database', 'db_write', '{"table": "data_records", "fields": ["title", "payload"]}'::jsonb),
  ('st-6', 'wf-org-a-multistep-scenario', 6, 'Slack / Email Executive Notification', 'notify', '{"channel": "leadership-alerts", "template": "Lead processed successfully"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
