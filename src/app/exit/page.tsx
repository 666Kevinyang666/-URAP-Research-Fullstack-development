import { getCurrentSession } from "@/lib/session";
import { getJourneyStage } from "@/lib/journey";

export const dynamic = "force-dynamic";

// Shown after declining consent, or after Withdraw from study. The session is ended; nothing
// else is collected.
export default async function ExitPage() {
  const session = await getCurrentSession();
  const withdrawn = session !== null && (await getJourneyStage(session)) === "withdrawn";

  return (
    <main className="page">
      <h1>Thank you</h1>
      {withdrawn ? (
        <p>You have withdrawn from the study. Your session has ended and no further information will be collected.</p>
      ) : (
        <p>You have chosen not to take part in this study. No further information will be collected.</p>
      )}
      <p>You can close this window.</p>
    </main>
  );
}
