"use client";

import { useState } from "react";
import type { Plan } from "@/lib/plans";
import { post } from "@/lib/clientApi";
import { useWorkspace } from "./Workspace";

function PlanForm({ initial, submitLabel, onDone }: { initial: Plan | null; submitLabel: string; onDone?: () => void }) {
  const { taskId, setPlan } = useWorkspace();
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [goodEnough, setGoodEnough] = useState(initial?.goodEnough ?? "");
  const [budget, setBudget] = useState(initial ? String(initial.timeBudgetMinutes) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { plan } = await post<{ plan: Plan }>("/api/plan", {
        taskId,
        purpose,
        goodEnough,
        timeBudgetMinutes: Number(budget),
      });
      setPlan(plan);
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="plan-form" onSubmit={submit}>
      <label>
        What is the purpose of this deliverable?
        <textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
      </label>
      <label>
        What does &ldquo;good enough&rdquo; look like?
        <textarea rows={2} value={goodEnough} onChange={(e) => setGoodEnough(e.target.value)} required />
      </label>
      <label>
        How many minutes do you intend to spend?
        <input
          type="number"
          min={1}
          max={600}
          step={1}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          required
        />
      </label>
      {error && <p className="save-status not-saved">{error}</p>}
      <div className="toolbar">
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onDone && initial && (
          <button type="button" onClick={onDone} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** Shown over the editor until the plan is submitted (versions with features.taskPlan). */
export function PlanGate() {
  const { needsPlan } = useWorkspace();
  if (!needsPlan) return null;
  return (
    <div className="plan-gate">
      <p>
        <strong>Before you start, plan this task.</strong>
      </p>
      <PlanForm initial={null} submitLabel="Save plan and start" />
    </div>
  );
}

/** Collapsible, editable view of the submitted plan. */
export function PlanPanel() {
  const { plan } = useWorkspace();
  const [editing, setEditing] = useState(false);
  if (!plan) return null;
  return (
    <details className="side-panel" open>
      <summary>Your plan</summary>
      {editing ? (
        <PlanForm initial={plan} submitLabel="Save changes" onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="plan-view">
            <dt>Purpose</dt>
            <dd>{plan.purpose}</dd>
            <dt>Good enough</dt>
            <dd>{plan.goodEnough}</dd>
            <dt>Time budget</dt>
            <dd>{plan.timeBudgetMinutes} min</dd>
          </dl>
          <button type="button" onClick={() => setEditing(true)}>
            Edit plan
          </button>
        </>
      )}
    </details>
  );
}
