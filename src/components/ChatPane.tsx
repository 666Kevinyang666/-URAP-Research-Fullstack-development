import type { Version } from "@/lib/constants";

/**
 * Placeholder for the AI chat pane (owned by Kevin).
 * Rendered only for the "standard" and "sustainable" versions.
 * The real pane should call the AI proxy, which logs messages with logEvent().
 */
export default function ChatPane({ taskId, version }: { taskId: string; version: Version }) {
  return (
    <div className="chat-placeholder" id="ai-chat-pane" data-task-id={taskId} data-version={version}>
      <strong>AI assistant</strong>
      <p>Chat pane placeholder ({version} version). Coming soon.</p>
    </div>
  );
}
