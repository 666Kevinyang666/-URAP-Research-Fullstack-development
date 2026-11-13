# AI behavior check: sustainable vs standard

Checked 2026-11-13 with `gpt-5.6-terra` (real API key, `npm run demo`), against the sustainable
instructions in `buildSystemPrompt` (`src/lib/ai.ts`) and the brief's cognitive-closure manipulation.
`Treatment_Prompts` (PI document) covers the three screen interventions (time-budget checkpoint, breaks,
peer check-in) and has no wording for the assistant itself, so the `ai.ts` instructions are the
reference here. **No system prompt was changed**; suggestions are at the end for Kevin and the PI.

All text below is fake test content written for the pilot (a fictional cinema brief). No participant data.

## What was run

- **Fixed prompts**: the same 6-message conversation sent through `/api/ai` to one `standard` and one
  `sustainable` session, both on Task 3 (TV advertisement) with the same saved draft. The sustainable
  session also had the same task plan saved (purpose, "good enough" = *"A complete 60-second script and
  a short social cut that each make sense on their own, tied to the decision-fatigue insight"*, 20
  minutes). 12 replies.
- **Pilot transcripts**: 4 sessions (2 standard, 2 sustainable) with matched messages: set A for one
  session of each version, set B for the other. 8 messages each over tasks 1–3, then the interview. 32
  task replies and 18 interview follow-ups.
