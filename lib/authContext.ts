import { db, OrgMember, User, Organization } from './db';

export interface HasuraHeaders {
  'x-hasura-user-id': string;
  'x-hasura-role': 'owner' | 'editor' | 'viewer';
  'x-hasura-org-id': string;
}

export interface AuthContext {
  user: User;
  org: Organization;
  member: OrgMember;
  headers: HasuraHeaders;
}

export function getAuthContextFromHeaders(headersObj: Record<string, string | string[] | undefined>): AuthContext | null {
  const userId = (headersObj['x-hasura-user-id'] || headersObj['x-user-id']) as string;
  const orgId = (headersObj['x-hasura-org-id'] || headersObj['x-org-id']) as string;
  const roleHeader = (headersObj['x-hasura-role'] || headersObj['x-role']) as string;

  if (!userId || !orgId) {
    return null;
  }

  const user = db.users.find((u) => u.id === userId);
  const org = db.orgs.find((o) => o.id === orgId);
  const member = db.getOrgMember(userId, orgId);

  if (!user || !org || !member) {
    return null;
  }

  const role = (roleHeader as 'owner' | 'editor' | 'viewer') || member.role;

  return {
    user,
    org,
    member,
    headers: {
      'x-hasura-user-id': user.id,
      'x-hasura-role': role,
      'x-hasura-org-id': org.id,
    },
  };
}

// Layer 1 Org Scoping Check: Verifies user belongs to workflow's organization
export function verifyWorkflowOrgAccess(userId: string, workflowId: string): { allowed: boolean; role?: string; workflow?: any; error?: string } {
  const workflow = db.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    return { allowed: false, error: 'Workflow not found' };
  }

  const member = db.getOrgMember(userId, workflow.org_id);
  if (!member) {
    return { allowed: false, error: '403 Forbidden: User does not belong to workflow organization (Cross-Org Access Blocked)' };
  }

  return { allowed: true, role: member.role, workflow };
}

// Layer 2 Step-Level Gating Check: Verifies user role for adding sensitive steps (db_write, webhook, notify)
export function verifyStepCreationPermission(userId: string, orgId: string, stepType: string): { allowed: boolean; error?: string } {
  const member = db.getOrgMember(userId, orgId);
  if (!member) {
    return { allowed: false, error: '403 Forbidden: User not in org' };
  }

  const sensitiveStepTypes = ['db_write', 'webhook', 'notify'];
  if (sensitiveStepTypes.includes(stepType) && member.role !== 'owner') {
    return {
      allowed: false,
      error: `403 Permission Denied: Only organization owners can add or configure sensitive step types (${stepType}).`,
    };
  }

  return { allowed: true };
}
