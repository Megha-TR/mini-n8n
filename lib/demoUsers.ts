/**
 * Demo User Profile Definitions
 *
 * Provides static metadata (IDs and labels) for demo context switching in the UI.
 * Real user records, org memberships, and roles are dynamically fetched & verified
 * from PostgreSQL via Hasura.
 */

import { User, Organization, OrgMember } from './types';

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
