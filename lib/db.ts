/**
 * Type Definitions & Seed Constants
 *
 * This file exports TypeScript interfaces used across the application
 * and seed data constants used by the frontend user/org context switcher.
 *
 * IMPORTANT: This file does NOT contain any runtime data store.
 * All runtime data lives in PostgreSQL, accessed via the Hasura
 * GraphQL Engine (see lib/hasuraAdmin.ts).
 */

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface Organization {
  id: string;
  name: string;
  calls_used: number;
  max_calls_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: Record<string, any>;
  created_at: string;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  trigger_type: 'manual' | 'webhook' | 'scheduled' | 'db_event';
  config: Record<string, any>;
  created_at: string;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  triggered_by_user_id: string | null;
  trigger_type: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  current_step_index: number;
  context_data: Record<string, any>;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  step_order: number;
  step_name: string;
  step_type: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  input: Record<string, any>;
  output: Record<string, any>;
  error?: string | null;
  attempt_count: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataRecord {
  id: string;
  org_id: string;
  title: string;
  payload: Record<string, any>;
  created_at: string;
}

// --- Seed Constants ---
export const SEED_USERS: User[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'alice@acme.com', display_name: 'Alice (Org A Owner)' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'bob@acme.com', display_name: 'Bob (Org A Editor)' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'charlie@acme.com', display_name: 'Charlie (Org A Viewer)' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'david@beta.com', display_name: 'David (Org B Owner)' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'eva@beta.com', display_name: 'Eva (Org B Editor)' },
];

export const SEED_ORGS: Organization[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Acme AI Corp (Org A)',
    calls_used: 12,
    max_calls_allowed: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Beta Dynamics (Org B)',
    calls_used: 2,
    max_calls_allowed: 20,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_MEMBERS: OrgMember[] = [
  { id: 'f0000000-0000-0000-0000-000000000001', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '11111111-1111-1111-1111-111111111111', role: 'owner', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000002', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '22222222-2222-2222-2222-222222222222', role: 'editor', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000003', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '33333333-3333-3333-3333-333333333333', role: 'viewer', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000004', org_id: 'b0000000-0000-0000-0000-000000000002', user_id: '44444444-4444-4444-4444-444444444444', role: 'owner', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000005', org_id: 'b0000000-0000-0000-0000-000000000002', user_id: '55555555-5555-5555-5555-555555555555', role: 'editor', created_at: new Date().toISOString() },
];
