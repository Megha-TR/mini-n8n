import { v4 as uuidv4 } from 'uuid';

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

// Seed Users
export const SEED_USERS: User[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'alice.owner@org-a.com', display_name: 'Alice (Org A Owner)' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'bob.editor@org-a.com', display_name: 'Bob (Org A Editor)' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'charlie.viewer@org-a.com', display_name: 'Charlie (Org A Viewer)' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'david.owner@org-b.com', display_name: 'David (Org B Owner)' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'eva.editor@org-b.com', display_name: 'Eva (Org B Editor)' },
];

// Seed Orgs
export const SEED_ORGS: Organization[] = [
  {
    id: 'aaaaa-11111-org-a',
    name: 'Acme AI Corp (Org A)',
    calls_used: 12,
    max_calls_allowed: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'bbbbb-22222-org-b',
    name: 'Beta Dynamics (Org B)',
    calls_used: 2,
    max_calls_allowed: 20,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Seed Org Memberships
export const SEED_MEMBERS: OrgMember[] = [
  { id: 'm1', org_id: 'aaaaa-11111-org-a', user_id: '11111111-1111-1111-1111-111111111111', role: 'owner', created_at: new Date().toISOString() },
  { id: 'm2', org_id: 'aaaaa-11111-org-a', user_id: '22222222-2222-2222-2222-222222222222', role: 'editor', created_at: new Date().toISOString() },
  { id: 'm3', org_id: 'aaaaa-11111-org-a', user_id: '33333333-3333-3333-3333-333333333333', role: 'viewer', created_at: new Date().toISOString() },
  { id: 'm4', org_id: 'bbbbb-22222-org-b', user_id: '44444444-4444-4444-4444-444444444444', role: 'owner', created_at: new Date().toISOString() },
  { id: 'm5', org_id: 'bbbbb-22222-org-b', user_id: '55555555-5555-5555-5555-555555555555', role: 'editor', created_at: new Date().toISOString() },
];

// Seed Workflows
const INITIAL_WORKFLOW_ID_A = 'wf-org-a-multistep-scenario';
const INITIAL_WORKFLOW_ID_B = 'wf-org-b-internal-pipeline';

export const SEED_WORKFLOWS: Workflow[] = [
  {
    id: INITIAL_WORKFLOW_ID_A,
    org_id: 'aaaaa-11111-org-a',
    name: 'Customer Support Lead Evaluator & Approval Pipeline',
    description: 'Chains LLM sentiment analysis, HTTP lead info lookup, conditional router, approval gate, and DB log.',
    is_active: true,
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: INITIAL_WORKFLOW_ID_B,
    org_id: 'bbbbb-22222-org-b',
    name: 'Org B Proprietary Data Ingestion Workflow',
    description: 'Confidential workflow belonging strictly to Org B.',
    is_active: true,
    created_by: '44444444-4444-4444-4444-444444444444',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_STEPS: WorkflowStep[] = [
  {
    id: 'step-a1',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 1,
    name: 'LLM Customer Sentiment Analysis',
    type: 'llm_call',
    config: {
      prompt: 'Analyze the following customer ticket and classify sentiment as "positive" or "negative" with a brief summary: "We are extremely thrilled with your AI Agent builder! The automation saved our team 20 hours this week."',
      model: 'gemini-2.5-flash',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'step-a2',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 2,
    name: 'HTTP CRM Lead Status Verification',
    type: 'http_request',
    config: {
      url: 'https://api.github.com/zen',
      method: 'GET',
      headers: { 'User-Agent': 'VocalLabs-AgentFlow' },
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'step-a3',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 3,
    name: 'Conditional Branch on Positive Sentiment',
    type: 'conditional_branch',
    config: {
      field: 'step1.sentiment',
      operator: 'equals',
      value: 'positive',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'step-a4',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 4,
    name: 'Executive Approval Gate',
    type: 'approval_gate',
    config: {
      required_role: 'editor',
      message: 'Requires owner/editor approval before publishing high-value customer lead data into production DB.',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'step-a5',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 5,
    name: 'Write Verified Lead to Production Database',
    type: 'db_write',
    config: {
      table: 'data_records',
      record_title: 'Approved High-Value Customer Lead',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'step-a6',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    step_order: 6,
    name: 'Slack Executive Notification Alert',
    type: 'notify',
    config: {
      channel: '#executive-alerts',
      message: 'Workflow successfully executed! Lead registered.',
    },
    created_at: new Date().toISOString(),
  },
];

export const SEED_TRIGGERS: WorkflowTrigger[] = [
  {
    id: 'trig-a1',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    trigger_type: 'manual',
    config: { label: 'Manual Run' },
    created_at: new Date().toISOString(),
  },
  {
    id: 'trig-a2',
    workflow_id: INITIAL_WORKFLOW_ID_A,
    trigger_type: 'webhook',
    config: { secret: 'wh_sec_org_a_98765' },
    created_at: new Date().toISOString(),
  },
];

// In-Memory Database Store (Global Singleton)
class DatabaseStore {
  public users: User[] = [...SEED_USERS];
  public orgs: Organization[] = [...SEED_ORGS];
  public members: OrgMember[] = [...SEED_MEMBERS];
  public workflows: Workflow[] = [...SEED_WORKFLOWS];
  public steps: WorkflowStep[] = [...SEED_STEPS];
  public triggers: WorkflowTrigger[] = [...SEED_TRIGGERS];
  public runs: WorkflowRun[] = [];
  public stepRuns: StepRun[] = [];
  public dataRecords: DataRecord[] = [];

  public getOrgMember(userId: string, orgId: string): OrgMember | undefined {
    return this.members.find((m) => m.user_id === userId && m.org_id === orgId);
  }

  public resetAll() {
    this.users = [...SEED_USERS];
    this.orgs = [...SEED_ORGS];
    this.members = [...SEED_MEMBERS];
    this.workflows = [...SEED_WORKFLOWS];
    this.steps = [...SEED_STEPS];
    this.triggers = [...SEED_TRIGGERS];
    this.runs = [];
    this.stepRuns = [];
    this.dataRecords = [];
  }
}

declare global {
  var dbStore: DatabaseStore | undefined;
}

export const db = globalThis.dbStore || new DatabaseStore();
if (process.env.NODE_ENV !== 'production') globalThis.dbStore = db;
