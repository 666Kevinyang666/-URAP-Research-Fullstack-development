"use client";

import { useEffect, useState } from "react";
import { onAiRequestCount } from "@/lib/aiRequestCount";
import { useWorkspace } from "./Workspace";

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Live effort metrics for the open task (versions with features.effortDisplay). */
export default function EffortPanel({ initialAiRequestCount }: { initialAiRequestCount: number }) {
  const { taskId, activeMs, revisionCount, plan, paused } = useWorkspace();
  const [aiRequests, setAiRequests] = useState(initialAiRequestCount);

  useEffect(() => onAiRequestCount(taskId, setAiRequests), [taskId]);

  const budgetMs = plan ? plan.timeBudgetMinutes * 60_000 : null;

  return (
    <section className="side-panel effort-panel" aria-label="Effort on this task">
      <strong>Effort on this task</strong>
      <dl>
        <dt>Active time</dt>
        <dd>
          {formatDuration(activeMs)}
          {budgetMs !== null && ` of ${plan!.timeBudgetMinutes} min planned`}
          {budgetMs !== null && activeMs > budgetMs && " (over budget)"}
          {paused && " (paused)"}
        </dd>
        <dt>AI requests</dt>
        <dd>{aiRequests}</dd>
        <dt>Revisions</dt>
        <dd>{revisionCount}</dd>
      </dl>
    </section>
  );
}
