# URAP Research Prototype

Browser workspace for a randomized experiment on how people work with generative AI on writing tasks.

Participants complete writing tasks in the browser. Drafts, snapshots and an append-only event log are
stored for analysis. One codebase serves all three study versions (`none`, `standard`, `sustainable`),
chosen per session by the `version` URL parameter.

## Stack

- Next.js 16 (App Router, TypeScript). API routes are the backend.
- Prisma 7 with SQLite locally (`better-sqlite3` driver adapter).
- No styling libraries; plain CSS in `src/app/globals.css`.

## Local setup

Requires Node.js 20+ and Git.

**Mac / Linux** (Terminal):

```bash
git clone https://github.com/666Kevinyang666/-URAP-Research-Fullstack-development.git urap-prototype
cd urap-prototype
cp .env.example .env   # DATABASE_URL defaults to file:./dev.db if left empty
npm install            # also runs `prisma generate`
npm run dev            # applies migrations, then starts http://localhost:3000
```

**Windows** (Git Bash): the same commands:

```bash
git clone https://github.com/666Kevinyang666/-URAP-Research-Fullstack-development.git urap-prototype
cd urap-prototype
cp .env.example .env
npm install
npm run dev
```

(In PowerShell, use `Copy-Item .env.example .env` instead of `cp`.) The server keeps running in that
terminal; stop it with Ctrl+C.

`.env` settings (the file is gitignored; never commit it):

| Setting | Use |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | The AI chat and interview. `OPENAI_MODEL=mock`, or an empty key, gives canned replies without calling OpenAI (logged as model `mock`). Otherwise the model defaults to `gpt-5.6-terra`. |
| `DATABASE_URL` | SQLite file, default `file:./dev.db`. |
| `DEMO_PASSWORD`, `ADMIN_PASSWORD` | Password protection, for `npm run demo`. Leave `DEMO_PASSWORD` empty for local dev (no password). |
| `DEMO_TIME_SCALE` | Optional session-clock speed-up, overriding `demoTimeScale` in `config/study.json` (see below). |

Open a session at `http://localhost:3000/start?sid=TEST123&version=standard`, or create links at
`http://localhost:3000/admin`.

## Running the demo

`npm run demo` runs a password-protected copy of the app from your laptop and shares it through a free,
private HTTPS link (a Cloudflare quick tunnel: no account, no cost).

1. Once: add `DEMO_PASSWORD=...` and `ADMIN_PASSWORD=...` to `.env`. The demo refuses to start without
   both. **Never put the passwords in the README, the repo, or a chat with the link** — send the
   password separately.
2. Stop `npm run dev` if it's running (the demo needs port 3000).
3. Run `npm run demo`. It checks `.env`, builds the app, applies migrations to a separate demo database
   (`demo.db`, gitignored; `dev.db` is untouched), starts the app with `DEMO_TIME_SCALE=0.05` unless you
   set one, starts the tunnel (`npx cloudflared tunnel --url http://localhost:3000`; the first run
   downloads cloudflared), and prints the `https://<random>.trycloudflare.com` link and its `/admin` link.
4. Open the `/admin` link and log in with any username and `ADMIN_PASSWORD`. Click **Create demo set**
   (one `none` link, one `standard` link, and two `sustainable` links paired with each other for the peer
   check-in), or pick a version and an optional sid and click **Create link**. Copy each link with its
   **Copy** button and send one link per person, plus `DEMO_PASSWORD`. A link opened a second time
   resumes the same session.
5. Press **Ctrl+C** to stop the app and the tunnel. The link stops working as soon as the command stops,
   and every run gets a new link. Data stays in `demo.db` between runs; `npm run demo:reset` deletes it.

With `DEMO_TIME_SCALE=0.05` the session clock runs 20× faster: break prompts at 3:00 and 6:00 after
Start work, the peer check-in at 4:30, and a 15-second break. Task time budgets aren't scaled (they
compare against active task time), so set a 1-minute budget in the plan form to see the budget
checkpoint after a minute of work. Run `DEMO_TIME_SCALE=1 npm run demo` for real timings.

