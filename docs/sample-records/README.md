# Sample records

An export from a seeded demo run against a local server (`DATABASE_URL=file:./demo.db`, mock AI,
`DEMO_TIME_SCALE=0.05`), driven by a script that calls the app's own API routes directly (not through
the browser). All text is fake test text; there's no participant data.

Four sessions: `sample-none`, `sample-standard`, and a paired `sample-sustainable-a` / `-b`. Each went
through consent, the baseline survey placeholder, instructions, Start work, three required tasks, End
work, the end survey placeholder and the interview (3 questions for `none`, 4 for `standard`, 5 for
`sustainable`, per `config/interview.json`'s per-version skipping).

- **`sample-none`**: a drafting-notes entry on Task 1 (`features.notesPad`), and a logged `paste` /
  `large_paste` on Task 2. Focus mode (`features.focusMode`) is also on for this version, but isn't
  represented here — nothing in this scripted run ever left the page, so there's no away episode to show.
- **`sample-standard`**: one AI exchange per task (mock replies, no `OPENAI_API_KEY` needed).
- **`sample-sustainable-a` / `-b`**: a task plan and AI exchange on Task 1; A hits the time-budget
  checkpoint and continues; a break prompt fires for A (takes the break) while B's is logged as missed;
  both open the peer check-in v2 room and exchange text messages before A ends it. No voice message is
  included here — that needs a real `MediaRecorder` capture from a browser, which this script doesn't
  drive.

Nothing here demonstrates Withdraw or the focus-mode "please return" overlay; both were verified
separately during the Week 5 PR review (live, through a browser) rather than folded into this set.

| File | Contents |
| --- | --- |
| `export.json` | Same format as `/admin/export?format=json`: `{ exportedAt, sessionCount, sessions: { <sid>: { session, drafts, notes, snapshots, events, task_plans, active_time } } }` |
| `sessions.csv`, `drafts.csv`, `notes.csv`, `snapshots.csv`, `events.csv`, `task_plans.csv`, `active_time.csv` | Same format as `/admin/export?format=csv&table=<name>`; the first column is always `sid` |

See "Data and export" and "Event types" in the main README for what each field means.
