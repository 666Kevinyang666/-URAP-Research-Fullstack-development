# AI cost report

Generated 2026-11-13 by `npm run cost-report` from `demo.db` (sids starting with `pilot-`).
Prices: `config/pricing.json` (as of 2026-11-13, **not yet verified against OpenAI's pricing page**).
Models in the data: `gpt-5.6-terra`.

## Summary

|  | Calls | Input tokens | Cached input | Output tokens | Reasoning | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Task assistant | 32 | 49,464 | 35,335 | 10,254 | 1,455 | $0.1584 |
| Interview follow-ups | 18 | 7,238 | 0 | 1,043 | 591 | $0.0270 |
| **Total** | 50 | 56,702 | 35,335 | 11,297 | 2,046 | **$0.1854** |

## Per call type (averages per call)

| Call type | Calls | Avg input | Avg cached | Avg output | Avg reasoning | Avg cost / call | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Task assistant | 32 | 1,546 | 1,104 | 320 | 45 | $0.00495 | $0.00123 | $0.01535 |
| Interview follow-up | 18 | 402 | 0 | 58 | 33 | $0.00150 | $0.00064 | $0.00270 |

## Per version

| Version | Sessions | Task calls | Interview calls | Total cost | Avg cost / session | Avg cost / task call |
| --- | --- | --- | --- | --- | --- | --- |
| none | 0 | 0 | 0 | $0.0000 | n/a | n/a |
| standard | 2 | 16 | 8 | $0.0958 | $0.0479 | $0.00527 |
| sustainable | 2 | 16 | 10 | $0.0895 | $0.0448 | $0.00463 |

## Per session

| sid | Version | Task calls | Interview calls | Input | Cached | Output | Reasoning | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pilot-1` | standard | 8 | 4 | 14,451 | 7,130 | 3,885 | 703 | $0.0627 |
| `pilot-3` | standard | 8 | 4 | 13,013 | 10,204 | 2,123 | 316 | $0.0331 |
| `pilot-2` | sustainable | 8 | 5 | 15,286 | 7,347 | 3,313 | 661 | $0.0571 |
| `pilot-4` | sustainable | 8 | 5 | 13,952 | 10,654 | 1,976 | 366 | $0.0324 |

## Cost growth with conversation length (task assistant)

Each request resends the system prompt (brief, task, current draft) plus the earlier turns of that task's conversation (up to 20 messages), so input tokens grow with each turn.

| Turn in task conversation | Calls | Avg input | Avg output | Avg cost / call |
| --- | --- | --- | --- | --- |
| 1 | 12 | 1,263 | 340 | $0.00549 |
| 2 | 12 | 1,570 | 359 | $0.00518 |
| 3 | 8 | 1,933 | 232 | $0.00378 |

Linear fit: input ≈ 921 + 333 × turn tokens (turns past 11 held flat by the history cap). Measured cached share of input: 71%.

## Full-study projection

330 participants, 110 per arm. `none` uses the interview only; `standard` and `sustainable` use the task assistant plus the interview. Per-participant numbers scale the measured per-call averages above.

### gpt-5.6-terra (measured model)

| AI requests / AI-arm participant | none / participant | standard / participant | sustainable / participant | Study total (flat) | Study total (length-adjusted) | Length-adjusted, no caching |
| --- | --- | --- | --- | --- | --- | --- |
| 30 | $0.0045 | $0.15 | $0.16 | **$34.64** | $40.33 | $63.70 |
| 60 | $0.0045 | $0.30 | $0.30 | **$67.31** | $87.32 | $149.60 |
| 120 | $0.0045 | $0.60 | $0.60 | **$132.64** | $181.31 | $321.40 |

### gpt-5.6-luna (same tokens, repriced)

| AI requests / AI-arm participant | none / participant | standard / participant | sustainable / participant | Study total (flat) | Study total (length-adjusted) | Length-adjusted, no caching |
| --- | --- | --- | --- | --- | --- | --- |
| 30 | $0.0004 | $0.02 | $0.02 | **$3.46** | $4.03 | $6.37 |
| 60 | $0.0004 | $0.03 | $0.03 | **$6.73** | $8.73 | $14.96 |
| 120 | $0.0004 | $0.06 | $0.06 | **$13.26** | $18.13 | $32.14 |

### Terra vs Luna

|  | gpt-5.6-terra | gpt-5.6-luna |
| --- | --- | --- |
| Measured calls, repriced | $0.1854 | $0.0185 |
| Avg task call | $0.00495 | $0.00049 |
| Avg interview follow-up | $0.00150 | $0.00015 |
| Study total at 30 requests (flat) | $34.64 | $3.46 |
| Study total at 60 requests (flat) | $67.31 | $6.73 |
| Study total at 120 requests (flat) | $132.64 | $13.26 |

Luna figures reprice the tokens Terra used. A different model may write longer or shorter replies, so test Luna directly before relying on them.

## Assumptions

- Prices are from `config/pricing.json` (as of 2026-11-13) and **have not been verified** against OpenAI's pricing page.
- Cost = (input − cached) × input price + cached × cached-input price + output × output price. Reasoning tokens are part of `completion_tokens` and billed as output. `cache_write_tokens`, if reported, is billed at the normal input price (no surcharge assumed).
- Only successful replies with logged `usage` are counted. Failed calls (`ai_error`, `interview_error`), mock replies and scripted interview lines have no usage and cost $0 here; OpenAI may still bill a failed call's input.
- Projection, flat: N requests × the measured average task-call cost, plus interview follow-ups (none 3, standard 4, sustainable 5 per participant, from `config/interview.json`) × the measured average follow-up cost.
- Projection, length-adjusted: N requests split evenly over the 3 required tasks; input per call follows the fitted growth by turn, capped at the 20-message history limit, with the measured cached share. Longer conversations than the pilot's make this the better guide at 60–120 requests.
- Caching: 71% of task-assistant input was cached in the measured calls. Scripted test runs send messages seconds apart; real participants pause for minutes, and OpenAI's prompt cache can expire in between, so the "no caching" column is the upper bound for input cost.
- Drafts are assumed to be about as long as in the measured sessions; the system prompt includes the current draft, so longer drafts raise input cost.
- Both AI arms are assumed to use the same number of requests. Real usage will differ by arm and by person.
- No allowance for retries, testing, piloting or price changes. Add a margin.
