/**
 * TypeScript Type Definitions for Mini-n8n Application
 *
 * All runtime data lives exclusively in PostgreSQL via Hasura.
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
