# Sample records

An export from a seeded demo run (`npm run demo`, mock AI, `DEMO_TIME_SCALE=0.05`), driven by an
automated browser test. All text is fake test text; there's no participant data.

The four sessions are one **Create demo set** from `/admin`: one `none`, one `standard`, and a paired
`sustainable` pair (`demo-sustainable-a-…` and `-b-…`). Each went through consent, the baseline survey
placeholder, instructions, Start work, three required tasks, End work, the end survey placeholder and the
interview. The sustainable pair also has a task plan, the budget checkpoint, a break prompt (A took the
break, B kept working) and the peer check-in, with text messages and one voice message (Chromium's fake
microphone, so the audio is a test tone).

| File | Contents |
| --- | --- |
| `export.json` | Same format as `/admin/export?format=json`: `{ exportedAt, sessionCount, sessions: { <sid>: { session, drafts, snapshots, events, task_plans, active_time } } }` |
| `sessions.csv`, `drafts.csv`, `snapshots.csv`, `events.csv`, `task_plans.csv`, `active_time.csv` | Same format as `/admin/export?format=csv&table=<name>`; the first column is always `sid` |

See "Data and export" and "Event types" in the main README for what each field means.
