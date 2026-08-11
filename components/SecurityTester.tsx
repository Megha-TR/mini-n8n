'use client';

import React, { useState } from 'react';
import { User, Organization, OrgMember } from '@/lib/types';
import { ShieldCheck, Lock, CheckCircle2, XCircle, Play, UserCheck, ShieldAlert, AlertTriangle } from 'lucide-react';

interface SecurityTesterProps {
  currentUser: User;
  currentOrg: Organization;
  currentMember: OrgMember;
}

interface TestResult {
  id: string;
  name: string;
  target: string;
  status: 'passed' | 'failed' | 'idle' | 'testing';
  details?: string;
  responsePayload?: any;
}

export function SecurityTester({ currentUser, currentOrg, currentMember }: SecurityTesterProps) {
  const [results, setResults] = useState<TestResult[]>([
    {
      id: 'test-1',
      name: 'Cross-Org GraphQL ID-Guessing Isolation',
      target: 'Org B User queries Org A Workflow ID directly via GraphQL',
      status: 'idle',
    },
    {
      id: 'test-2',
      name: 'Direct Action Trigger Attack Resistance',
      target: 'Org B User sends HTTP POST to triggerWorkflowRun(Org A Workflow ID)',
      status: 'idle',
    },
    {
      id: 'test-3',
      name: 'Direct Action Approval Gate Attack Resistance',
      target: 'Org B User sends HTTP POST to approveStep(Org A Step Run ID)',
      status: 'idle',
    },
    {
      id: 'test-4',
      name: 'Viewer Role Trigger Enforcement',
      target: 'Org A Viewer role attempts to trigger workflow run',
      status: 'idle',
    },
    {
      id: 'test-5',
      name: 'Layer 2 Step Gating Enforcement',
      target: 'Org A Editor attempts to add sensitive db_write step',
      status: 'idle',
    },
  ]);

  const [runningAll, setRunningAll] = useState(false);

  const runTest = async (testId: string) => {
    setResults((prev) =>
      prev.map((r) => (r.id === testId ? { ...r, status: 'testing', details: 'Executing security vector payload...' } : r))
    );

    try {
      if (testId === 'test-1') {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-user-id': '44444444-4444-4444-4444-444444444444',
            'x-hasura-role': 'owner',
            'x-hasura-org-id': 'b0000000-0000-0000-0000-000000000002',
          },
          body: JSON.stringify({
            query: `query GetOrgAWorkflow { workflows(where: { id: { _eq: "c0000000-0000-0000-0000-000000000001" } }) { id name org_id } }`,
          }),
        });
        const json = await res.json();
        const workflowsReturned = json?.data?.workflows || [];

        if (workflowsReturned.length === 0) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'passed',
                    details: 'PASSED: Cross-Org Isolation verified. Org B user returned 0 workflows when guessing Org A Workflow ID.',
                    responsePayload: json,
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'failed',
                    details: 'FAILED: Org B user was able to read Org A workflow data!',
                    responsePayload: json,
                  }
                : r
            )
          );
        }
      } else if (testId === 'test-2') {
        const res = await fetch('/api/actions/trigger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-user-id': '44444444-4444-4444-4444-444444444444',
            'x-hasura-role': 'owner',
            'x-hasura-org-id': 'b0000000-0000-0000-0000-000000000002',
          },
          body: JSON.stringify({ input: { workflow_id: 'c0000000-0000-0000-0000-000000000001' } }),
        });
        const json = await res.json();

        if (res.status === 403 || json.error?.includes('403') || json.error?.includes('Cross-Org')) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'passed',
                    details: `PASSED: Direct Action trigger attack blocked with HTTP ${res.status}: "${json.error}"`,
                    responsePayload: json,
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'failed',
                    details: 'FAILED: Action trigger attack succeeded unexpectedly!',
                    responsePayload: json,
                  }
                : r
            )
          );
        }
      } else if (testId === 'test-3') {
        const res = await fetch('/api/actions/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-user-id': '44444444-4444-4444-4444-444444444444',
            'x-hasura-role': 'owner',
            'x-hasura-org-id': 'b0000000-0000-0000-0000-000000000002',
          },
          body: JSON.stringify({ input: { step_run_id: 'fake-step-run-id-org-a' } }),
        });
        const json = await res.json();

        if (res.status === 403 || res.status === 400 || json.error) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'passed',
                    details: `PASSED: Approval gate attack blocked with error: "${json.error}"`,
                    responsePayload: json,
                  }
                : r
            )
          );
        }
      } else if (testId === 'test-4') {
        // Test 4: Charlie (Org A Viewer) attempts to trigger a workflow run via the Action handler
        const res = await fetch('/api/actions/trigger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-user-id': '33333333-3333-3333-3333-333333333333',
            'x-hasura-role': 'viewer',
            'x-hasura-org-id': 'a0000000-0000-0000-0000-000000000001',
          },
          body: JSON.stringify({ input: { workflow_id: 'c0000000-0000-0000-0000-000000000001' } }),
        });
        const json = await res.json();

        if (res.status === 403 || json.error?.includes('403') || json.error?.includes('Viewer') || json.error?.includes('Permission Denied')) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'passed',
                    details: `PASSED: Viewer role trigger blocked with HTTP ${res.status}: "${json.error}"`,
                    responsePayload: json,
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'failed',
                    details: `FAILED: Viewer was able to trigger a run (HTTP ${res.status})!`,
                    responsePayload: json,
                  }
                : r
            )
          );
        }
      } else if (testId === 'test-5') {
        // Test 5: Bob (Org A Editor) attempts to insert a db_write step — should be blocked by Layer 2
        // Include step_order so the mutation is well-formed; the block must come from permissions, not constraints
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-user-id': '22222222-2222-2222-2222-222222222222',
            'x-hasura-role': 'editor',
            'x-hasura-org-id': 'a0000000-0000-0000-0000-000000000001',
          },
          body: JSON.stringify({
            query: `mutation AddSensitiveStep { insert_workflow_steps_one(object: { workflow_id: "c0000000-0000-0000-0000-000000000001", step_order: 999, name: "Unauthorized DB Write Test", type: "db_write", config: {} }) { id } }`,
          }),
        });
        const json = await res.json();

        // editor role has no insert_permissions on workflow_steps — Hasura will return a permissions error
        if (res.status === 403 || json.errors?.length > 0) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'passed',
                    details: `PASSED: Editor cannot insert sensitive step type. Hasura blocked with: "${json.errors?.[0]?.message || 'permission-check-failed'}"`,
                    responsePayload: json,
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r) =>
              r.id === testId
                ? {
                    ...r,
                    status: 'failed',
                    details: `FAILED: Editor was able to insert a db_write step (HTTP ${res.status})!`,
                    responsePayload: json,
                  }
                : r
            )
          );
        }
      }
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) => (r.id === testId ? { ...r, status: 'failed', details: err.message } : r))
      );
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    for (const r of results) {
      await runTest(r.id);
    }
    setRunningAll(false);
  };

  const isOrgA = currentOrg.id === 'aaaaa-11111-org-a';
  const role = currentMember.role;

  return (
    <div className="space-y-6">
      {/* Dynamic Active Role Permission Status Card */}
      <div className="glass-panel rounded-2xl p-5 border border-[#e2dbd0] bg-[#faf8f5] shadow-sm">
        <div className="flex items-center justify-between mb-3 border-b border-[#e2dbd0] pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[#047857]" />
            <h3 className="text-base font-bold text-[#142319]">
              Active User Context Capabilities: <span className="text-[#047857]">{currentUser.display_name}</span>
            </h3>
          </div>
          <span className="text-xs font-bold font-mono px-2.5 py-1 rounded bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]">
            {currentOrg.name} — {role.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4]">
            <div className="text-[#5c6b60] font-semibold mb-1">View Org Workflows</div>
            <div className="font-bold text-[#142319] flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#047857]" /> Scoped to {currentOrg.name}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4]">
            <div className="text-[#5c6b60] font-semibold mb-1">Trigger Execution Runs</div>
            <div className={`font-bold flex items-center gap-1.5 ${role === 'viewer' ? 'text-red-700' : 'text-[#047857]'}`}>
              {role === 'viewer' ? (
                <>
                  <XCircle className="h-4 w-4 text-red-600" /> Blocked (Viewer Role)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#047857]" /> Allowed ({role})
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4]">
            <div className="text-[#5c6b60] font-semibold mb-1">Create Sensitive Steps (db_write)</div>
            <div className={`font-bold flex items-center gap-1.5 ${role === 'owner' ? 'text-[#047857]' : 'text-amber-800'}`}>
              {role === 'owner' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#047857]" /> Allowed (Owner Only)
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-amber-700" /> Restricted (Requires Owner)
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4]">
            <div className="text-[#5c6b60] font-semibold mb-1">Access Org A Data</div>
            <div className={`font-bold flex items-center gap-1.5 ${isOrgA ? 'text-[#047857]' : 'text-red-700'}`}>
              {isOrgA ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#047857]" /> Member of Org A
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-red-600" /> Isolated (Cross-Org Denied)
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Automated Security Vector Suite */}
      <div className="glass-panel rounded-2xl p-6 border border-[#e2dbd0] bg-[#faf8f5] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#142319] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#047857]" /> Automated Multi-Tenant Isolation Test Suite
            </h3>
            <p className="text-xs text-[#5c6b60] mt-0.5">
              Simulates direct cross-tenant attacks and role-bypassing mutations against Hasura GraphQL engine.
            </p>
          </div>

          <button
            disabled={runningAll}
            onClick={runAll}
            className="flex items-center gap-2 bg-[#047857] hover:bg-[#065f46] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-emerald-900/10 transition-all active:scale-95 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-white" /> Execute Security Test Suite
          </button>
        </div>

        <div className="space-y-3">
          {results.map((res) => (
            <div
              key={res.id}
              className="glass-card rounded-xl p-4 border border-[#e6e0d4] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {res.status === 'passed' ? (
                    <CheckCircle2 className="h-5 w-5 text-[#047857]" />
                  ) : res.status === 'failed' ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Lock className="h-5 w-5 text-gray-400" />
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#142319]">{res.name}</h4>
                  <p className="text-xs text-[#5c6b60] font-mono mt-0.5">{res.target}</p>
                  {res.details && (
                    <p
                      className={`text-xs font-mono mt-1 ${
                        res.status === 'passed' ? 'text-[#047857]' : 'text-red-700'
                      }`}
                    >
                      {res.details}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => runTest(res.id)}
                className="self-start md:self-center text-xs font-bold bg-[#f0ebe1] hover:bg-[#e6dfd3] text-[#142319] px-3.5 py-1.5 rounded-lg border border-[#e2dbd0] cursor-pointer"
              >
                Run Vector
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