**Password protection** (`src/proxy.ts`, Next 16's request-interception file, formerly `middleware.ts`;
rules in `src/lib/basicAuth.ts`): when `DEMO_PASSWORD` is set, every route needs HTTP Basic Auth (any
username). Participant routes accept `DEMO_PASSWORD` or `ADMIN_PASSWORD`; `/admin` accepts only
`ADMIN_PASSWORD`. Browsers resend the password on every request, so autosave beacons, peer polling,
voice uploads and survey return links keep working. With `DEMO_PASSWORD` unset, auth is off (`/admin`
still needs `ADMIN_PASSWORD` if that one is set).

## Participant flow

Every version follows the same path; only flagged features differ inside the task pages.

1. `/start?sid=...&version=...` creates or resumes the session and sends the participant to their
   current step (`getJourneyStage` in `src/lib/journey.ts`), so a resumed link never restarts the flow.
2. `/consent`: Consent or Decline. Decline ends the session (`endedAt`) and shows `/exit`.
   **The consent text is a placeholder** and must be replaced with the approved form.
3. Start-of-session survey: `/survey?survey=baseline` → Qualtrics (`baselineSurveyUrl`; until it exists,
   `/survey-placeholder`) → `/survey/return?survey=baseline&sid=...` → instructions. See
   [Qualtrics setup](#qualtrics-setup).
4. `/instructions`: version-specific instructions, then a 3-question understanding check. A wrong
   answer shows the correct one and the participant retries until all are correct.
5. `/welcome`: "Welcome to Frame", a link to the brief, and **Start work**, which sets
   `Session.workStartedAt` once. This starts the session clock (breaks, peer check-in).
6. `/task/[taskId]`: the five tasks (task pages redirect to the current step until work has started).
   **Mark task complete** first asks the completion questions. **End work** closes editing.
7. End-of-session survey: `/survey?survey=end` → Qualtrics (`endSurveyUrl`) →
   `/survey/return?survey=end&sid=...` → `/interview` (five questions, each with one AI follow-up) →
   `/complete`.

A resumed `/start` link, or any page opened out of order, goes to the participant's current step.

Useful commands:

| Command | What it does |
| --- | --- |
| `npx prisma studio --url "file:///<absolute path>/dev.db"` | Browse the database. Prisma 7 Studio rejects the relative `file:./dev.db` URL, so pass an absolute one. |
| `npx prisma migrate dev --name <name>` | Create a migration after editing `prisma/schema.prisma` |
| `npm run typecheck` | TypeScript check |

Never commit `.env`, `demo.db`, passwords, API keys, `.inputs/`, or real participant text. This repo is public.

## Versions and feature flags

`src/lib/features.ts` maps each version to the features it gets. Check flags (`getFeatures(version)`)
instead of comparing version strings. Layout and editor size are identical in every version; the side
column is always rendered; in `none` it only says "AI assistance is not available in this session."

| Flag | none | standard | sustainable | What it controls |
| --- | --- | --- | --- | --- |
| `ai` | – | ✓ | ✓ | AI chat pane |
| `taskPlan` | – | – | ✓ | Plan form before the first edit of each task, plan panel, `POST /api/plan` |
| `effortDisplay` | – | – | ✓ | Effort panel (metrics are logged in every version) |
| `checkpoints` | – | – | ✓ | Completion checkpoint: time-budget pop-up (`POST /api/budget-checkpoint`) or AI-request dialog (`POST /api/checkpoint`), per `checkpointTrigger` |
| `peerChat` | – | – | ✓ | Peer check-in: v2 voice room at `peerCheckinMinutes` on the session clock (`POST`/`GET /api/peer-checkin-v2`), plus the legacy text room inside the AI-request checkpoint dialog (`POST`/`GET /api/peer`) |
| `breakPrompts` | – | – | ✓ | Break prompts at `breakPromptMinutes` on the session clock, `POST /api/break-prompt` |

## Qualtrics setup

Both surveys leave the app with the participant's `sid` and come back to it.

1. **Survey URLs**: put each survey's anonymous link in `config/study.json`: `baselineSurveyUrl` (after
   consent, before the instructions) and `endSurveyUrl` (after End work, before the interview). The app
   adds `?sid=<sid>&return_url=<this app's /survey/return link>` to it.
2. **Embedded data**: in each survey's Survey Flow, add an **Embedded Data** element at the top with a
   field named exactly `sid` (leave the value empty, so Qualtrics reads it from the URL). Add a second
   field `return_url` the same way if you use option B below. `sid` then appears as a column in the
   Qualtrics export, matching the `sid` in this app's export.
