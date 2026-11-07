import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { WELCOME } from "@/lib/config";
import { getFeatures } from "@/lib/features";
import NoSession from "@/components/NoSession";
import BriefPanel from "@/components/BriefPanel";
import StartWorkButton from "./StartWorkButton";

export const dynamic = "force-dynamic";

// Step 3: "Welcome to Frame" (config/welcome.json). Start work sets Session.workStartedAt,
// which starts the session clock for break prompts and the peer check-in. With focus mode,
// Start work also enters full screen, and the brief opens in an in-page panel.
export default async function WelcomePage() {
  const session = await getCurrentSession();
  if (!session) return <NoSession />;
  const stage = await getJourneyStage(session);
  if (stage !== "welcome") redirect(stagePath(stage));
  const { focusMode } = getFeatures(session.version);

  return (
    <main className="page">
      <h1>{WELCOME.title}</h1>
      {WELCOME.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {focusMode ? (
        <p>
          <BriefPanel taskId={null} from="welcome" /> (it is also linked from every task page)
        </p>
      ) : (
        <p>
          <a href="/brief?from=welcome" target="_blank" rel="noopener">
            Frame Marketing Brief
          </a>{" "}
          (opens in a new tab; it is also linked from every task page)
        </p>
      )}
      {focusMode && (
        <p className="focus-note">
          This session runs in full screen. Please stay on this page and do not use other apps or websites while
          working.
        </p>
      )}
      <StartWorkButton focusMode={focusMode} />
    </main>
  );
}
