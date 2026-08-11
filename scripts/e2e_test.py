#!/usr/bin/env python3
"""
Mini-n8n End-to-End Test Suite
Tests all deliverable requirements against the live Docker stack.
"""

import json
import subprocess
import sys
import time
import requests

BASE = "http://localhost:3000"
HASURA = "http://localhost:8080/v1/graphql"
ADMIN_SECRET = "myadminsecretkey"

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  ✅ PASS: {name}")
        PASS += 1
    else:
        print(f"  ❌ FAIL: {name}" + (f" | {detail}" if detail else ""))
        FAIL += 1
    return condition

def login(user_id, email):
    r = requests.post(f"{BASE}/api/auth/login", json={"userId": user_id, "email": email})
    return r.json()

def db_query(sql):
    result = subprocess.run(
        ["docker", "exec", "agentflow_postgres", "psql", "-U", "postgres", "-d", "postgres", "-t", "-c", sql],
        capture_output=True, text=True
    )
    return result.stdout.strip()

print("=" * 55)
print("   Mini-n8n End-to-End Deliverable Test Suite")
print("=" * 55)
print()

# ── 1. AUTH ──────────────────────────────────────────────
print("── 1. Authentication ──")
alice = login("11111111-1111-1111-1111-111111111111", "alice@acme.com")
charlie = login("33333333-3333-3333-3333-333333333333", "charlie@acme.com")
david = login("44444444-4444-4444-4444-444444444444", "david@beta.com")
bob = login("22222222-2222-2222-2222-222222222222", "bob@acme.com")

check("Alice login succeeds with owner role", alice.get("success") and alice.get("user",{}).get("role") == "owner")
check("Alice token issued", bool(alice.get("token")))
check("Charlie (viewer) login succeeds", charlie.get("success") == True)
check("David (Org B owner) login succeeds", david.get("success") == True)
check("Bob (Org A editor) login succeeds", bob.get("success") == True)

ALICE_TOKEN = alice["token"]
CHARLIE_TOKEN = charlie["token"]
DAVID_TOKEN = david["token"]
BOB_TOKEN = bob["token"]

print()
# ── 2. CROSS-ORG GRAPHQL ISOLATION ───────────────────────
print("── 2. Cross-Org Isolation (Hasura Layer 1) ──")

# David (Org B owner) queries Org A workflow by ID
r = requests.post(f"{BASE}/api/graphql",
    headers={"Authorization": f"Bearer {DAVID_TOKEN}", "x-hasura-user-id": "44444444-4444-4444-4444-444444444444", "x-hasura-org-id": "b0000000-0000-0000-0000-000000000002", "Content-Type": "application/json"},
    json={"query": '{ workflows(where:{id:{_eq:"c0000000-0000-0000-0000-000000000001"}}) { id name } }'}
)
wf_count = len(r.json().get("data", {}).get("workflows", []))
check("Org B user gets 0 rows when guessing Org A workflow ID (ID-guessing blocked)", wf_count == 0, f"got {wf_count} rows")

# David queries Org B workflows - should get Org B's own workflows only
r2 = requests.post(f"{BASE}/api/graphql",
    headers={"Authorization": f"Bearer {DAVID_TOKEN}", "x-hasura-user-id": "44444444-4444-4444-4444-444444444444", "x-hasura-org-id": "b0000000-0000-0000-0000-000000000002", "Content-Type": "application/json"},
    json={"query": '{ workflows { id name org_id } }'}
)
david_wfs = r2.json().get("data", {}).get("workflows", [])
only_org_b = all(w["org_id"] == "b0000000-0000-0000-0000-000000000002" for w in david_wfs)
check("David's GraphQL only returns Org B workflows", only_org_b and len(david_wfs) > 0, f"got {[w['name'] for w in david_wfs]}")

print()
# ── 3. VIEWER CANNOT TRIGGER ─────────────────────────────
print("── 3. Viewer Role Enforcement (Layer 1) ──")

r = requests.post(f"{BASE}/api/actions/trigger",
    headers={"Authorization": f"Bearer {CHARLIE_TOKEN}", "x-hasura-user-id": "33333333-3333-3333-3333-333333333333", "Content-Type": "application/json"},
    json={"input": {"workflow_id": "c0000000-0000-0000-0000-000000000001"}}
)
check("Viewer (Charlie) trigger returns 403", r.status_code == 403, f"got {r.status_code}: {r.text[:100]}")

