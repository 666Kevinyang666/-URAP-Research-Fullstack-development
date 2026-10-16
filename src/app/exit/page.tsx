// Shown after declining consent. The session is ended; nothing else is collected.
export default function ExitPage() {
  return (
    <main className="page">
      <h1>Thank you</h1>
      <p>You have chosen not to take part in this study. No further information will be collected.</p>
      <p>You can close this window.</p>
    </main>
  );
}
