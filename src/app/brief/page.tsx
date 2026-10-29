import { BRIEF, getTask } from "@/lib/config";
import { getCurrentSession } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";
import BriefContent from "@/components/BriefContent";
import DownloadPdfButton from "./DownloadPdfButton";

export const dynamic = "force-dynamic";

export const metadata = { title: BRIEF.title };

// Frame Marketing Brief (config/brief.json). Opened in a new tab from every task page and the
// welcome page; "Download PDF" prints this same content with print styles (see globals.css).
// Both are kept because the PI hasn't chosen between a link and a PDF yet. In focus mode the
// brief opens in an in-page panel instead (@/components/BriefPanel).
export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; taskId?: string }>;
}) {
  const { from, taskId } = await searchParams;
  const session = await getCurrentSession();
  if (session) {
    const validTaskId = taskId && getTask(taskId) ? taskId : null;
    await logEvent(session.sessionId, session.version, validTaskId, "brief_open", { from: from ?? null });
  }

  return (
    <main className="brief">
      <div className="brief-toolbar no-print">
        <DownloadPdfButton taskId={taskId && getTask(taskId) ? taskId : null} loggable={session !== null} />
      </div>
      <BriefContent />
    </main>
  );
}