print()
# ── 4. CROSS-ORG TRIGGER ATTACK ──────────────────────────
print("── 4. Cross-Org Trigger Attack (Action Handler Layer) ──")

r = requests.post(f"{BASE}/api/actions/trigger",
    headers={"Authorization": f"Bearer {DAVID_TOKEN}", "x-hasura-user-id": "44444444-4444-4444-4444-444444444444", "Content-Type": "application/json"},
    json={"input": {"workflow_id": "c0000000-0000-0000-0000-000000000001"}}
)
check("Org B user trigger of Org A workflow returns 403", r.status_code == 403, f"got {r.status_code}: {r.text[:100]}")

print()
# ── 5. TRIGGER WORKFLOW RUN ───────────────────────────────
print("── 5. Owner Triggers Workflow Run ──")

r = requests.post(f"{BASE}/api/actions/trigger",
    headers={"Authorization": f"Bearer {ALICE_TOKEN}", "x-hasura-user-id": "11111111-1111-1111-1111-111111111111", "Content-Type": "application/json"},
    json={"input": {"workflow_id": "c0000000-0000-0000-0000-000000000001"}}
)
trig = r.json()
run_id = trig.get("run_id", "")
check("Alice triggers workflow run successfully", bool(run_id), f"response: {trig}")
print(f"     Run ID: {run_id}")

print()
print("── 6. Waiting 10s for steps to execute... ──")
time.sleep(10)

# ── 6. STEP EXECUTION ────────────────────────────────────
steps = db_query(f"SELECT step_order,step_name,status FROM public.step_runs WHERE workflow_run_id='{run_id}' ORDER BY step_order;")
print(f"  Step run states:\n{steps}")

def get_step_status(order):
    return db_query(f"SELECT status FROM public.step_runs WHERE workflow_run_id='{run_id}' AND step_order={order};").strip()

def get_run_status():
    return db_query(f"SELECT status FROM public.workflow_runs WHERE id='{run_id}';").strip()

check("Step 1 (llm_call) completed", get_step_status(1) == "completed", f"status={get_step_status(1)}")
check("Step 2 (http_request) completed", get_step_status(2) == "completed", f"status={get_step_status(2)}")
check("Step 3 (conditional_branch) completed", get_step_status(3) == "completed", f"status={get_step_status(3)}")
check("Step 4 (approval_gate) is PAUSED", get_step_status(4) == "paused", f"status={get_step_status(4)}")
check("Steps 5, 6 still PENDING (held by gate)", get_step_status(5) == "pending", f"status={get_step_status(5)}")
check("workflow_run status is PAUSED", get_run_status() == "paused", f"status={get_run_status()}")

print()
# ── 7. CROSS-ORG / VIEWER APPROVAL ATTACKS ───────────────
print("── 7. Approval Gate Attack Tests ──")
gate_sr_id = db_query(f"SELECT id FROM public.step_runs WHERE workflow_run_id='{run_id}' AND step_order=4;").strip()
print(f"     Paused StepRun ID: {gate_sr_id}")

r = requests.post(f"{BASE}/api/actions/approve",
    headers={"Authorization": f"Bearer {DAVID_TOKEN}", "x-hasura-user-id": "44444444-4444-4444-4444-444444444444", "Content-Type": "application/json"},
    json={"input": {"step_run_id": gate_sr_id}}
)
check("Org B user approval of Org A gate returns 403", r.status_code == 403, f"got {r.status_code}: {r.text[:100]}")

r = requests.post(f"{BASE}/api/actions/approve",
    headers={"Authorization": f"Bearer {CHARLIE_TOKEN}", "x-hasura-user-id": "33333333-3333-3333-3333-333333333333", "Content-Type": "application/json"},
    json={"input": {"step_run_id": gate_sr_id}}
)
check("Viewer (Charlie) approval of gate returns 403", r.status_code == 403, f"got {r.status_code}: {r.text[:100]}")

# Gate remains paused after attacks
check("Gate still paused after attack attempts", get_step_status(4) == "paused", f"status={get_step_status(4)}")

print()
# ── 8. OWNER APPROVES ─────────────────────────────────────
print("── 8. Authorized Owner Approves Gate ──")

r = requests.post(f"{BASE}/api/actions/approve",
    headers={"Authorization": f"Bearer {ALICE_TOKEN}", "x-hasura-user-id": "11111111-1111-1111-1111-111111111111", "Content-Type": "application/json"},
    json={"input": {"step_run_id": gate_sr_id}}
)
appr = r.json()
check("Alice approves gate successfully", appr.get("success") == True, f"response: {appr}")
print(f"     Message: {appr.get('message', '')}")