3. **End-of-survey redirect**: Survey options → End of survey → *Redirect to a URL*:
   - Option A, a fixed host (a permanent deployment):
     - baseline survey: `https://<app host>/survey/return?survey=baseline&sid=${e://Field/sid}`
     - end survey: `https://<app host>/survey/return?survey=end&sid=${e://Field/sid}`
   - Option B, any host (works with the demo tunnel, whose link changes every run): `${e://Field/return_url}`
     in both surveys. The app sends the right link for each survey.

`/survey/return` logs `survey_returned`, restores the participant's session cookie (in case the survey
ran in another browser tab or profile) and continues to the next step. A return link for a step the
participant isn't on doesn't skip anything ahead.

## Changing study content

All study content is in `config/`; edit the JSON and restart (`npm run dev`, or re-run `npm run demo`).

| What | File |
| --- | --- |
| Tasks (text, order, required/optional) | `config/tasks.json` |
| Frame Marketing Brief | `config/brief.json` |
| "Welcome to Frame" page | `config/welcome.json` |
| Instructions and understanding check (per version) | `config/instructions.json` |
| Interview questions (and which versions get each) | `config/interview.json` |
| Survey URLs, prompt timings (breaks, peer check-in), checkpoint trigger, autosave/snapshot intervals | `config/study.json` |
| Which version gets which feature | `src/lib/features.ts` |
| Consent text | `src/app/consent/page.tsx` (placeholder) |
| Treatment prompt wording | `src/app/task/[taskId]/BudgetCheckpoint.tsx`, `BreakPrompt.tsx`, `PeerCheckinV2.tsx` |

