# Oumma Series — Publishing Plan

11 drafts, all on Dev.to (unpublished), all in the **"Oumma"** series.
Order below = intended publication order. **Publish 1–2 per week** (a drip,
not a burst): a burst buries the series; a 5–6 week drip compounds reach
and keeps the repos getting stars while the LinkedIn posts amplify each drop.

## The sequence (APPROVED 2026-10-18 — tags live in `<file>.tags`, titles except #7 unchanged)

| Pub # | File | Dev.to id | Dev.to tags (max 4) | Primary SEO keyword |
|---|---|---|---|---|
| 1 | `01-why-oumma-vs-n8n-camunda-zapier.md` | **4894394** — already PUBLISHED (slug `…oumma-1705`; the old draft id 4871017 in this table was stale). Still pending on it: approved tags `n8n workflowautomation zapier camunda` (it runs the fallback tags) + the watermark fix from the local file | `n8n` `workflowautomation` `zapier` `camunda` | "n8n alternatives" |

> ⚠️ Cleanup: a duplicate of #1 (id **4952671**, slug `…oumma-390i`) was accidentally published on 2026-10-25 — delete it from the Dev.to dashboard (the API DELETE endpoint 404s): https://dev.to/benchouia_ahmedabdelhaki/you-know-n8n-or-camunda-or-zapier-heres-whats-different-about-oumma-390i/edit → trash icon.
| 2 | `02-designer-mode-order-processing.md` | 4869105 — **PUBLISHED** | `ai` `bpmn` `workflowautomation` `opensource` | "AI process designer" |
| 3 | `03-process-anatomy-design-view.md` | 4869154 — **PUBLISHED 2026-10-25** (slug `…3dp8`; fixed two stale cross-references before publish) | `bpmn` `processdesign` `no-code` `opensource` | "BPMN tooling" |
| 4 | `04-roles-groups-permissions.md` | 4869664 | `keycloak` `rbac` `security` `workflowautomation` | "RBAC workflow engine" |
| 5 | `05-forms-people-actually-fill.md` | 4869665 | `forms` `ux` `i18n` `workflowautomation` | "process forms i18n" |
| 6 | `06-a-day-with-oumma-normal-user.md` | 4869666 | `workflowautomation` `ux` `taskmanagement` `opensource` | "task workflow UX" |
| 7 | `07-the-ai-that-works-for-you.md` | 4869671 | `ai` `llm` `agenticai` `workflowautomation` | "LLM workflow agent" |
| 8 | `08-wiring-external-systems-mcp-tools.md` | 4869667 | `mcp` `modelcontextprotocol` `webhooks` `workflowautomation` | "MCP tool workflow" |
| 9 | `09-versions-deployments-pinning.md` | 4869668 | `bpmn` `devops` `ci` `deployment` | "workflow versioning" |
| 10 | `10-under-the-hood-go-postgres-llm.md` | 4869669 | `golang` `postgres` `llm` `systemdesign` | "Go workflow engine" |
| 11 | `11-self-service-identity-registration-quota.md` | 4869670 | `keycloak` `authentication` `llm` `costoptimization` | "LLM token quota" |

> Publish command per article:
> `./publish-devto.sh <file> --update <id> --publish --series "Oumma"`
>
> **API limitation (verified 2026-10-25):** the Dev.to update endpoint (PUT)
> applies title/body/published but **ignores `tags` and `series`** — they are
> only set at creation (POST). The pre-existing drafts carry fallback tags
> (`ai workflow architecture tutorial`); after publishing each one, fix tags
> + series in the dashboard (article edit page, 30s). Episode 01 (4894394)
> still needs its approved tags `n8n workflowautomation zapier camunda`.
> Also: API DELETE 404s — deletion is dashboard-only.

## Dev.to ranking levers (per article)

1. **Title = the search query.** Keep the first 40 characters carrying the
   keyword ("You Know n8n…", "Roles, Groups and Permissions…"). Dev.to's
   on-site search and Google both key off titles.
2. **Tags are the category pages.** 4 max — pick the *audience* tag
   (`n8n`, `keycloak`, `golang`) + 1–2 *topic* tags + `opensource` (constant
   brand tag across the series).
3. **The Oumma series tag** (`#oumma`) groups everything — the tag page
   *is* the series landing page; article 01's CTA tells readers to follow it.
4. **Publish time**: weekday mornings **07:30–09:00 UTC** (EU dev morning
   + US west-coast evening overlap). Same slot every time = rhythm readers
   can set a reminder for.
5. **First hour matters**: after publishing, share to your LinkedIn (below)
   and relevant subreddits/communities (r/n8n, r/camunda, r/golang,
   r/LocalLLaMA for articles 2/7/10) — early upvotes/comments feed the
   feed ranking.
6. **Cross-link only backwards**: each new article may link *published*
   predecessors (the footers already do, by relative file links that
   Dev.to ignores until you swap in live URLs — do that swap per article
   at publish time, 30 seconds of editing).

## LinkedIn plan (amplifier, not host)

LinkedIn posts are capped at ~1,300 characters, so each article gets a
**post**, not a copy:

**Template (per article):**
```
[Hook line: the pain, in your industry's words — 1 sentence]

We built X in Oumma so that [concrete outcome]. The full breakdown,
with screenshots and the source code: [Dev.to URL]

#workflow #BPMN #agenticAI #OpenSource   (rotate per article's tags)
```

- **Attach 1 image** (the article's best screenshot — LinkedIn's algorithm
  heavily favors posts with a single image over link-only posts; keep the
  link in the text, it still embeds a card).
- **Timing**: same day, ~1h after the Dev.to publish (feeds the first hour).
- **The 01 special post**: this is the audience-capture post — write it in
  the *reader's* vocabulary ("If your n8n workflow needs a human to
  approve something, you've hit the wall…"), no product name in the first
  line, Oumma appears in line 3.
- **Cadence**: one LinkedIn post per published article; if a post
  overperforms (50+ reactions in 48h), follow up with a 3-slide carousel
  (Dev.to card + 2 screenshots) a week later — carousels get reshared.

## 6-week calendar (1 article per week, 2 in week 1 to establish the series)

| Week | Dev.to (Thu 08:00 UTC) | LinkedIn (same day) |
|---|---|---|
| 1 | 01 (vs n8n) **and** 02 (AI design walkthrough) | 01 special post; 02 post day 3 |
| 2 | 03 (designer tabs) | 03 post |
| 3 | 04 (roles & permissions) | 04 post |
| 4 | 05 (forms) | 05 post |
| 5 | 06 (normal user day) + 07 (AI Assist) | 06 post; 07 post day 4 |
| 6 | 08 (MCP tools) | 08 post |
| 7 | 09 (versions) | 09 post |
| 8 | 10 (under the hood) + 11 (identity) — finale week | 10 post; 11 post + a **series recap post** ("11 articles, 2 repos — the whole platform") |

The recap post is the conversion moment: it links both repos and the tag
page. End of calendar = ask for stars/contributions.

## Do at publish time (checklist, ~5 min per article)

1. Swap the footer's relative file links for the **live Dev.to URLs** of
   already-published predecessors (they're already drafts, IDs above).
2. `./publish-devto.sh <file> --update <id> --publish --series "Oumma"`.
3. Verify public: open the returned URL anonymously → 200.
4. Post the LinkedIn post (template above) with the cover screenshot.
5. Update `SERIES_PLAN.md` status column (✅ published + date).
