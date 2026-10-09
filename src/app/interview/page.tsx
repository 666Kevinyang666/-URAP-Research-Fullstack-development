import { getCurrentSession } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";
import { getInterviewConversation, getOpeningMessage } from "@/lib/interview";
import { AI_MODEL } from "@/lib/ai";
import InterviewChat from "./InterviewChat";

export const dynamic = "force-dynamic";

// End-of-session AI interview (Stage 7 in the brief): reachable by every version,
// including "none". Not gated on session.endedAt — it's meant to run after End work,
// but nothing stops revisiting it.
export default async function InterviewPage() {
  const session = await getCurrentSession();
  if (!session) {
    return (
      <main>
        <h1>Session not found</h1>
        <p>Please use the link you were given.</p>
      </main>
    );
  }

  let messages = await getInterviewConversation(session.sessionId);
  if (messages.length === 0) {
    const text = getOpeningMessage();
    await logEvent(session.sessionId, session.version, null, "interview_assistant_message", { text, model: AI_MODEL });
    messages = await getInterviewConversation(session.sessionId);
  }

  return (
    <main style={{ maxWidth: 640 }}>
      <h1>A few quick questions</h1>
      <InterviewChat initialMessages={messages} />
    </main>
  );
}
