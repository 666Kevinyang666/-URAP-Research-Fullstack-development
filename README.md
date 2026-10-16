# URAP Research Prototype

Browser workspace for a randomized experiment on how people work with generative AI on writing tasks.

Participants complete writing tasks in the browser. Drafts, snapshots and an append-only event log are
stored for analysis. One codebase serves all three study versions (`none`, `standard`, `sustainable`),
chosen per session by the `version` URL parameter.

## Stack

- Next.js 16 (App Router, TypeScript). API routes are the backend.
- Prisma 7 with SQLite locally (`better-sqlite3` driver adapter).
- No styling libraries; plain CSS in `src/app/globals.css`.

## Setup

Requires Node.js 20+.

```bash
cp .env.example .env   # then set DATABASE_URL="file:./dev.db" (it defaults to this if empty)
npm install            # also runs `prisma generate`
npm run dev            # applies migrations, then starts http://localhost:3000
```

Open a session at:

```
http://localhost:3000/start?sid=TEST123&version=standard
```

## Participant flow

Every version follows the same path; only flagged features differ inside the task pages.

1. `/start?sid=...&version=...` creates or resumes the session and sends the participant to their
   current step (`getJourneyStage` in `src/lib/journey.ts`), so a resumed link never restarts the flow.
2. `/consent`: Consent or Decline. Decline ends the session (`endedAt`) and shows `/exit`.
   **The consent text is a placeholder** and must be replaced with the approved form.
3. `/instructions`: version-specific instructions, then a 3-question understanding check. A wrong
   answer shows the correct one and the participant retries until all are correct.
4. `/welcome`: "Welcome to Frame", a link to the brief, and **Start work**, which sets
   `Session.workStartedAt` once. This starts the session clock (breaks, peer check-in).
5. `/task/[taskId]`: the five tasks (task pages redirect to the current step until work has started).
   **Mark task complete** first asks the completion questions. **End work** closes editing.
6. `/survey` → Qualtrics (or `/survey-placeholder`) → `/interview` → `/complete`.

Useful commands:

| Command | What it does |
| --- | --- |
| `npx prisma studio --url "file:///<absolute path>/dev.db"` | Browse the database. Prisma 7 Studio rejects the relative `file:./dev.db` URL, so pass an absolute one. |
| `npx prisma migrate dev --name <name>` | Create a migration after editing `prisma/schema.prisma` |
| `npm run typecheck` | TypeScript check |

Never commit `.env` or API keys. This repo is public.

## Versions and feature flags

`src/lib/features.ts` maps each version to the features it gets. Check flags (`getFeatures(version)`)
instead of comparing version strings. Layout and editor size are identical in every version; the side
column is always rendered, and stays empty when a version has no side features.

| Flag | none | standard | sustainable | What it controls |
| --- | --- | --- | --- | --- |
| `ai` | – | ✓ | ✓ | AI chat pane |
| `taskPlan` | – | – | ✓ | Plan form before the first edit of each task, plan panel, `POST /api/plan` |
| `effortDisplay` | – | – | ✓ | Effort panel (metrics are logged in every version) |
| `checkpoints` | – | – | ✓ | Completion checkpoint: time-budget pop-up (`POST /api/budget-checkpoint`) or AI-request dialog (`POST /api/checkpoint`), per `checkpointTrigger` |
| `peerChat` | – | – | ✓ | Peer check-in: v2 voice room at `peerCheckinMinutes` on the session clock (`POST`/`GET /api/peer-checkin-v2`), plus the legacy text room inside the AI-request checkpoint dialog (`POST`/`GET /api/peer`) |
| `breakPrompts` | – | – | ✓ | Break prompts at `breakPromptMinutes` on the session clock, `POST /api/break-prompt` |

## Configuration

