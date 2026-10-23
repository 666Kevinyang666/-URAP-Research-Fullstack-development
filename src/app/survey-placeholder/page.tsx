// Stand-in for the real Qualtrics surveys, so the flow works before real survey links exist
// (config/study.json's baselineSurveyUrl and endSurveyUrl point here by default). Replace them
// with the real Qualtrics links before the study runs — see README "Qualtrics setup".
export default async function SurveyPlaceholder({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string; survey?: string }>;
}) {
  const { sid, survey } = await searchParams;
  const kind = survey === "baseline" ? "baseline" : "end";
  const returnHref = `/survey/return?survey=${kind}&sid=${encodeURIComponent(sid ?? "")}`;

  return (
    <main className="page">
      <h1>{kind === "baseline" ? "Start-of-session survey" : "End-of-session survey"} (placeholder)</h1>
      <p className="placeholder-note">
        [PLACEHOLDER — the real Qualtrics survey ({kind === "baseline" ? "baselineSurveyUrl" : "endSurveyUrl"} in
        config/study.json) appears here in the study.]
      </p>
      <p>
        Session ID passed through: <code id="survey-sid">{sid || "(none)"}</code>
      </p>
      <p>
        {kind === "baseline"
          ? "After this survey, you'll read the instructions for the study."
          : "After this survey, you'll answer a few short interview questions."}
      </p>
      {sid ? (
        <p>
          <a className="button-link" href={returnHref}>
            Return to study
          </a>
        </p>
      ) : (
        <p>No session ID was passed, so this page can&apos;t return you to the study. Open your study link again.</p>
      )}
    </main>
  );
}
