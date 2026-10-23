import { BRIEF, getTask } from "@/lib/config";
import { getCurrentSession } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";
import LabeledText from "@/components/LabeledText";
import DownloadPdfButton from "./DownloadPdfButton";

export const dynamic = "force-dynamic";

export const metadata = { title: BRIEF.title };

// Frame Marketing Brief (config/brief.json). Opened in a new tab from every task page and the
// welcome page; "Download PDF" prints this same content with print styles (see globals.css).
// Both are kept because the PI hasn't chosen between a link and a PDF yet.
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
      <h1>{BRIEF.title}</h1>
      {BRIEF.pages.map((page, i) => (
        <section key={i} className={i > 0 ? "brief-page brief-page-break" : "brief-page"}>
          {page.heading && <h2 className="brief-page-heading">{page.heading}</h2>}
          {page.intro.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h3>{s.heading}</h3>
              {s.paragraphs?.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.items && (
                <ul>
                  {s.items.map((item, j) => (
                    <li key={j}>
                      <LabeledText text={item.text} label={item.label} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </section>
      ))}
    </main>
  );
}