Details of each file are below.

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
- `config/study.json`: `baselineSurveyUrl` and `endSurveyUrl` (the two Qualtrics links; both default to
  `/survey-placeholder`, a local stand-in page that shows the sid and has a **Return to study** button.
  Replace them before the study runs; see [Qualtrics setup](#qualtrics-setup)), `autosaveIntervalMs` (3 s), `snapshotIntervalMs` (5 min),
  `activeTimeFlushIntervalMs` (15 s: how often the browser sends active time), and
  `checkpointTrigger` (`"time_budget"` (default) | `"ai_requests"`) — what opens the completion checkpoint,
  `checkpointAiRequestThresholds` (default `[3, 6]`) — AI-request counts at which the checkpoint opens when
  `checkpointTrigger` is `"ai_requests"`; the last one opens with the peer check-in first (see
  `src/lib/checkpoints.ts`), and session-clock timings (see `src/lib/timing.ts`): `breakPromptMinutes`
  (`[60, 120]`), `breakLengthMinutes` (`5`), `peerCheckinMinutes` (`90`, for the peer check-in
  invitation), and `demoTimeScale` (`1`) — a multiplier on every session-clock timing for testing:
  `0.0167` turns 60 minutes into about 60 seconds, `0.02` puts the breaks at 72 s and 144 s with a 6 s
  break. It doesn't affect task time budgets, which are compared with active task time. Set it back to
  `1` before the study runs. The `DEMO_TIME_SCALE` environment variable overrides it without editing the
  file (`npm run demo` uses `0.05`); it's built into the app at `next build` / `next dev` start.
- `OPENAI_API_KEY` / `OPENAI_MODEL` (in `.env`): credentials and model for the AI proxy and the AI
  interview. `OPENAI_MODEL` defaults to `gpt-5.6-terra` when unset — the same model is used for both
  AI versions' task chat, per the brief.
- `config/interview.json`: the end-of-session interview guide. `questions` is a list of
  `{ id, text, versions?, draft? }`: `versions` limits a question to some versions (the AI question is
  asked in `standard` and `sustainable`, the check-in question only in `sustainable`), and `draft: true`
  marks questions 2–5, which are **drafts pending PI review** (question 1 is the PI's). `mockFollowUp` is
  the follow-up used in mock mode. Question 1 must apply to every version, since the opening line asks it.

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
| `GET /survey?survey=baseline\|end` | Redirects to `baselineSurveyUrl` or `endSurveyUrl` with `?sid=` and `return_url` added. The baseline survey is only reachable at that step. |
| `GET /survey/return?survey=baseline\|end&sid=` | Where a survey sends the participant back: logs `survey_returned`, restores the `sid` cookie, redirects to the next step. |
| `GET /survey-placeholder?survey=&sid=` | Local stand-in for both Qualtrics surveys (the default URLs): shows the sid and a **Return to study** button. Replace before the study runs. |
| `GET /admin` | Researcher admin (`ADMIN_PASSWORD`): create links, sessions table, export. Not part of the participant flow. |
| `POST /admin/links` | `{ version, sid? }` (sid auto-generated if blank) or `{ demoSet: true }` → `{ links: [{ sid, version, peer, url }] }`. |
| `GET /admin/export?format=json\|csv&table=&sid=` | Data export; see [Data and export](#data-and-export). |
| `GET /interview` | End-of-session AI interview. Every version, including `none`. Not gated on `endedAt`; `/start` sends a participant here once they're back from the end survey. |
| `GET /complete` | Static completion page; "Finish interview" lands here. |
| `POST /api/consent` | `{ choice: "consent" \| "decline" }` → `{ next }` (the baseline survey, or `/exit`). |
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
  (`checkpoint_shown`) per reopen "episode": a refresh or a later budget edit never re-shows it within
  the same episode, but **reopening a completed task starts a fresh one** — resolves PR #3's open
  question 4 ("should it ever fire on a completed task that was reopened?") in favor of yes, since a
  reopened, already-over-budget task is exactly the post-viability persistence this study measures; see
  `getBudgetCheckpointState` in `@/lib/budgetCheckpoint`. Esc doesn't dismiss it. Decisions are
  `checkpoint_resolved` with `trigger: "time_budget"`.
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
| `survey_redirect` | server (`/survey`) | `survey` (`baseline`/`end`), `from` |
| `survey_returned` | server (`/survey/return`, once per survey) | `survey` (`baseline`/`end`) |
| `admin_link_created` | server (`/admin/links`; logged under the new sid, before the session exists) | `path` (the `/start` link), `peer` |
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
| `ai_assistant_message` | server (`/api/ai`, on a successful reply) | `text`, `model` (`mock` in mock mode), `usage` (OpenAI's token-usage object, for per-participant cost — or `null`) |
| `ai_error` | server (`/api/ai`, on a failed call) | `message`, `model` |
| `task_pause` | server (`/api/pause`, on a state change) | `clientTs`, `reason` (`manual`/`break`), `breakIndex` (breaks only) |
| `task_resume` | server (`/api/pause`, on a state change) | `clientTs`, `pausedMs`, `pausedOnTaskId` |
| `task_plan_submitted` | server (`/api/plan`, first save) | `purpose`, `goodEnough`, `timeBudgetMinutes` |
| `task_plan_updated` | server (`/api/plan`, edit with changes) | `changes: { field: { from, to } }` |
| `active_time_clamped` | server (`/api/active-time`) | `reportedMs`, `acceptedMs`, `reason` |
| `end_work_prompt` | browser (End work dialog opened) | `incompleteRequired`, `clientTs` |
| `end_work_cancel` | browser (dialog dismissed) | `incompleteRequired`, `clientTs` |
| `checkpoint_shown` | server (`/api/budget-checkpoint`, once per reopen episode) | `trigger: "time_budget"`, `budgetMinutes`, `activeMs` |
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
| `interview_user_message` | server (`/api/interview`, before any model call) | `text`, `model` |
| `interview_assistant_message` | server (`/interview` page load for the opening line; `/api/interview` for replies) | `text`, `model` (`guide` for scripted questions and the closing line, else the AI model or `mock`), `usage` (replies only; `null` for scripted or mock), `step: { kind: "question" \| "follow_up" \| "closing", index }` (replies only; `index` into this version's questions) |
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
  version including `none`. The server walks the `config/interview.json` guide (`nextInterviewStep` in
  `@/lib/interview`): question 1 (the static opening line) → the participant answers → **one short AI
  follow-up** based on their answer (`buildInterviewSystemPrompt`) → they answer → the next question,
  asked word for word without a model call → … → a closing line pointing to **Finish interview**.
  Questions that don't apply to the version are skipped (`none`: 3 questions, `standard`: 4,
  `sustainable`: 5). A failed model call logs no reply, so the participant's retry stays on the same
  step. Logs `interview_user_message`/`interview_assistant_message` (with `step`)/`interview_error`.

Both AI versions (and the interview, in every version) use the same `OPENAI_MODEL`. Both return `502`
with a friendly message if the call fails; the chat UI surfaces that inline in either case.

**Mock mode**: with `OPENAI_MODEL=mock`, or no `OPENAI_API_KEY`, `callChatModel` returns a canned reply
without calling OpenAI, with `usage: null`, and `AI_MODEL` (logged on every AI event) is `"mock"`. The
task chat says it's a mock reply; interview follow-ups are "Thanks, can you say a bit more about that?",
so the interview still runs through all its questions.

`callChatModel` also:
- Logs OpenAI's `usage` object (prompt/completion token counts) on every successful reply, for
  per-participant cost tracking — see `ai_assistant_message`/`interview_assistant_message` above.
- Sends `temperature: 0.4` by default, but some reasoning-tier models reject a custom temperature
  (a `400` with `error.param: "temperature"`). On that specific error it retries once without the
  parameter rather than failing the request — untested against a real `gpt-5.6-terra` call, since no
  `OPENAI_API_KEY` has been available to verify it against the live API yet.

## Data and export

Everything is in one SQLite file (`dev.db` locally, `demo.db` for the demo). Every row is keyed by the
participant's `sid` (`Session.sessionId`), the same value the Qualtrics surveys store as embedded data, so
the app's export and the Qualtrics exports join on `sid`.

From `/admin` → **Export** (or `GET /admin/export`, `ADMIN_PASSWORD`):

- **All data as one JSON file**: `?format=json` → `{ exportedAt, sessionCount, sessions: { <sid>: { session,
  drafts, snapshots, events, task_plans, active_time } } }`. Event payloads are included as JSON.
- **CSV, one table per file**: `?format=csv&table=sessions|drafts|snapshots|events|task_plans|active_time`.
  The first column is always `sid`. `sessions.csv` includes the version, peer, timestamps, journey stage and
  one status column per task; `events.csv` has the payload as a JSON string.
- **One session**: add `&sid=<sid>` to any export, or use the JSON link in the sessions table.

`docs/sample-records/` has a small export from a seeded demo run (fake test text only), showing each
file's format.

Voice messages are stored in the event log as base64 audio (`peer_voice_message`), so they're in the
JSON and `events.csv` exports too. Exports contain participants' writing: treat them as study data.

## Known limitations and next steps for the full research interface

This prototype is for demos and pilot testing. Before running the study:

- **Hosting and data**: move to a permanent host and a managed database after a privacy and security
  review (data location, encryption, access, retention). The demo runs on a laptop; its link lasts only
  while `npm run demo` runs, and SQLite in one file isn't meant for many simultaneous participants.
- **Assignment and recruitment**: random assignment to versions and recruitment links (e.g. from
  Prolific or a participant pool) instead of hand-made links from `/admin`.
- **Surveys**: build the real Qualtrics surveys and set their URLs (see [Qualtrics setup](#qualtrics-setup)).
- **Consent**: replace the placeholder with the IRB-approved consent text.
- **Content still in draft**: the instructions and understanding check (`config/instructions.json`) and
  interview questions 2–5 (`config/interview.json`) need PI review. The tasks are provisional.
- **Peer pairing**: pairs are made by hand (`&peer=`). The study needs automated pairing of participants
  who are online at the same time, and a fallback when a partner drops out.
- **Access control**: Basic Auth with shared passwords is fine for a demo; the study needs per-participant
  links without a shared password and proper researcher accounts for the admin page.
- **Repo visibility**: decide whether the repo stays public before real study content or data handling
  details are added.
- **Scale testing**: load-test with the expected number of simultaneous participants (autosave, polling,
  voice uploads) on the production host.
- **Outputs for blinded review**: export the final drafts without version labels or identifying details,
  in a format the reviewers can grade blind.
- **AI model**: test against the real `gpt-5.6-terra` API (only mock mode has been tested end to end), and
  confirm per-participant cost from the logged `usage`.

## Logging from server code

```ts
import { logEvent } from "@/lib/logEvent";

await logEvent(sessionId, version, taskId, "ai_user_message", { text, model });
```

`logEvent(sessionId, version, taskId | null, eventType, payload)` appends one Event row and throws on failure.
Get the current participant's `sessionId` and `version` in a route handler with
`getCurrentSession()` from `@/lib/session` (it reads the `sid` cookie).
