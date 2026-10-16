"use client";

import { useState } from "react";
import { post } from "@/lib/clientApi";
import type { PublicQuestion, QuestionResult } from "@/lib/instructions";

type Response = { allCorrect: boolean; results: QuestionResult[]; next: string | null };

/**
 * Multiple-choice understanding check. A wrong answer shows the correct one and clears
 * that question so the participant can retry; every attempt is logged on the server.
 */
export default function UnderstandingCheck({ questions }: { questions: PublicQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [corrections, setCorrections] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<Response>("/api/instructions/check", { answers });
      if (res.allCorrect && res.next) {
        window.location.assign(res.next);
        return;
      }
      const wrong = res.results.filter((r) => !r.correct);
      setCorrections(Object.fromEntries(wrong.map((r) => [r.id, r.correctIndex])));
      setAnswers((a) => {
        const next = { ...a };
        for (const r of wrong) delete next[r.id];
        return next;
      });
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="check-form">
      {questions.map((q, qi) => (
        <fieldset key={q.id}>
          <legend>
            {qi + 1}. {q.text}
          </legend>
          {q.options.map((opt, oi) => (
            <label key={oi} className="check-option">
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === oi}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
              />{" "}
              {opt}
            </label>
          ))}
          {corrections[q.id] !== undefined && (
            <p className="check-correction" role="status">
              Not quite. The correct answer is: <strong>{q.options[corrections[q.id]]}</strong>. Please select it to
              continue.
            </p>
          )}
        </fieldset>
      ))}
      {error && <p className="save-status not-saved">{error}</p>}
      <div className="toolbar">
        <button type="submit" disabled={busy || !allAnswered}>
          Check answers
        </button>
      </div>
    </form>
  );
}
