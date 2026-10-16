import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { CHECK_INTRO, INSTRUCTIONS_TITLE, getCheckQuestions, getInstructionParagraphs } from "@/lib/instructions";
import NoSession from "@/components/NoSession";
import UnderstandingCheck from "./UnderstandingCheck";

export const dynamic = "force-dynamic";

// Step 2: version-specific instructions (config/instructions.json), then the understanding check.
export default async function InstructionsPage() {
  const session = await getCurrentSession();
  if (!session) return <NoSession />;
  const stage = await getJourneyStage(session);
  if (stage !== "instructions") redirect(stagePath(stage));

  return (
    <main className="page">
      <h1>{INSTRUCTIONS_TITLE}</h1>
      {getInstructionParagraphs(session.version).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <h2>Check your understanding</h2>
      <p>{CHECK_INTRO}</p>
      <UnderstandingCheck questions={getCheckQuestions()} />
    </main>
  );
}
