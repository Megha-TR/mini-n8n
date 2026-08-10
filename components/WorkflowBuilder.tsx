'use client';

import React, { useState } from 'react';
import { Workflow, WorkflowStep, WorkflowTrigger, OrgMember } from '@/lib/types';
import {
  Sparkles,
  Globe,
  Database,
  Bell,
  GitBranch,
  ShieldCheck,
  Plus,
  Play,
  Copy,
  Check,
  Lock,
  Layers,
  Clock,
  Radio,
  Eye,
} from 'lucide-react';

interface WorkflowBuilderProps {
  workflow: Workflow;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  currentMember: OrgMember;
  onAddStep: (type: string, name: string) => void;
  onTestWebhook: () => void;
}

export function WorkflowBuilder({
  workflow,
  steps,
  triggers,
  currentMember,
  onAddStep,
  onTestWebhook,
}: WorkflowBuilderProps) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<string>('llm_call');
  const [newStepName, setNewStepName] = useState<string>('');

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/trigger/${workflow.id}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const isOwner = currentMember.role === 'owner';
  const isViewer = currentMember.role === 'viewer';
  const sensitiveStepTypes = ['db_write', 'webhook', 'notify'];
  const isSensitiveDisabled = (!isOwner && sensitiveStepTypes.includes(selectedStepType)) || isViewer;

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return <Sparkles className="h-5 w-5 text-purple-600" />;
      case 'http_request':
        return <Globe className="h-5 w-5 text-blue-600" />;
      case 'db_write':
        return <Database className="h-5 w-5 text-emerald-600" />;
      case 'notify':
        return <Bell className="h-5 w-5 text-pink-600" />;
      case 'conditional_branch':
        return <GitBranch className="h-5 w-5 text-amber-600" />;
      case 'approval_gate':
        return <ShieldCheck className="h-5 w-5 text-indigo-600" />;
      default:
        return <Layers className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Workflow Header Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-[#e2dbd0] bg-[#faf8f5]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-[#142319]">{workflow.name}</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-[#047857] border border-emerald-300">
                Active
              </span>
            </div>
            <p className="text-sm text-[#5c6b60]">{workflow.description}</p>
          </div>
          <div className="text-xs text-[#5c6b60] bg-[#f0ebe1] px-3 py-1.5 rounded-lg border border-[#e2dbd0] font-mono">
            ID: {workflow.id}
          </div>
        </div>

        {/* Triggers Section */}
        <div className="mt-6 pt-6 border-t border-[#e2dbd0] grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4] shadow-sm flex items-center gap-3">
            <Play className="h-4 w-4 text-[#047857]" />
            <div>
              <div className="text-xs font-bold text-[#142319]">Manual Trigger</div>
              <div className="text-[11px] text-[#6b7a6f]">User clicks Run</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-[#142319] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-blue-600" /> Webhook Endpoint
              </span>
              <button
                onClick={onTestWebhook}
                className="text-[10px] font-bold text-[#047857] hover:text-[#065f46] bg-[#ecfdf5] px-2 py-0.5 rounded border border-[#a7f3d0]"
              >
                Test POST
              </button>
            </div>
            <div className="flex items-center justify-between bg-[#f4f0e6] px-2 py-1 rounded text-[11px] font-mono text-[#374151]">
              <span className="truncate max-w-[150px]">{webhookUrl}</span>
              <button onClick={copyWebhookUrl} className="text-gray-500 hover:text-black ml-1">
                {copiedWebhook ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4] shadow-sm flex items-center gap-3">
            <Clock className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-xs font-bold text-[#142319]">Scheduled Trigger</div>
              <div className="text-[11px] text-[#6b7a6f]">Cron: 0 * * * *</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#e6e0d4] shadow-sm flex items-center gap-3">
            <Radio className="h-4 w-4 text-pink-600" />
            <div>
              <div className="text-xs font-bold text-[#142319]">Hasura DB Event</div>
              <div className="text-[11px] text-[#6b7a6f]">Watches: data_records</div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Step Canvas */}
      <div className="glass-panel rounded-2xl p-6 border border-[#e2dbd0] bg-[#faf8f5]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-[#142319] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#047857]" /> Workflow Execution Step Chain
          </h3>
          <span className="text-xs font-medium text-[#5c6b60] bg-[#f0ebe1] px-3 py-1 rounded-full border border-[#e2dbd0]">
            {steps.length} Configured Steps
          </span>
        </div>

        {/* Step Nodes List */}
        <div className="space-y-4 relative">
          {steps.map((step, idx) => (
            <div key={step.id} className="relative group">
              {idx < steps.length - 1 && (
                <div className="absolute left-6 top-12 h-8 w-0.5 bg-gradient-to-b from-[#047857]/40 to-[#d8d0c0] z-0" />
              )}
              <div className="glass-card rounded-xl p-4 border border-[#e6e0d4] hover:border-[#047857]/50 transition-all flex items-start gap-4 relative z-10 bg-white">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] font-bold text-[#047857] text-sm">
                  #{step.step_order}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {getStepIcon(step.type)}
                      <h4 className="text-sm font-bold text-[#142319]">{step.name}</h4>
                    </div>
                    <span className="rounded bg-[#f0ebe1] px-2 py-0.5 text-[11px] font-mono font-semibold text-[#047857] border border-[#e2dbd0]">
                      {step.type}
                    </span>
                  </div>

                  <div className="text-xs text-[#374151] bg-[#f7f4ee] p-2.5 rounded-lg border border-[#e5dfd5] font-mono mt-2 overflow-x-auto">
                    {JSON.stringify(step.config, null, 2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Layer 2 Add Step Controls */}
        <div className="mt-8 pt-6 border-t border-[#e2dbd0]">
          <h4 className="text-sm font-bold text-[#142319] mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#047857]" /> Add Step (Layer 2 Permission Enforced)
          </h4>

          {isViewer ? (
            <div className="p-4 rounded-xl bg-gray-100 border border-gray-300 text-xs font-semibold text-gray-700 flex items-center gap-2">
              <Eye className="h-4 w-4 text-gray-500" />
              Viewer Role (Read-Only): Cannot create or append workflow steps. Switch active context to Owner or Editor to edit.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Step Name (e.g. LLM Ticket Synthesizer)"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  className="bg-white border border-[#d8d0c0] text-sm text-[#142319] px-3.5 py-2 rounded-xl focus:outline-none focus:border-[#047857] min-w-[240px]"
                />

                <select
                  value={selectedStepType}
                  onChange={(e) => setSelectedStepType(e.target.value)}
                  className="bg-white border border-[#d8d0c0] text-sm text-[#142319] px-3.5 py-2 rounded-xl focus:outline-none focus:border-[#047857] cursor-pointer"
                >
                  <option value="llm_call">llm_call (Allowed for All Roles)</option>
                  <option value="http_request">http_request (Allowed for All Roles)</option>
                  <option value="conditional_branch">conditional_branch (Allowed for All Roles)</option>
                  <option value="approval_gate">approval_gate (Allowed for All Roles)</option>
                  <option value="db_write">db_write (REQUIRES OWNER ROLE)</option>
                  <option value="notify">notify (REQUIRES OWNER ROLE)</option>
                </select>

                <button
                  disabled={isSensitiveDisabled}
                  onClick={() => {
                    onAddStep(selectedStepType, newStepName || `Custom ${selectedStepType} Step`);
                    setNewStepName('');
                  }}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    isSensitiveDisabled
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300'
                      : 'bg-[#047857] hover:bg-[#065f46] text-white shadow-emerald-900/10'
                  }`}
                >
                  {isSensitiveDisabled ? (
                    <>
                      <Lock className="h-3.5 w-3.5 text-amber-700" /> Restricted to Owner
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Append Step
                    </>
                  )}
                </button>
              </div>

              {!isOwner && (
                <p className="mt-2 text-xs text-amber-800 font-medium flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Layer 2 Security active: Editor role cannot create sensitive step types (db_write, notify).
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
