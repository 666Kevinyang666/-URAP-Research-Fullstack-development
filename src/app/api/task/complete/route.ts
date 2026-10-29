import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { setTaskStatus } from "@/lib/drafts";
import { parseCompletionAnswers } from "@/lib/completion";

// Body: { taskId, content?, answers? }
// answers (the completion questions, see @/lib/completion) are logged as
// task_completion_answers before the task is completed. 422 if the saved answer is shorter
// than minAnswerCharsToComplete (config/study.json); see setTaskStatus.
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const content = typeof body.content === "string" ? body.content : undefined;
  const answers = parseCompletionAnswers(body.answers);
  const draft = await setTaskStatus(s, body.taskId, "complete", content, answers);
  return NextResponse.json({ status: draft.status, revisionCount: draft.revisionCount });
});
