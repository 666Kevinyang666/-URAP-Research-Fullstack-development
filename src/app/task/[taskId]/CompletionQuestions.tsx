"use client";

import { useState } from "react";
import type { CompletionAnswers, GoodEnoughChoice } from "@/lib/completion";

const CHOICES: { value: GoodEnoughChoice; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "mostly", label: "Mostly" },
  { value: "no", label: "No" },
];

type Props = {
  source: CompletionAnswers["source"];
  busy: boolean;
  error: string | null;
  onSubmit: (answers: CompletionAnswers) => void;
  onCancel: () => void;
};

/** Short form before a task is marked complete. Every field is optional, and Skip is allowed. */
export default function CompletionQuestions({ source, busy, error, onSubmit, onCancel }: Props) {
  const [why, setWhy] = useState("");
  const [goodEnough, setGoodEnough] = useState<GoodEnoughChoice | null>(null);
  const [note, setNote] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ skipped: false, why, goodEnough, goodEnoughNote: note, source });
  }

  return (
    <form className="completion-form" onSubmit={submit}>
      <p>
        <strong>Before you mark this task complete</strong>
      </p>
      <label>
        Why do you consider this task complete?
        <textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} disabled={busy} />
      </label>
      <fieldset>
        <legend>Is it good enough?</legend>
        {CHOICES.map((c) => (
          <label key={c.value} className="inline-choice">
            <input
              type="radio"
              name="goodEnough"
              checked={goodEnough === c.value}
              onChange={() => setGoodEnough(c.value)}
              disabled={busy}
            />{" "}
            {c.label}
          </label>
        ))}
      </fieldset>
      <label>
        Anything to add? (optional)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
      </label>
      {error && <p className="save-status not-saved">{error}</p>}
      <div className="toolbar">
        <button type="submit" disabled={busy}>
          Mark task complete
        </button>
        <button
          type="button"
          onClick={() => onSubmit({ skipped: true, why: "", goodEnough: null, goodEnoughNote: "", source })}
          disabled={busy}
        >
          Skip questions and mark complete
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
