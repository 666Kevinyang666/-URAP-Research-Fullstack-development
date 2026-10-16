import instructions from "@config/instructions.json";
import type { Version } from "./constants";

// Version-specific instructions and the understanding check (config/instructions.json).
// The answer key stays on the server; the browser only gets questions and options.

type CheckQuestion = { id: string; text: string; options: string[]; answer: Record<Version, number> };
const QUESTIONS: CheckQuestion[] = instructions.check.questions;

export type PublicQuestion = { id: string; text: string; options: string[] };
export type QuestionResult = { id: string; correct: boolean; correctIndex: number };

/** Shared paragraphs followed by this version's paragraphs. */
export function getInstructionParagraphs(version: Version): string[] {
  return [...instructions.shared, ...instructions.versions[version]];
}

export const INSTRUCTIONS_TITLE: string = instructions.title;
export const CHECK_INTRO: string = instructions.check.intro;

export function getCheckQuestions(): PublicQuestion[] {
  return QUESTIONS.map(({ id, text, options }) => ({ id, text, options }));
}

/**
 * Grade one attempt. `answers` maps question id to the chosen option index.
 * Unanswered or invalid answers count as wrong.
 */
export function gradeCheck(version: Version, answers: Record<string, unknown>) {
  const results: (QuestionResult & { choice: number | null; choiceText: string | null })[] = QUESTIONS.map((q) => {
    const raw = answers[q.id];
    const choice = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < q.options.length ? (raw as number) : null;
    const correctIndex = q.answer[version];
    return { id: q.id, choice, choiceText: choice === null ? null : q.options[choice], correct: choice === correctIndex, correctIndex };
  });
  return { results, allCorrect: results.every((r) => r.correct) };
}