- `config/tasks.json`: **provisional** — the PI's Provisional Task List (five Frame tasks, exact wording).
  An array of `{ id, title, required, intro[], quote?, submit[], materials?, closing? }`, shown in this
  order in the task list. `quote` is shown after the first intro paragraph; a leading `Label:` in a
  `submit` bullet is shown in bold. `required: false` tasks are optional and don't trigger the End work
  warning. The old placeholder ids are kept, mapped by task type: `strategy` = Task 1 (campaign),
  `evidence-synthesis` = Task 2 (why customers don't book), `creative` = Task 3 (TV ad), `optional-1` =
  Task 4 (competitor response), `optional-2` = Task 5 (film finder). Changing task ids orphans existing
  rows for the old ids. `src/lib/config.ts` derives `instructions[]` (the full task text as lines) for the
  AI system prompt.
- `config/brief.json`: the Frame Marketing Brief (two pages: company, then customer evidence), rendered
  at `/brief`.
- `config/welcome.json`: the "Welcome to Frame" intro on `/welcome`.
- `config/instructions.json`: **draft** instructions and the understanding check, pending PI review.
  `shared` paragraphs plus one paragraph per version in `versions` (keep these matched in length:
  currently 156 / 155 / 154 words for none / standard / sustainable), and `check.questions`, each with
  `options` and the correct option index per version in `answer`. The answer key never reaches the
  browser.
- `config/study.json`: `qualtricsUrl` (survey link — defaults to `/survey-placeholder`, a local stand-in
  page, so "Continue to survey" doesn't error before a real Qualtrics link exists; replace it before
  the study runs), `autosaveIntervalMs` (3 s), `snapshotIntervalMs` (5 min),
  `activeTimeFlushIntervalMs` (15 s: how often the browser sends active time), and
  `checkpointTrigger` (`"time_budget"` (default) | `"ai_requests"`) — what opens the completion checkpoint,
  `checkpointAiRequestThresholds` (default `[3, 6]`) — AI-request counts at which the checkpoint opens when
  `checkpointTrigger` is `"ai_requests"`; the last one opens with the peer check-in first (see
  `src/lib/checkpoints.ts`), and session-clock timings (see `src/lib/timing.ts`): `breakPromptMinutes`
  (`[60, 120]`), `breakLengthMinutes` (`5`), `peerCheckinMinutes` (`90`, for the peer check-in
  invitation), and `demoTimeScale` (`1`) — a multiplier on every session-clock timing for testing:
  `0.0167` turns 60 minutes into about 60 seconds, `0.02` puts the breaks at 72 s and 144 s with a 6 s
  break. It doesn't affect task time budgets, which are compared with active task time. Set it back to
  `1` before the study runs.
- `OPENAI_API_KEY` / `OPENAI_MODEL` (in `.env`): credentials and model for the AI proxy and the AI
  interview. `OPENAI_MODEL` defaults to `gpt-5.6-terra` when unset — the same model is used for both
  AI versions' task chat, per the brief.
- `config/interview.json`: `questions`, the fixed guide the end-of-session AI interview (`/interview`)
  works through one at a time. AI/peer-specific questions are skipped per version — see
  `buildInterviewSystemPrompt` in `@/lib/interview`.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /start?sid=...&version=...&peer=<otherSid>` | Creates the session, or resumes it if the sid exists (its stored version is never changed). Sets an `sid` cookie used by all later requests and redirects to the participant's current step (consent, instructions, welcome, or the first task). `peer` manually pairs this session for the peer check-in — hand out two `/start` links with `peer` pointing at each other's `sid`. |
| `GET /consent` | Consent page (placeholder text): Consent or Decline. |
| `GET /exit` | Shown after declining consent. |
| `GET /instructions` | Version-specific instructions and the understanding check. |
| `GET /welcome` | "Welcome to Frame", brief link, Start work. |
| `GET /brief?from=&taskId=` | Frame Marketing Brief, opened in a new tab from task pages and the welcome page. "Download PDF" prints the same content with print styles (Save as PDF). Logs `brief_open`. |
| `GET /task/[taskId]` | Task page: task text, brief link, editor, AI chat pane (hidden for `none`). Redirects to the current step until work has started. |
| `GET /survey` | "Continue to survey": redirects to `qualtricsUrl` with `?sid=` appended. |
| `GET /survey-placeholder` | Local stand-in for the Qualtrics survey (the default `qualtricsUrl`). Replace before the study runs. |
| `GET /interview` | End-of-session AI interview. Every version, including `none`. Not gated on `endedAt`. |
| `GET /complete` | Static completion page; "Finish interview" lands here. |
| `POST /api/consent` | `{ choice: "consent" \| "decline" }` → `{ next }`. |
| `POST /api/instructions/check` | `{ answers: { [questionId]: optionIndex } }` → `{ allCorrect, results, next }`. |
| `POST /api/work/start` | Start work: sets `workStartedAt` if not set yet → `{ next }`. |
| `POST /api/draft` | Autosave `{ taskId, content, trigger }`. |
| `POST /api/snapshot` | Save plus interval snapshot `{ taskId, content }`. |
| `POST /api/task/complete` / `reopen` | Change task status `{ taskId, content? }`. `complete` also takes `answers` (completion questions), logged first. |
| `POST /api/session/end` | End work: saves, snapshots every draft, sets `endedAt`. |
| `POST /api/events` | Browser interaction events (allow-listed types only). |
| `POST /api/ai` | AI proxy `{ taskId, message }`. Hidden/unused in the `none` version. |
| `POST /api/pause` | Pause or resume `{ taskId, action: "pause" \| "resume", reason?: "manual" \| "break", breakIndex? }`. |
| `POST /api/active-time` | Active-time heartbeat `{ taskId, deltaMs, reason }`. |
| `GET /api/effort?taskId=` | `{ activeMs, aiRequestCount, revisionCount }` for a task. |
| `POST /api/plan` | Create or edit a task plan `{ taskId, purpose, goodEnough, timeBudgetMinutes }` (`taskPlan` versions only). |
| `POST /api/budget-checkpoint` | Time-budget checkpoint: `{ taskId, shown: true, budgetMinutes, activeMs }` when shown (once per task), or `{ taskId, action: "finish" \| "continue" \| "pause" \| "flag", note? }` (`checkpoints` versions with `checkpointTrigger: "time_budget"`). |
| `POST /api/break-prompt` | `{ taskId, breakIndex, status: "shown" \| "skipped", reason? }` or `{ taskId, breakIndex, choice: "break" \| "keep_working" }` (`breakPrompts` versions only). |
| `POST /api/checkpoint` | AI-request checkpoint: record a decision `{ taskId, index, action: "finish" \| "continue" \| "pause" \| "flag", note? }` (`checkpoints` versions only; `note` required for `continue`). |
| `GET /api/peer?taskId=` | `{ peerSessionId, available, messages }` for the peer check-in room (`peerChat` versions only). |
| `POST /api/peer` | `{ taskId, text }` to send a peer message, or `{ taskId, index, end: "returned" \| "declined" \| "left" }` to close the check-in stage. |
| `GET /api/peer-checkin-v2` | `{ peerSessionId, available, messages }` for the v2 voice room (`peerChat` versions only; session-scoped, not per-task). |
| `POST /api/peer-checkin-v2` | `{ shown: true }` (once, logs it was shown) · `{ audioBase64, mimeType, durationMs }` or `{ text }` to send a message · `{ end: "returned" \| "declined" \| "left" \| "peer_unavailable" }` to close the room. |
| `POST /api/interview` | `{ message }` to talk, or `{ finish: true }` to log that the interview ended. Every version; works on an ended session. |

## Saving behavior

- The editor autosaves every 3 s when the text changed, on blur, and when the tab is hidden or closed
  (`sendBeacon`). The indicator shows **Saving… / Saved / Not saved**.
- Unsaved text is also backed up in `localStorage`. On load, the editor restores the backup if the server
  copy is older, so a refresh never loses text, even when the final save arrives after the page reloads.
- `revisionCount` increases only when the saved content differs from the stored content.
- A completed task is read-only until it is reopened. After **End work** the session is closed for editing.
- Switching tasks in the sidebar saves the current draft and active time first, then loads the other task.

## Task workflow

- **Navigation**: the sidebar lists every task with its required/optional label and status. Participants
  can move between tasks freely.
- **End work** (sidebar): if any required task isn't complete, a dialog lists those tasks but still allows
  ending.
- **Pause / resume** (all versions): hides the task and side panels and stops the active-time clock.
  The pause is session-wide and survives refreshes and task switches. The current state is the latest
  `task_pause` / `task_resume` event.
- **Task plan** (`taskPlan`): before the first edit of each task, a form covers the editor asking for the
  deliverable's purpose, what "good enough" looks like, and a time budget in minutes. The editor is locked
  until it's saved. The plan is then shown in a collapsible, editable panel.
- **Completion questions** (all versions): **Mark task complete** opens a short form — "Why do you consider
  this task complete?" and "Is it good enough?" (Yes / Mostly / No, plus optional text). Skipping is
  allowed. Answers are logged as `task_completion_answers`, then the task is completed as before;
  reopening and completing again logs a new set, so earlier answers stay in the log.
- **Frame Marketing Brief**: every task page has a "Frame Marketing Brief" link in the sidebar that opens
  `/brief` in a new tab, which has a "Download PDF" button (print-to-PDF of the same content). Both are
  kept until the PI chooses one.

### Treatment prompts (sustainable)

Screen copy is from the PI's Treatment_Prompts document. The draft is saved before any prompt opens, only
one prompt is open at a time (`claimPrompt` in `Workspace.tsx`), and no prompt opens after End work.

- **Time-budget checkpoint** (`checkpoints`, `checkpointTrigger: "time_budget"`): a centered pop-up
  ("Check your progress") once per task when the active time shown in the effort panel reaches the
  plan's current time budget. Four equal buttons: **Mark task complete** (the completion questions,
  inside the same pop-up), **Continue working**, **Pause** (the usual pause screen), **Flag for later**
  (optional note; "Flagged for later" and the note then show above the draft). Shown state is persisted
  (`checkpoint_shown`), so a refresh or a later budget edit never shows it again for that task. Esc
  doesn't dismiss it. Decisions are `checkpoint_resolved` with `trigger: "time_budget"`.
- **Break prompts** (`breakPrompts`): a centered pop-up ("Time for a 5-minute break") at each
  `breakPromptMinutes` time on the session clock (from Start work, paused time included). If the
  participant is already paused then, the break is skipped and not rescheduled. **Take a 5-minute
  break** opens the pause screen with "Break time: mm:ss"; after `breakLengthMinutes` it reads "Your
  5-minute break is over. Return when you're ready." and stays paused until **Return to work**. **Keep
  working** dismisses it. Which breaks were handled is persisted, so a refresh doesn't repeat one. If a
  task page wasn't open when a break came due, it shows when one next opens; if a later break is also
  due by then, the earlier one is logged as skipped (`missed`).

### Session clock

`Session.workStartedAt` is set once by Start work and never reset. Elapsed time includes pauses.

- Server: `getSessionClock(sessionId)` in `@/lib/sessionClock` → `{ workStartedAt, elapsedMs }` or `null`.
- Browser (task page): `useWorkspace().sessionElapsedMs()` (corrected for browser clock skew).
- Timings: `BREAK_PROMPT_TIMES_MS`, `BREAK_LENGTH_MS`, `PEER_CHECKIN_MS` in `@/lib/timing` (already
  scaled by `demoTimeScale`).

### AI-request checkpoint (alternative trigger)

- **Completion checkpoint** (`checkpoints`, `checkpointTrigger: "ai_requests"`): a modal dialog opens automatically once the AI request count
  for the task reaches a configured threshold (`checkpointAiRequestThresholds`). It shows the plan's
  "good enough" threshold and four choices — Finish task (completes it), Continue (requires a reason),
  Pause (uses the usual pause), or Flag for later (optional note) — logged as `checkpoint_resolved`.
  Dismissing with Esc just re-prompts later (state isn't persisted across dismissals within the visit).
  At the **last** threshold (`peerChat` versions), the dialog opens on the peer check-in first.
- **Peer check-in** (`peerChat`): a private two-person text room, manually paired via `/start?...&peer=
  <otherSid>` (see below) — reuses the Event log like the AI conversation, so no new table. Polls every
  2.5 s while open. Declining, leaving, or the peer not being available (never paired, or hasn't opened
  their own link yet) are all handled and logged (`peer_checkin_ended`), then the dialog moves on to the
  completion checkpoint's stopping choices. With the default `checkpointTrigger: "time_budget"` this
  room isn't opened by the AI-request checkpoint at all — see peer check-in v2 below, which is what
  actually invites participants under the default trigger.

### Peer check-in v2 (treatment prompt 3)

- **Peer check-in v2** (`peerChat`): invited once, automatically, at `peerCheckinMinutes` (default 90:00)
  on the session clock (`@/lib/timing`, `@/lib/sessionClock`) — including while paused, unlike break
  prompts, per the treatment prompt doc ("the invite goes to everyone still working"). Uses the same
  `claimPrompt("peer-checkin-v2")` lock as the other treatment prompts, so it never stacks with the
  budget checkpoint or a break prompt; after the room closes, releasing the lock is enough for the
  budget checkpoint to open next if it's due (`src/app/task/[taskId]/PeerCheckinV2.tsx`).
- A private room with the manually paired peer (same pairing as the v1 room — `/start?...&peer=`),
  but **session-scoped, not task-scoped**: the invitation isn't tied to whichever task happens to be
  open, so messages use `taskId: null` and are visible regardless of which task page either side is on.
  Reuses `getPeerSessionId`/`isPeerAvailable` from `@/lib/peer`; its own helpers are in
  `@/lib/peerVoice`.
- **Voice-first, with a text fallback**: "Record a voice message" uses `MediaRecorder` (capped at 60s
  client-side, 90s server-side), sent as a `data:` URI (base64) and played back with a native
  `<audio controls>` element — no file storage, same "everything in the Event log" approach as the
  rest of the app. If the mic is unavailable or permission is denied, a text box works instead; a
  message is a `peer_voice_message` event with `kind: "voice"` or `"text"`.
- "Shown" and "ended" are each persisted once per session (`peer_checkin_v2_shown` /
  `peer_checkin_v2_ended`), so a refresh mid-conversation reopens the room, but it's never invited a
  second time. Esc doesn't dismiss it. Declining, leaving, and an unavailable peer are all handled and
  logged, same outcomes as the v1 room.

## Effort metrics

Logged in every version; shown in the effort panel only where `effortDisplay` is on.

- **Active time** per task (`TaskActiveTime.activeMs`): time with the task page open, the tab visible and
  the session not paused. The browser sends increments every 15 s, on pause and navigation, and by beacon
  when the tab is hidden or closed. A single increment over 10 min is clamped and logged as
  `active_time_clamped`. Idle time with the tab visible still counts.
- **AI requests** per task: count of `ai_assistant_message` events, i.e. requests that got a reply. A
  failed call (`ai_error`) doesn't count — it produced no reply and no change to the participant's work,
  so it shouldn't inflate this metric or trigger a checkpoint. The raw attempt is still in the event log
  via `ai_user_message`/`ai_error`, just not in this count.
- **Revisions**: `Draft.revisionCount`.

`ChatPane` calls `notifyAiRequestSettled(taskId)` after each request, which re-reads the count from the
server (`countAiRequests` in `@/lib/effort`) and notifies `onAiRequestCount` subscribers — both the
effort panel and the completion checkpoint (`src/app/task/[taskId]/Checkpoint.tsx`) use this.

## Schema

See `prisma/schema.prisma`.

- **Session**: `sessionId` (from `?sid=`, unique), `version`, `createdAt`, `endedAt` (End work, or
  declining consent), `workStartedAt` (Start work; added in migration `20261016024242_work_started_at`).
- **Draft**: one row per (`sessionId`, `taskId`): current `content`, `status`
  (`not_started` | `in_progress` | `complete`), `updatedAt`, `revisionCount`.
- **Snapshot**: copies of draft content with `reason`: `interval` (every 5 min while a task is open),
  `complete`, `reopen`, `end_work`.
- **TaskPlan**: one row per (`sessionId`, `taskId`): `purpose`, `goodEnough`, `timeBudgetMinutes`,
  `createdAt`, `updatedAt`. Edits overwrite the row; the history is in `task_plan_*` events.
- **TaskActiveTime**: one row per (`sessionId`, `taskId`): `activeMs`, `updatedAt`.
- **Event**: append-only log: `sessionId`, `version`, `taskId` (nullable), `eventType`, `payload` (JSON),
  `timestamp` (server time). SQLite triggers reject any UPDATE or DELETE on this table.

## Event types

| eventType | Source | Payload |
| --- | --- | --- |
| `session_start` | server | `userAgent` |
| `session_resume` | server | `requestedVersion`, `versionMismatch`, `userAgent` |
| `session_end` | server | `alreadyEnded`, `incompleteRequired` (task ids), per-task `status` / `activeMs` / `aiRequestCount` / `revisionCount` |
| `survey_redirect` | server | `from` |
| `consent_given` / `consent_declined` | server (`/api/consent`) | — |
| `understanding_check_attempt` | server (`/api/instructions/check`, every attempt) | `attempt`, `allCorrect`, `answers: [{ id, choice, choiceText, correct }]` |
| `understanding_check_passed` | server (all answers correct) | `attempts` |
| `work_start` | server (`/api/work/start`, first time only) | `workStartedAt` |
| `brief_open` | server (`/brief` page load; `taskId` set when opened from a task) | `from` (`task` / `welcome` / null) |
| `brief_download` | browser (Download PDF clicked) | `clientTs` |
| `task_completion_answers` | server (`/api/task/complete`, before `task_complete`) | `skipped`, `why`, `goodEnough` (`yes`/`mostly`/`no`/null), `goodEnoughNote`, `source` (`editor`/`checkpoint`) |
| `task_open` | server | `status`, `revisionCount`, `length` |
| `draft_save` | server (only when content changed) | `trigger`, `revisionCount`, `length` |
| `task_complete` / `task_reopen` | server | `previousStatus`, `revisionCount`, `length` |
| `editor_focus` / `editor_blur` | browser | `clientTs` (+ `length` on blur) |
| `visibility_hidden` / `visibility_visible` | browser | `clientTs` |
| `task_close` | browser (page unload) | `clientTs` |
| `ai_user_message` | server (`/api/ai`, before calling the model) | `text`, `model` |
| `ai_assistant_message` | server (`/api/ai`, on a successful reply) | `text`, `model`, `usage` (OpenAI's token-usage object, for per-participant cost — or `null`) |
| `ai_error` | server (`/api/ai`, on a failed call) | `message`, `model` |
| `task_pause` | server (`/api/pause`, on a state change) | `clientTs`, `reason` (`manual`/`break`), `breakIndex` (breaks only) |
| `task_resume` | server (`/api/pause`, on a state change) | `clientTs`, `pausedMs`, `pausedOnTaskId` |
| `task_plan_submitted` | server (`/api/plan`, first save) | `purpose`, `goodEnough`, `timeBudgetMinutes` |
| `task_plan_updated` | server (`/api/plan`, edit with changes) | `changes: { field: { from, to } }` |
| `active_time_clamped` | server (`/api/active-time`) | `reportedMs`, `acceptedMs`, `reason` |
| `end_work_prompt` | browser (End work dialog opened) | `incompleteRequired`, `clientTs` |
| `end_work_cancel` | browser (dialog dismissed) | `incompleteRequired`, `clientTs` |
| `checkpoint_shown` | server (`/api/budget-checkpoint`, once per task) | `trigger: "time_budget"`, `budgetMinutes`, `activeMs` |
| `checkpoint_resolved` | server (`/api/checkpoint` or `/api/budget-checkpoint`) | AI-request trigger: `index`, `action` (`finish`/`continue`/`pause`/`flag`), `note?`. Time-budget trigger: `trigger: "time_budget"`, `action`, `note?` (no `index`) |
| `break_prompt_shown` | server (`/api/break-prompt`) | `breakIndex`, `sessionElapsedMs` |
| `break_prompt_skipped` | server (`/api/break-prompt`) | `breakIndex`, `reason` (`paused`/`missed`), `sessionElapsedMs` |
| `break_prompt_choice` | server (`/api/break-prompt`) | `breakIndex`, `choice` (`break`/`keep_working`), `sessionElapsedMs` |
| `break_ended` | server (`/api/pause`, resuming from a break) | `breakIndex`, `durationMs`, `fullBreakTaken` |
| `peer_paired` | server (`/start?...&peer=`) | `peerSessionId` |
| `peer_message` | server (`/api/peer`) | `text`, `peerSessionId` (the recipient) |
| `peer_checkin_ended` | server (`/api/peer`) | `index`, `outcome` (`returned`/`declined`/`left`/`peer_unavailable`) |
| `peer_checkin_v2_shown` | server (`/api/peer-checkin-v2`, once per session) | — |
| `peer_voice_message` | server (`/api/peer-checkin-v2`) | `kind` (`voice`/`text`), `audioBase64`+`mimeType`+`durationMs` or `text`, `peerSessionId` (the recipient) |
| `peer_checkin_v2_ended` | server (`/api/peer-checkin-v2`, once per session) | `outcome` (`returned`/`declined`/`left`/`peer_unavailable`) |
| `interview_user_message` | server (`/api/interview`, before calling the model) | `text`, `model` |
| `interview_assistant_message` | server (`/interview` page load for the opening line; `/api/interview` for replies) | `text`, `model`; `usage` is only present on replies, not the static opening line |
| `interview_error` | server (`/api/interview`, on a failed call) | `message`, `model` |
| `interview_finished` | server (`/api/interview`, `{ finish: true }`) | — |

## AI proxy and AI interview

Two code paths talk to OpenAI, both through `callChatModel` in `@/lib/ai`:

- `POST /api/ai` with `{ taskId, message }` — the task chat pane (`taskPlan`/`ai` versions only).
  Builds a system prompt from the Frame Marketing Brief (`BRIEF` from `@/lib/config`, flattened to
  plain lines by `formatBrief`), the task instructions, and the participant's current saved draft
  (`buildSystemPrompt` in `@/lib/ai`), plus prior turns rebuilt from the event log — the conversation
  needs no separate table, so it survives a refresh or switching tasks and back. For the `sustainable`
  version, the prompt also tells the model not to routinely invite further revisions, per the brief's
  cognitive-closure manipulation. `standard` gets the same model with no such restriction.
  Logs `ai_user_message` before the call and `ai_assistant_message` (or `ai_error` on failure) after.
- `POST /api/interview` with `{ message }` — the end-of-session interview (`/interview`), every
  version including `none`. Walks the fixed `config/interview.json` guide one question at a time
  (`buildInterviewSystemPrompt` in `@/lib/interview`), skipping AI/peer-specific questions for
  versions that don't have them. The opening line is static (not model-generated) so the interview
  starts immediately. Logs `interview_user_message`/`interview_assistant_message`/`interview_error`,
  the same pattern as the task chat pane.
  **`config/interview.json` currently only has question 1 of the PI's guide ("What was your experience
  with the tasks?") — the other four are pending.**

Both AI versions (and the interview, in every version) use the same `OPENAI_MODEL`. Both return `502`
with a friendly message if the call fails (including a missing `OPENAI_API_KEY`); the chat UI surfaces
that inline in either case.

`callChatModel` also:
- Logs OpenAI's `usage` object (prompt/completion token counts) on every successful reply, for
  per-participant cost tracking — see `ai_assistant_message`/`interview_assistant_message` above.
- Sends `temperature: 0.4` by default, but some reasoning-tier models reject a custom temperature
  (a `400` with `error.param: "temperature"`). On that specific error it retries once without the
  parameter rather than failing the request — untested against a real `gpt-5.6-terra` call, since no
  `OPENAI_API_KEY` has been available to verify it against the live API yet.

## Logging from server code

```ts
import { logEvent } from "@/lib/logEvent";

await logEvent(sessionId, version, taskId, "ai_user_message", { text, model });
```

`logEvent(sessionId, version, taskId | null, eventType, payload)` appends one Event row and throws on failure.
Get the current participant's `sessionId` and `version` in a route handler with
`getCurrentSession()` from `@/lib/session` (it reads the `sid` cookie).
