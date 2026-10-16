/** Shows a leading "Label:" (as in the task and brief bullets) in bold. */
export default function LabeledText({ text, label }: { text: string; label?: string }) {
  if (label) {
    return (
      <>
        <strong>{label}:</strong> {text}
      </>
    );
  }
  const m = /^([^:]{1,40}):\s+([\s\S]*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <strong>{m[1]}:</strong> {m[2]}
    </>
  );
}