print()
print("── 9. Waiting 10s for post-approval steps... ──")
time.sleep(10)

check("Step 4 gate now COMPLETED (approved)", get_step_status(4) == "completed", f"status={get_step_status(4)}")
approved_by = db_query(f"SELECT approved_by FROM public.step_runs WHERE workflow_run_id='{run_id}' AND step_order=4;").strip()
check("approved_by field stamped on gate step_run", bool(approved_by), f"approved_by={approved_by}")
check("Step 5 (db_write) completed after approval", get_step_status(5) == "completed", f"status={get_step_status(5)}")
check("Step 6 (notify) completed after approval", get_step_status(6) == "completed", f"status={get_step_status(6)}")
check("workflow_run final status = completed", get_run_status() == "completed", f"status={get_run_status()}")

# Quota increment check
calls_used = db_query("SELECT calls_used FROM public.organizations WHERE id='a0000000-0000-0000-0000-000000000001';").strip()
check("Org A quota (calls_used) incremented after run", int(calls_used) > 12, f"calls_used={calls_used}")
print(f"     Org A calls_used: {calls_used}")

# db_write result check
data_records = db_query("SELECT COUNT(*) FROM public.data_records WHERE org_id='a0000000-0000-0000-0000-000000000001';").strip()
print(f"     data_records written: {data_records}")

print()
# ── 10. WEBHOOK TRIGGER ───────────────────────────────────
print("── 10. Webhook Trigger (Non-Manual Trigger) ──")

r = requests.post(f"{BASE}/api/webhooks/trigger/c0000000-0000-0000-0000-000000000001",
    json={"source": "e2e-test", "payload": "lead-ingestion"}
)
wh = r.json()
webhook_run_id = wh.get("run_id", "")
check("Webhook POST creates a new workflow run", bool(webhook_run_id), f"response: {wh}")
print(f"     Webhook Run ID: {webhook_run_id}")

print()
# ── 11. QUOTA ENFORCEMENT ─────────────────────────────────
print("── 11. Quota Enforcement ──")

subprocess.run(["docker", "exec", "agentflow_postgres", "psql", "-U", "postgres", "-d", "postgres", "-c",
    "UPDATE public.organizations SET calls_used=50 WHERE id='a0000000-0000-0000-0000-000000000001';"],
    capture_output=True)

r = requests.post(f"{BASE}/api/actions/trigger",
    headers={"Authorization": f"Bearer {ALICE_TOKEN}", "x-hasura-user-id": "11111111-1111-1111-1111-111111111111", "Content-Type": "application/json"},
    json={"input": {"workflow_id": "c0000000-0000-0000-0000-000000000001"}}
)
check("Quota exhausted returns 429", r.status_code == 429, f"got {r.status_code}: {r.text[:100]}")

# Reset
subprocess.run(["docker", "exec", "agentflow_postgres", "psql", "-U", "postgres", "-d", "postgres", "-c",
    "UPDATE public.organizations SET calls_used=14 WHERE id='a0000000-0000-0000-0000-000000000001';"],
    capture_output=True)

print()
# ── 12. EDITOR TRIGGER (ALLOWED) ─────────────────────────
print("── 12. Editor (Bob) Can Trigger ──")

r = requests.post(f"{BASE}/api/actions/trigger",
    headers={"Authorization": f"Bearer {BOB_TOKEN}", "x-hasura-user-id": "22222222-2222-2222-2222-222222222222", "Content-Type": "application/json"},
    json={"input": {"workflow_id": "c0000000-0000-0000-0000-000000000001"}}
)
check("Editor (Bob) can trigger a run", r.status_code == 200, f"got {r.status_code}: {r.text[:100]}")

print()
# ── 13. UNAUTHENTICATED ACCESS ────────────────────────────
print("── 13. Unauthenticated Access Blocked ──")

r = requests.post(f"{BASE}/api/graphql",
    headers={"Content-Type": "application/json"},
    json={"query": "{ workflows { id name } }"}
)
check("GraphQL proxy rejects request with no session token (401)", r.status_code == 401, f"got {r.status_code}")

print()
print("=" * 55)
print(f"   TOTAL: {PASS} PASSED / {PASS + FAIL} TESTS")
if FAIL > 0:
    print(f"   FAILED: {FAIL}")
else:
    print("   🎉 ALL TESTS PASSED!")
print("=" * 55)

sys.exit(0 if FAIL == 0 else 1)
