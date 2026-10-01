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
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev --name <name>` | Create a migration after editing `prisma/schema.prisma` |
| `npm run typecheck` | TypeScript check |

Never commit `.env` or API keys. This repo is public.

## Configuration

- `config/tasks.json`: task ids, titles and instructions (placeholders for now).
- `config/study.json`: `qualtricsUrl` (survey link), `autosaveIntervalMs` (3 s), `snapshotIntervalMs` (5 min).

## Routes

| Route | Purpose |
| --- | --- |
| `GET /start?sid=...&version=...` | Creates the session, or resumes it if the sid exists (its stored version is never changed). Sets an `sid` cookie used by all later requests and redirects to the first task. |
| `GET /task/[taskId]` | Task page: instructions, editor, AI chat pane placeholder (hidden for `none`). |
| `GET /survey` | "Continue to survey": redirects to `qualtricsUrl` with `?sid=` appended. |
| `POST /api/draft` | Autosave `{ taskId, content, trigger }`. |
| `POST /api/snapshot` | Save plus interval snapshot `{ taskId, content }`. |
| `POST /api/task/complete` / `reopen` | Change task status `{ taskId, content? }`. |
| `POST /api/session/end` | End work: saves, snapshots every draft, sets `endedAt`. |
| `POST /api/events` | Browser interaction events (allow-listed types only). |

## Saving behavior

- The editor autosaves every 3 s when the text changed, on blur, and when the tab is hidden or closed
  (`sendBeacon`). The indicator shows **Saving… / Saved / Not saved**.
- Unsaved text is also backed up in `localStorage`. On load, the editor restores the backup if the server
  copy is older, so a refresh never loses text, even when the final save arrives after the page reloads.
- `revisionCount` increases only when the saved content differs from the stored content.
- A completed task is read-only until it is reopened. After **End work** the session is closed for editing.

## Schema

See `prisma/schema.prisma`.

- **Session**: `sessionId` (from `?sid=`, unique), `version`, `createdAt`, `endedAt`.
- **Draft**: one row per (`sessionId`, `taskId`): current `content`, `status`
  (`not_started` | `in_progress` | `complete`), `updatedAt`, `revisionCount`.
- **Snapshot**: copies of draft content with `reason`: `interval` (every 5 min while a task is open),
  `complete`, `reopen`, `end_work`.
- **Event**: append-only log: `sessionId`, `version`, `taskId` (nullable), `eventType`, `payload` (JSON),
  `timestamp` (server time). SQLite triggers reject any UPDATE or DELETE on this table.

## Event types

| eventType | Source | Payload |
| --- | --- | --- |
| `session_start` | server | `userAgent` |
| `session_resume` | server | `requestedVersion`, `versionMismatch`, `userAgent` |
| `session_end` | server | `alreadyEnded`, per-draft `status` / `revisionCount` |
| `survey_redirect` | server | `from` |
| `task_open` | server | `status`, `revisionCount`, `length` |
| `draft_save` | server (only when content changed) | `trigger`, `revisionCount`, `length` |
| `task_complete` / `task_reopen` | server | `previousStatus`, `revisionCount`, `length` |
| `editor_focus` / `editor_blur` | browser | `clientTs` (+ `length` on blur) |
| `visibility_hidden` / `visibility_visible` | browser | `clientTs` |
| `task_close` | browser (page unload) | `clientTs` |
| AI message events | AI proxy via `logEvent` | defined by the AI proxy |

## Logging from server code (AI proxy)

```ts
import { logEvent } from "@/lib/logEvent";

await logEvent(sessionId, version, taskId, "ai_user_message", { text, model });
```

`logEvent(sessionId, version, taskId | null, eventType, payload)` appends one Event row and throws on failure.
Get the current participant's `sessionId` and `version` in a route handler with
`getCurrentSession()` from `@/lib/session` (it reads the `sid` cookie).