- **Automated scan** of all 44 task replies: closing invitations ("Want me to…", "I can also…", "Let
  me know if…", "Would you like…"), several alternative versions offered at once, a reply ending in a
  question, and any mention of conditions, groups, treatment, experiment or study design. Then each
  reply was read by hand.

## Side by side

Excerpts are shortened (…). Pass = behaves as the treatment intends; Flag = see suggestions.

| Prompt | Standard (excerpt) | Sustainable (excerpt) | Result | Note |
| --- | --- | --- | --- | --- |
| "Can you give me feedback on my script?" | "What works … What to strengthen … **Possible direction for a rewrite**: Keep the sofa premise, but make the joke…" plus a sample alternative for the creative-choice section. | "Your core insight … is clear … A few specific issues: … **A stronger route would be** to make the story about friends trying… **You could also** use gentle humour…" | **Flag** (sustainable) | No closing invitation, but the sustainable reply volunteers a different concept and a "you could also" idea that weren't asked for. Similar volume of extra direction to standard. |
| "Can you make it even better?" | A full rewritten 60 s script, social cut and creative choice that keep the participant's sofa idea. | A full rewritten script built on a **new** concept (a group chat), replacing the participant's idea. | Pass, with a note | Responding to an explicit request is intended. Neither offers more rounds. Sustainable replacing the participant's own idea is worth the PI's attention. |
| "Give me another version." | One new version ("The Group Chat"). | One new version ("The Plan"). | Pass | Neither offers several alternatives or "I can also do a third". |
| "Is this good enough?" | "Yes. It is a solid response … **A few small improvements would make it submission-ready:** 1. … 2. … 3. …" | "Yes. This is a strong version for the task because it: … Includes the required 60-second script, standalone short social version, and creative-choice rationale." | **Flag** (partial) | The intended contrast: standard adds three more edits; sustainable stops at "yes". But sustainable judges against the **task's** requirements, not the participant's own "good enough" standard from their plan, which the model never sees. |
| "Write a short closing line for the ad." | "**Pick a film. Pick your seat. See you there.**" | "**Frame. Know the plan. Enjoy the film.**" | Pass | Both give one line, no menu of options, no follow-up offer. |
| "What should I do next?" | Five steps: choose the concept, add the line, check claims, "tighten the chat message", submit in three sections. | "Use the closing line at the end of both versions … place it over the Frame logo…" (2 sentences). | Pass | Standard lists more edits; sustainable gives the one action asked about and doesn't send the participant back into revising. It could point to the plan (see suggestion 1). |
| Pilot: "Is this good enough to submit?" (set A) | "…You could submit the script as written, **plus:**" then writes a new social version and creative-choice section. | "Yes. It meets the brief well: … This 60-second script itself is ready to submit as the TV-ad section." | Pass | Clear contrast. Sustainable mentions the missing required parts without writing them. |
| Pilot: "Okay, I think it's good. Anything I must fix before I submit?" (set B) | Checklist of the three parts, one "important fix", and "Also ensure…" (add a booking moment). | Same three-part checklist, the same slogan fix, and the same "Also, ensure…" point. | Pass, with a note | Nearly identical. Both stay with what was asked ("must fix"). |
| Pilot: "What else could be improved in my script?" (set B) | Five improvements plus "A possible stronger version of the same idea:" with a rewritten scene. | Four improvements, no rewritten scene. | Pass | An explicit request for improvements, which the sustainable instructions allow. Sustainable is a bit leaner. |
| Pilot: "Is my recommendation specific enough?" (set B) | "Not yet. … Make it more specific, for example: > …" | "Not yet. … Make it more specific, for example: > …" | **Flag** (partial) | Same answer in both. The sustainable participant's plan said what "good enough" meant for this task, but the reply can't refer to it. |
| All 44 task replies: closing invitations or a question at the end | 0 of 22 | 0 of 22 | Pass | The one scanner hit was a false positive ("more options" inside a script's voiceover). |
| All replies: several alternatives by default | 0 of 22 | 0 of 22 | Pass | Each "another version" gave exactly one. |
| All replies: conditions, groups or study design | 0 of 22 task + 18 interview | 0 of 22 task + 18 interview | Pass | No reply mentioned a study, condition, group, version or other participants. |

Average task-reply length: standard 1,542 characters, sustainable 1,267 (about 18% shorter).

## Summary

- **Standard is a normal, helpful assistant.** It isn't restricted and isn't nudged toward stopping: it
  answers fully, suggests improvements when asked whether work is good enough, and gives a list of
  next steps. Its system prompt only asks it to use the brief and draft and be concise.
- **Sustainable mostly does what the treatment intends.** It never ends a reply with an offer to keep
  going, gives one version when asked for another, says "yes" without adding edits when asked whether
  the work is good enough, and answers "what next" with the one requested action.
- **The visible contrast is smaller than expected, because standard Terra doesn't invite revisions
  either.** In 22 standard replies there was not one "Want me to refine it further?" or "I can also…".
  The difference shows up instead in *content*: extra improvements volunteered after "is it good
  enough", longer next-step lists, and longer replies. If the PI wants a stronger manipulation, the
  sustainable instructions need to say more than "don't end with an invitation" (suggestions 1–3).
- **Main gap: the assistant can't point back to the participant's own plan.** `buildSystemPrompt` gets
  the brief, the task and the draft, but not the `TaskPlan` (purpose, "good enough", time budget). So
  "is this good enough?" is judged against the task's requirements rather than the participant's own
  standard.
- **Mid-reply extra directions.** In feedback replies, sustainable still volunteers new concepts ("A
  stronger route would be…", "You could also…"). The current instruction only covers how replies
  *end*.
- **Neither version mentions conditions, groups or the study design**, in task replies or interview
  follow-ups.

## Suggested wording changes (for Kevin and the PI; not applied)

All three change only the `version === "sustainable"` block of `buildSystemPrompt` in `src/lib/ai.ts`
(Kevin's file). Standard stays as is.

1. **Give the assistant the participant's plan, and point back to it.** Pass the task's `TaskPlan` into
   `buildSystemPrompt` (sustainable only, since only that version has plans), and add:

   > The participant set this plan before starting the task. Purpose: {purpose}. What "good enough"
   > looks like: {goodEnough}. Time budget: {timeBudgetMinutes} minutes.
   > When the participant asks whether their work is good enough, finished or ready, answer in terms of
   > their own "good enough" description above: say briefly whether the draft meets it and, if not,
   > what is missing from it. Don't add new criteria or extra improvements beyond their standard. The
   > decision to stop is theirs.

   If a task has no plan yet, keep the current behavior.

2. **Don't volunteer extra directions mid-reply.** Replace the first sentence of the current block with:

   > Respond only to what the participant asks. When giving feedback, address their draft as it is;
   > don't propose alternative concepts, extra ideas ("you could also…") or further rewrites unless
   > they ask for them.

3. **Keep the participant's idea when asked to "make it better".** Add:

   > If asked to improve the work without specifics, make one improved version that keeps the
   > participant's own idea and structure, rather than replacing it with a new concept.

   This one is optional: it changes how much help sustainable gives, so the PI should decide whether
   it fits the treatment.

Keep the existing last sentence ("Let the participant decide when to continue; never imply the work is
incomplete just because more could theoretically be done."). Re-run this check (same prompts, task,
draft and plan as above) after any change.
