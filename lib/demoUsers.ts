/**
 * Demo User & Initial Workflow Definitions
 *
 * Provides static metadata (IDs, users, orgs, and fallback workflows)
 * for seamless rendering both locally and in cloud preview deployments (Vercel).
 */

import { User, Organization, OrgMember, Workflow } from './types';

export const DEMO_USERS: User[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'alice@acme.com', display_name: 'Alice (Org A Owner)' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'bob@acme.com', display_name: 'Bob (Org A Editor)' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'charlie@acme.com', display_name: 'Charlie (Org A Viewer)' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'david@beta.com', display_name: 'David (Org B Owner)' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'eva@beta.com', display_name: 'Eva (Org B Editor)' },
];

export const DEMO_ORGS: Organization[] = [
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

export const DEMO_MEMBERS: OrgMember[] = [
  { id: 'f0000000-0000-0000-0000-000000000001', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '11111111-1111-1111-1111-111111111111', role: 'owner', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000002', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '22222222-2222-2222-2222-222222222222', role: 'editor', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000003', org_id: 'a0000000-0000-0000-0000-000000000001', user_id: '33333333-3333-3333-3333-333333333333', role: 'viewer', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000004', org_id: 'b0000000-0000-0000-0000-000000000002', user_id: '44444444-4444-4444-4444-444444444444', role: 'owner', created_at: new Date().toISOString() },
  { id: 'f0000000-0000-0000-0000-000000000005', org_id: 'b0000000-0000-0000-0000-000000000002', user_id: '55555555-5555-5555-5555-555555555555', role: 'editor', created_at: new Date().toISOString() },
];

export const DEMO_WORKFLOWS: Record<string, Workflow[]> = {
  'a0000000-0000-0000-0000-000000000001': [
    {
      id: 'c0000000-0000-0000-0000-000000000001',
      org_id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Multi-Step Enterprise AI Pipeline',
      description: 'Autonomous AI workflow with LLM sentiment analysis, external CRM HTTP check, conditional branching, human approval gate, and DB write.',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: [
        { id: 's1', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 1, name: 'LLM Customer Sentiment Analysis', type: 'llm_call', config: { prompt: 'Analyze sentiment: "We love this product!"' }, created_at: new Date().toISOString() },
        { id: 's2', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 2, name: 'HTTP CRM Lead Status Verification', type: 'http_request', config: { url: 'https://httpbin.org/post', method: 'POST' }, created_at: new Date().toISOString() },
        { id: 's3', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 3, name: 'Conditional Branch on Positive Sentiment', type: 'conditional_branch', config: { condition: "{{step1.sentiment}} == 'positive'" }, created_at: new Date().toISOString() },
        { id: 's4', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 4, name: 'Executive Approval Gate', type: 'approval_gate', config: { required_role: 'owner' }, created_at: new Date().toISOString() },
        { id: 's5', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 5, name: 'Write Verified Lead to Production Database', type: 'db_write', config: { table: 'data_records' }, created_at: new Date().toISOString() },
        { id: 's6', workflow_id: 'c0000000-0000-0000-0000-000000000001', step_order: 6, name: 'Slack / Email Executive Notification', type: 'notify', config: { channel: 'slack' }, created_at: new Date().toISOString() },
      ],
      triggers: [
        { id: 't1', workflow_id: 'c0000000-0000-0000-0000-000000000001', trigger_type: 'manual', config: {}, created_at: new Date().toISOString() }
      ]
    }
  ],
  'b0000000-0000-0000-0000-000000000002': [
    {
      id: 'c0000000-0000-0000-0000-000000000002',
      org_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Marketing Lead Scraper',
      description: 'Scrapes targeted marketing leads and processes them with LLM.',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: [
        { id: 'sb1', workflow_id: 'c0000000-0000-0000-0000-000000000002', step_order: 1, name: 'HTTP Scrape Target Website', type: 'http_request', config: { url: 'https://httpbin.org/get', method: 'GET' }, created_at: new Date().toISOString() },
        { id: 'sb2', workflow_id: 'c0000000-0000-0000-0000-000000000002', step_order: 2, name: 'Extract Lead Profiles with LLM', type: 'llm_call', config: { prompt: 'Extract emails and names' }, created_at: new Date().toISOString() },
      ],
      triggers: [
        { id: 'tb1', workflow_id: 'c0000000-0000-0000-0000-000000000002', trigger_type: 'manual', config: {}, created_at: new Date().toISOString() }
      ]
    }
  ]
};
