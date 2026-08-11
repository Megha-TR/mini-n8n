'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User, Organization, OrgMember, Workflow, WorkflowStep, WorkflowTrigger, WorkflowRun, StepRun } from '@/lib/types';
import { DEMO_USERS as SEED_USERS, DEMO_ORGS as SEED_ORGS, DEMO_MEMBERS as SEED_MEMBERS } from '@/lib/demoUsers';
import { Navbar } from '@/components/Navbar';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { ExecutionDashboard } from '@/components/ExecutionDashboard';
import { SecurityTester } from '@/components/SecurityTester';
import { hasuraClient } from '@/lib/hasuraClient';
import { Layers, ShieldCheck, Play, Sparkles } from 'lucide-react';

export default function Home() {
  const [currentUserId, setCurrentUserId] = useState<string>(SEED_USERS[0].id);
  const [activeTab, setActiveTab] = useState<'builder' | 'execution' | 'security'>('builder');

  // Resolved Context State
  const currentUser: User = SEED_USERS.find((u) => u.id === currentUserId) || SEED_USERS[0];
  const currentMember: OrgMember = SEED_MEMBERS.find((m) => m.user_id === currentUserId) || SEED_MEMBERS[0];
  const currentOrg: Organization = SEED_ORGS.find((o) => o.id === currentMember.org_id) || SEED_ORGS[0];

  // Workflows & Active Run State
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);

  // Ref to track active run ID across poll renders
  const activeRunIdRef = useRef<string | null>(null);
  activeRunIdRef.current = activeRun?.id || null;

  // Reset active run state & authenticate whenever user context changes
  const handleUserSelect = async (newUserId: string) => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    setStepRuns([]);
    setSelectedWorkflow(null);
    setCurrentUserId(newUserId);

    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUserId }),
      });
    } catch (err) {
      console.error('Auth login failed:', err);
    }
  };

  // Authenticate initial user on mount
  useEffect(() => {
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId }),
    }).catch(console.error);
  }, []);

  // Load Data for Active User/Org Context
  const loadData = async (targetRunId?: string) => {
    try {
      const data = await hasuraClient.query(
        `
        query GetOrgWorkflows {
          workflows {
            id
            org_id
            name
            description
            is_active
            runs(limit: 1, order_by: { created_at: desc }) {
              id
              workflow_id
              status
              current_step_index
              created_at
            }
            steps {
              id
              workflow_id
              step_order
              name
              type
              config
            }
            triggers {
              id
              workflow_id
              trigger_type
              config
            }
          }
        }
      `,
        {},
        {
          'x-hasura-user-id': currentUser.id,
          'x-hasura-role': currentMember.role,
          'x-hasura-org-id': currentOrg.id,
        }
      );

      const wfList: Workflow[] = data?.workflows || [];
      setWorkflows(wfList);

      const activeWf = wfList[0] || null;
      setSelectedWorkflow(activeWf);

      if (activeWf) {
        setSteps(activeWf.steps || []);
        setTriggers(activeWf.triggers || []);

        // Use the most recent run from the runs array relationship
        const mostRecentRun = (activeWf as any).runs?.[0] || null;
        const effectiveRunId = targetRunId || mostRecentRun?.id || activeRunIdRef.current || null;

        if (effectiveRunId) {
          // Fetch Step Runs for effective run ID
          const srData = await hasuraClient.query(
            `
            query GetStepRuns($workflow_run_id: String!) {
              step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }) {
                id
                workflow_run_id
                step_id
                step_order
                step_name
                step_type
                status
                input
                output
                error
                approved_by
                created_at
              }
            }
          `,
            { workflow_run_id: effectiveRunId },
            {
              'x-hasura-user-id': currentUser.id,
              'x-hasura-role': currentMember.role,
              'x-hasura-org-id': currentOrg.id,
            }
          );

          const srList = srData?.step_runs || [];
          setStepRuns(srList);

          const currentRunObj = srData?.workflow_run || mostRecentRun || { id: effectiveRunId, status: 'running' };
          setActiveRun(currentRunObj);
        } else {
          setActiveRun(null);
          setStepRuns([]);
        }
      } else {
        setSteps([]);
        setTriggers([]);
        setActiveRun(null);
        setStepRuns([]);
      }
    } catch (e) {
      console.error('Data load error:', e);
    }
  };

  useEffect(() => {
    activeRunIdRef.current = null;
    setActiveRun(null);
    setStepRuns([]);
    loadData();
  }, [currentUserId, currentOrg.id]);

  // Live Polling Loop for Step State Updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeRunIdRef.current) {
        loadData(activeRunIdRef.current);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handler: Add Step
  const handleAddStep = async (type: string, name: string) => {
    try {
      await hasuraClient.mutate(
        `
        mutation CreateStep($type: String!, $name: String!, $workflow_id: String!) {
          createStep(type: $type, name: $name, workflow_id: $workflow_id) {
            id
          }
        }
      `,
        { type, name, workflow_id: selectedWorkflow?.id },
        {
          'x-hasura-user-id': currentUser.id,
          'x-hasura-role': currentMember.role,
          'x-hasura-org-id': currentOrg.id,
        }
      );
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add step');
    }
  };

  // Handler: Run Workflow
  const handleRunWorkflow = async () => {
    if (!selectedWorkflow) return;
    const res = await fetch('/api/actions/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-user-id': currentUser.id,
        'x-hasura-role': currentMember.role,
        'x-hasura-org-id': currentOrg.id,
      },
      body: JSON.stringify({ input: { workflow_id: selectedWorkflow.id } }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || json.message || 'Workflow run failed');
    }

    if (json.run_id) {
      activeRunIdRef.current = json.run_id;
      setActiveRun({ id: json.run_id, workflow_id: selectedWorkflow.id, status: 'running', current_step_index: 0, created_at: new Date().toISOString() } as any);
      await loadData(json.run_id);
    }
    setActiveTab('execution');
  };

  // Handler: Approve Step
  const handleApproveStep = async (stepRunId: string) => {
    const res = await fetch('/api/actions/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-user-id': currentUser.id,
        'x-hasura-role': currentMember.role,
        'x-hasura-org-id': currentOrg.id,
      },
      body: JSON.stringify({ input: { step_run_id: stepRunId } }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.error || json.message };
    }
    await loadData(activeRunIdRef.current || undefined);
    return { success: true, message: json.message };
  };

  // Handler: Test Inbound Webhook Trigger
  const handleTestWebhook = async () => {
    if (!selectedWorkflow) return;
    const res = await fetch(`/api/webhooks/trigger/${selectedWorkflow.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'Frontend Simulator', test_payload: 'Lead Ingestion' }),
    });
    const json = await res.json();
    if (res.ok && json.run_id) {
      activeRunIdRef.current = json.run_id;
      setActiveRun({ id: json.run_id, workflow_id: selectedWorkflow.id, status: 'running', current_step_index: 0, created_at: new Date().toISOString() } as any);
      await loadData(json.run_id);
      setActiveTab('execution');
    } else {
      alert(`Webhook Trigger Error: ${json.error || 'Failed'}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f4ee] text-[#1c241e]">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        currentOrg={currentOrg}
        currentMember={currentMember}
        onUserSelect={handleUserSelect}
      />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#e2dbd0] pb-4 gap-4">
          <div className="flex items-center gap-2 bg-[#efebe4] p-1.5 rounded-2xl border border-[#e2dbd0] shadow-inner">
            <button
              onClick={() => setActiveTab('builder')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'builder'
                  ? 'bg-[#047857] text-white shadow-md shadow-emerald-900/10'
                  : 'text-[#5c6b60] hover:text-[#142319]'
              }`}
            >
              <Layers className="h-4 w-4" /> Workflow Builder
            </button>

            <button
              onClick={() => setActiveTab('execution')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'execution'
                  ? 'bg-[#047857] text-white shadow-md shadow-emerald-900/10'
                  : 'text-[#5c6b60] hover:text-[#142319]'
              }`}
            >
              <Play className="h-4 w-4" /> Live Run Dashboard
              {activeRun?.status === 'paused' && (
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'security'
                  ? 'bg-[#047857] text-white shadow-md shadow-emerald-900/10'
                  : 'text-[#5c6b60] hover:text-[#142319]'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> Security & ID-Guessing Matrix
            </button>
          </div>

          <div className="text-xs text-[#5c6b60] font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#047857]" />
            Active Org Context: <span className="text-[#142319] font-bold">{currentOrg.name}</span>
          </div>
        </div>

        {/* Tab View Switcher */}
        {activeTab === 'builder' && selectedWorkflow && (
          <WorkflowBuilder
            workflow={selectedWorkflow}
            steps={steps}
            triggers={triggers}
            currentMember={currentMember}
            onAddStep={handleAddStep}
            onTestWebhook={handleTestWebhook}
          />
        )}

        {activeTab === 'execution' && selectedWorkflow && (
          <ExecutionDashboard
            workflow={selectedWorkflow}
            currentMember={currentMember}
            currentUser={currentUser}
            onRunWorkflow={handleRunWorkflow}
            onApproveStep={handleApproveStep}
            activeRun={activeRun}
            stepRuns={stepRuns}
          />
        )}

        {activeTab === 'security' && (
          <SecurityTester
            currentUser={currentUser}
            currentOrg={currentOrg}
            currentMember={currentMember}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e2dbd0] py-6 text-center text-xs text-[#6b7a6f] font-mono">
        Mini-n8n OS — Multi-Tenant AI Agent Workflow Engine (Nhost + Hasura + PostgreSQL + GraphQL + Next.js 14)
      </footer>
    </div>
  );
}
