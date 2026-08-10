/**
 * Auth Context Utilities
 *
 * Provides helpers for extracting and verifying user/org context
 * from Hasura session headers. All verification queries go through
 * the Hasura admin client to check the org_members table in Postgres.
 */

import { hasuraAdminQuery } from './hasuraAdmin';

export interface HasuraHeaders {
  'x-hasura-user-id': string;
  'x-hasura-role': 'owner' | 'editor' | 'viewer';
  'x-hasura-org-id': string;
}

// Verify that a user belongs to a given org by querying org_members in Postgres
export async function verifyOrgMembership(
  userId: string,
  orgId: string
): Promise<{ isMember: boolean; role?: string }> {
  try {
    const data = await hasuraAdminQuery<any>(
      `query CheckMembership($user_id: uuid!, $org_id: uuid!) {
        org_members(where: { user_id: { _eq: $user_id }, org_id: { _eq: $org_id } }) {
          id
          role
        }
      }`,
      { user_id: userId, org_id: orgId }
    );
    const members = data.org_members || [];
    if (members.length === 0) return { isMember: false };
    return { isMember: true, role: members[0].role };
  } catch {
    return { isMember: false };
  }
}

// Layer 2: Verify step creation permission — sensitive types restricted to owners
export async function verifyStepCreationPermission(
  userId: string,
  orgId: string,
  stepType: string
): Promise<{ allowed: boolean; error?: string }> {
  const membership = await verifyOrgMembership(userId, orgId);
  if (!membership.isMember) {
    return { allowed: false, error: '403 Forbidden: User not in org' };
  }

  const sensitiveStepTypes = ['db_write', 'webhook', 'notify'];
  if (sensitiveStepTypes.includes(stepType) && membership.role !== 'owner') {
    return {
      allowed: false,
      error: `403 Permission Denied: Only organization owners can add sensitive step types (${stepType}).`,
    };
  }

  return { allowed: true };
}
