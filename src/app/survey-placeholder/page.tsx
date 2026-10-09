// Stand-in for the real Qualtrics survey, so "Continue to survey" works before a real
// survey link exists (config/study.json's qualtricsUrl points here by default). Replace
// qualtricsUrl with the real Qualtrics link before the study runs — see README.
export default async function SurveyPlaceholder({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  const { sid } = await searchParams;

  return (
    <main style={{ maxWidth: 560 }}>
      <h1>Qualtrics survey (placeholder)</h1>
      <p>
        This stands in for the real Qualtrics survey. A real survey link, set as{" "}
        <code>qualtricsUrl</code> in <code>config/study.json</code>, would appear here instead and
        return to this app with the same session ID.
      </p>
      {sid && (
        <p>
          Session ID passed through: <code>{sid}</code>
        </p>
      )}
      <p>
        In the full flow, finishing the endline survey here hands off to the AI interview, using
        this same session ID, before the completion page.
      </p>
      <p>
        <a href="/interview">Continue to interview</a>
      </p>
    </main>
  );
}
