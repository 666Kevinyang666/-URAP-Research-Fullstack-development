import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { WELCOME } from "@/lib/config";
import NoSession from "@/components/NoSession";
import StartWorkButton from "./StartWorkButton";

export const dynamic = "force-dynamic";

// Step 3: "Welcome to Frame" (config/welcome.json). Start work sets Session.workStartedAt,
// which starts the session clock for break prompts and the peer check-in.
export default async function WelcomePage() {
  const session = await getCurrentSession();
  if (!session) return <NoSession />;
  const stage = await getJourneyStage(session);
  if (stage !== "welcome") redirect(stagePath(stage));

  return (
    <main className="page">
      <h1>{WELCOME.title}</h1>
      {WELCOME.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p>
        <a href="/brief?from=welcome" target="_blank" rel="noopener">
          Frame Marketing Brief
        </a>{" "}
        (opens in a new tab; it is also linked from every task page)
      </p>
      <StartWorkButton />
    </main>
  );
}
