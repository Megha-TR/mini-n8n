'use client';

import React, { useState } from 'react';
import { Workflow, OrgMember, User, WorkflowRun, StepRun } from '@/lib/db';
import {
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  PauseCircle,
  Eye,
  XCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileCode,
  Lock,
} from 'lucide-react';

interface ExecutionDashboardProps {
  workflow: Workflow;
  currentMember: OrgMember;
  currentUser: User;
  onRunWorkflow: () => Promise<void>;
  onApproveStep: (stepRunId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  activeRun: WorkflowRun | null;
  stepRuns: StepRun[];
}

export function ExecutionDashboard({
  workflow,
  currentMember,
  currentUser,
  onRunWorkflow,
  onApproveStep,
  activeRun,
  stepRuns,
}: ExecutionDashboardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setApprovalMessage(null);
    try {
      await onRunWorkflow();
    } catch (err: any) {
      alert(err.message || 'Run failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleApprove = async (stepRunId: string) => {
    const res = await onApproveStep(stepRunId);
    if (res.success) {
      setApprovalMessage({ text: res.message || 'Step approved and workflow resumed.', type: 'success' });
    } else {
      setApprovalMessage({ text: res.error || 'Approval rejected', type: 'error' });
    }
  };

  const togglePayload = (id: string) => {
    setExpandedPayloadId((prev) => (prev === id ? null : id));
  };

  const isViewer = currentMember.role === 'viewer';
  const canRun = currentMember.role === 'owner' || currentMember.role === 'editor';
  const pausedStepRun = stepRuns.find((sr) => sr.status === 'paused');

  return (
    <div className="space-y-6">
      {/* Execution Control Top Panel */}
      <div className="glass-panel rounded-2xl p-6 border border-[#e2dbd0] bg-[#faf8f5]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#142319] flex items-center gap-2">
              <Play className="h-5 w-5 text-[#047857]" /> Live Execution Stream & Subscription Panel
            </h2>
            <p className="text-xs text-[#5c6b60] mt-0.5">
              Streaming real-time step state progression via Hasura GraphQL Subscriptions.
            </p>
          </div>

          {canRun ? (
            <button
              disabled={isRunning}
              onClick={handleRun}
              className="flex items-center gap-2 bg-[#047857] hover:bg-[#065f46] text-white px-6 py-3 rounded-xl font-bold text-xs shadow-md shadow-emerald-900/10 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-white" /> {isRunning ? 'Initiating Engine...' : 'Trigger Workflow Run'}
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-bold text-xs border border-gray-300">
              <Lock className="h-4 w-4 text-gray-500" /> Read-Only Role (Viewer): Cannot Trigger Runs
            </div>
          )}
        </div>
      </div>

      {/* Paused State Approval Banner (If Awaiting Approval) */}
      {pausedStepRun && (
        <div className="rounded-2xl p-6 border-2 border-amber-400/80 bg-[#fffdf5] pulse-amber shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-amber-950 flex items-center gap-2">
                  Action Required: Approve Step #{pausedStepRun.step_order} ({pausedStepRun.step_name})
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] uppercase font-mono px-2 py-0.5 rounded">
                    PAUSED STATE
                  </span>
                </h3>
                <p className="text-xs text-amber-900 mt-1 font-medium">
                  {canRun ? (
                    <>
                      The workflow hit an Approval Gate. As an authorized <span className="font-bold uppercase text-[#047857]">{currentMember.role}</span> ({currentUser.display_name}), click "Approve & Resume Step" below to proceed.
                    </>
                  ) : (
                    <>
                      Workflow paused at Approval Gate. Requires approval by an Owner or Editor of this organization.
                    </>
                  )}
                </p>
                <div className="text-[11px] text-amber-800 font-mono mt-1">
                  Authorized Role: <span className="font-bold">Owner / Editor</span> in {currentMember.org_id}
                </div>
              </div>
            </div>

            <button
              disabled={isViewer}
              onClick={() => handleApprove(pausedStepRun.id)}
              className={`font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 ${
                isViewer
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed border border-gray-400'
                  : 'bg-[#047857] hover:bg-[#065f46] text-white cursor-pointer'
              }`}
            >
              {isViewer ? (
                <>
                  <Lock className="h-4 w-4" /> Viewer Cannot Approve
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Approve & Resume Step
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Approval Feedback Alert */}
      {approvalMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            approvalMessage.type === 'success'
              ? 'bg-emerald-50 text-[#047857] border-emerald-300'
              : 'bg-red-50 text-red-700 border-red-300'
          }`}
        >
          {approvalMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {approvalMessage.text}
        </div>
      )}

      {/* Real-time Step Run Stream List */}
      <div className="glass-panel rounded-2xl p-6 border border-[#e2dbd0] bg-[#faf8f5]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#142319] flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#047857]" /> Step Runs Stream
          </h3>
          {activeRun && (
            <span className="text-xs font-mono text-[#5c6b60]">
              Run ID: <span className="text-[#142319] font-bold">{activeRun.id}</span>
            </span>
          )}
        </div>

        {stepRuns.length === 0 ? (
          <div className="text-center py-12 text-[#6b7a6f] text-xs">
            <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2 opacity-60" />
            <p className="font-semibold text-gray-700">No workflow runs initiated yet.</p>
            <p className="text-[11px] mt-1 text-gray-500">Click "Trigger Workflow Run" or send a Webhook POST to begin.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stepRuns.map((sr) => {
              const isExpanded = expandedPayloadId === sr.id;

              return (
                <div
                  key={sr.id}
                  className="glass-card rounded-xl border border-[#e6e0d4] bg-white overflow-hidden transition-all"
                >
                  <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0ebe1] text-[#047857] font-bold text-xs">
                        #{sr.step_order}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#142319]">{sr.step_name}</h4>
                        <span className="text-[11px] font-mono text-[#5c6b60]">({sr.step_type})</span>
                        {sr.approved_by && (
                          <span className="ml-2 text-[11px] text-[#047857] font-mono font-medium">
                            Approved by User: {sr.approved_by.substring(0, 12)}...
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          sr.status === 'completed'
                            ? 'bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]'
                            : sr.status === 'paused'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                            : sr.status === 'failed'
                            ? 'bg-red-100 text-red-800 border border-red-300'
                            : 'bg-gray-100 text-gray-700 border border-gray-300'
                        }`}
                      >
                        {sr.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {sr.status === 'paused' && <PauseCircle className="h-3.5 w-3.5" />}
                        {sr.status === 'failed' && <AlertCircle className="h-3.5 w-3.5" />}
                        {sr.status === 'pending' && <Clock className="h-3.5 w-3.5 text-gray-500" />}
                        {sr.status.charAt(0).toUpperCase() + sr.status.slice(1)}
                      </span>

                      {/* Clean Payload Inspector Button */}
                      <button
                        onClick={() => togglePayload(sr.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-[#5c6b60] hover:text-[#142319] bg-[#f0ebe1] hover:bg-[#e6dfd3] px-3 py-1.5 rounded-lg border border-[#e2dbd0] cursor-pointer transition-all"
                      >
                        <Eye className="h-3.5 w-3.5" /> Payload
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Clean Inline Collapsible Payload Section */}
                  {isExpanded && (
                    <div className="border-t border-[#e6e0d4] bg-[#faf8f5] p-4 text-xs font-mono">
                      <div className="flex items-center gap-2 text-[#047857] font-bold mb-2">
                        <FileCode className="h-4 w-4" /> Step Execution Payload Output
                      </div>
                      <pre className="bg-[#1c241e] text-emerald-300 p-4 rounded-xl border border-gray-800 overflow-x-auto text-[11px] leading-relaxed shadow-inner">
                        {JSON.stringify(sr.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
