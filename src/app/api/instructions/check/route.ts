import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { gradeCheck } from "@/lib/instructions";

// Understanding check attempt. Body: { answers: { [questionId]: optionIndex } }
// -> { allCorrect, results: [{ id, correct, correctIndex }], next }
// Logs understanding_check_attempt every time, and understanding_check_passed once all are correct.
export const POST = withSession(async (s, body) => {
  const stage = await getJourneyStage(s);
  if (stage !== "instructions") return NextResponse.json({ allCorrect: true, results: [], next: stagePath(stage) });
  if (!body.answers || typeof body.answers !== "object") return error(400, "answers is required");

  const { results, allCorrect } = gradeCheck(s.version, body.answers as Record<string, unknown>);
  const attempt =
    (await prisma.event.count({ where: { sessionId: s.sessionId, eventType: "understanding_check_attempt" } })) + 1;
  await logEvent(s.sessionId, s.version, null, "understanding_check_attempt", {
    attempt,
    allCorrect,
    answers: results.map(({ id, choice, choiceText, correct }) => ({ id, choice, choiceText, correct })),
  });
  if (allCorrect) await logEvent(s.sessionId, s.version, null, "understanding_check_passed", { attempts: attempt });

  return NextResponse.json({
    allCorrect,
    results: results.map(({ id, correct, correctIndex }) => ({ id, correct, correctIndex })),
    next: allCorrect ? stagePath("welcome") : null,
  });
});
