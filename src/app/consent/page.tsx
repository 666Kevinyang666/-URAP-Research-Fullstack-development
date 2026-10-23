import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getJourneyStage, stagePath } from "@/lib/journey";
import NoSession from "@/components/NoSession";
import ConsentForm from "./ConsentForm";

export const dynamic = "force-dynamic";

// Step 1 of the participant flow. PLACEHOLDER consent text: replace with the IRB-approved
// consent form before the study runs.
export default async function ConsentPage() {
  const session = await getCurrentSession();
  if (!session) return <NoSession />;
  const stage = await getJourneyStage(session);
  if (stage !== "consent") redirect(stagePath(stage));

  return (
    <main className="page">
      <h1>Consent to participate</h1>
      <p className="placeholder-note">
        [PLACEHOLDER CONSENT TEXT — replace with the approved consent form before the study runs.]
      </p>
      <p>
        You are invited to take part in a research study about how people work on writing tasks. You will
        complete a set of short marketing tasks in your browser, then answer a survey and a short interview.
      </p>
      <p>
        Your participation is voluntary. You may stop at any time. Your responses are stored under a study ID,
        not your name.
      </p>
      <p>If you have questions about the study, contact the research team.</p>
      <ConsentForm />
    </main>
  );
}
