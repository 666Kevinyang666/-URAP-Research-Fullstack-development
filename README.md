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
| `checkpoints` | – | – | ✓ | Completion checkpoints (Kevin, not built yet) |
| `peerChat` | – | – | ✓ | Peer chat (Kevin, not built yet) |

## Configuration

- `config/tasks.json`: an array of `{ id, title, required, instructions[] }`, shown in this order in
  the task list. `required: false` tasks are optional and don't trigger the End work warning.
  Five placeholder tasks for now: three required (creative, evidence synthesis, strategy), two optional.
  Changing task ids orphans existing rows for the old ids.
- `config/study.json`: `qualtricsUrl` (survey link), `autosaveIntervalMs` (3 s), `snapshotIntervalMs` (5 min),
  `activeTimeFlushIntervalMs` (15 s: how often the browser sends active time).
- `OPENAI_API_KEY` / `OPENAI_MODEL` (in `.env`): credentials and model for the AI proxy. `OPENAI_MODEL`
  defaults to `gpt-5.6-terra` when unset — the same model is used for both AI versions, per the brief.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /start?sid=...&version=...` | Creates the session, or resumes it if the sid exists (its stored version is never changed). Sets an `sid` cookie used by all later requests and redirects to the first task. |
| `GET /task/[taskId]` | Task page: instructions, editor, AI chat pane (hidden for `none`). |
| `GET /survey` | "Continue to survey": redirects to `qualtricsUrl` with `?sid=` appended. |
| `POST /api/draft` | Autosave `{ taskId, content, trigger }`. |
| `POST /api/snapshot` | Save plus interval snapshot `{ taskId, content }`. |
| `POST /api/task/complete` / `reopen` | Change task status `{ taskId, content? }`. |
| `POST /api/session/end` | End work: saves, snapshots every draft, sets `endedAt`. |
| `POST /api/events` | Browser interaction events (allow-listed types only). |
| `POST /api/ai` | AI proxy `{ taskId, message }`. Hidden/unused in the `none` version. |
| `POST /api/pause` | Pause or resume `{ taskId, action: "pause" \| "resume" }`. |
| `POST /api/active-time` | Active-time heartbeat `{ taskId, deltaMs, reason }`. |
| `GET /api/effort?taskId=` | `{ activeMs, aiRequestCount, revisionCount }` for a task. |
| `POST /api/plan` | Create or edit a task plan `{ taskId, purpose, goodEnough, timeBudgetMinutes }` (`taskPlan` versions only). |

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

## Effort metrics

Logged in every version; shown in the effort panel only where `effortDisplay` is on.

- **Active time** per task (`TaskActiveTime.activeMs`): time with the task page open, the tab visible and
  the session not paused. The browser sends increments every 15 s, on pause and navigation, and by beacon
  when the tab is hidden or closed. A single increment over 10 min is clamped and logged as
  `active_time_clamped`. Idle time with the tab visible still counts.
- **AI requests** per task: count of `ai_user_message` events. These are logged before the model call,
  so **requests that end in an error count too**.
- **Revisions**: `Draft.revisionCount`.

For completion checkpoints:

```ts
// server
import { countAiRequests } from "@/lib/effort";
const n = await countAiRequests(sessionId, taskId);

// browser
import { onAiRequestCount } from "@/lib/aiRequestCount";
useEffect(() => onAiRequestCount(taskId, (n) => { /* show a checkpoint at n === ... */ }), [taskId]);
```

`ChatPane` calls `notifyAiRequestSettled(taskId)` after each request, which re-reads the count from the
server and notifies subscribers.

## Schema

See `prisma/schema.prisma`.

- **Session**: `sessionId` (from `?sid=`, unique), `version`, `createdAt`, `endedAt`.
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
| `task_open` | server | `status`, `revisionCount`, `length` |
| `draft_save` | server (only when content changed) | `trigger`, `revisionCount`, `length` |
| `task_complete` / `task_reopen` | server | `previousStatus`, `revisionCount`, `length` |
| `editor_focus` / `editor_blur` | browser | `clientTs` (+ `length` on blur) |
| `visibility_hidden` / `visibility_visible` | browser | `clientTs` |
| `task_close` | browser (page unload) | `clientTs` |
| `ai_user_message` | server (`/api/ai`, before calling the model) | `text`, `model` |
| `ai_assistant_message` | server (`/api/ai`, on a successful reply) | `text`, `model` |
| `ai_error` | server (`/api/ai`, on a failed call) | `message`, `model` |
| `task_pause` | server (`/api/pause`, on a state change) | `clientTs` |
| `task_resume` | server (`/api/pause`, on a state change) | `clientTs`, `pausedMs`, `pausedOnTaskId` |
| `task_plan_submitted` | server (`/api/plan`, first save) | `purpose`, `goodEnough`, `timeBudgetMinutes` |
| `task_plan_updated` | server (`/api/plan`, edit with changes) | `changes: { field: { from, to } }` |
| `active_time_clamped` | server (`/api/active-time`) | `reportedMs`, `acceptedMs`, `reason` |
| `end_work_prompt` | browser (End work dialog opened) | `incompleteRequired`, `clientTs` |
| `end_work_cancel` | browser (dialog dismissed) | `incompleteRequired`, `clientTs` |

## AI proxy

`POST /api/ai` with `{ taskId, message }` (session via the `sid` cookie, like the other API routes).
It is the only code path that talks to OpenAI:

- Builds a system prompt from the task instructions and the participant's current saved draft
  (`buildSystemPrompt` in `@/lib/ai`), plus prior turns rebuilt from the event log — the conversation
  needs no separate table, so it survives a refresh or switching tasks and back.
- For the `sustainable` version, the prompt also tells the model not to routinely invite further
  revisions, per the brief's cognitive-closure manipulation. `standard` gets the same model with no
  such restriction. Both AI versions use the same `OPENAI_MODEL`.
- Logs `ai_user_message` before the call and `ai_assistant_message` (or `ai_error` on failure)
  after, via `logEvent` — see below.
- Returns `502` with a friendly message if the call fails (including a missing `OPENAI_API_KEY`);
  the chat pane surfaces that inline.

## Logging from server code

```ts
import { logEvent } from "@/lib/logEvent";

await logEvent(sessionId, version, taskId, "ai_user_message", { text, model });
```

`logEvent(sessionId, version, taskId | null, eventType, payload)` appends one Event row and throws on failure.
Get the current participant's `sessionId` and `version` in a route handler with
`getCurrentSession()` from `@/lib/session` (it reads the `sid` cookie).
