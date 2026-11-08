---
name: competitor-research
description: >-
  Comprehensive competitor research pipeline that consolidates scattered sources into curated market briefs.
  Pulls existing NotebookLM sources, searches the web via Google AI Mode MCP, verifies accuracy,
  and produces structured per-section markdown files plus a combined brief for NotebookLM upload.
  Use this skill whenever the user wants to research a competitor, build a competitor profile, create a market brief,
  consolidate competitor sources, audit competitive intelligence, or mentions "competitor research", "market brief",
  "competitive analysis", "competitor profile", "competitive landscape", or "market intelligence".
  Also trigger when the user asks to compare their product to another company, research a specific company
  (e.g., "research Greenlight", "find out about Finch"), asks "who are our competitors", wants to analyze
  the competition, or asks to clean up or consolidate NotebookLM sources about a specific company.
  Includes a setup mode (/competitor-research setup) for first-run dependency configuration.
---

# Competitor Research Pipeline

Build comprehensive, verified competitor briefs from multiple source types — existing NotebookLM content,
web research, and local project documents — then consolidate everything into structured markdown files
organized by section.

The goal is dual-purpose output: briefs that serve **investor pitch materials** (market sizing, funding,
threat assessment) AND **product strategy decisions** (feature gaps, user sentiment, positioning).

## Setup Mode (`/competitor-research setup`)

Read `references/setup.md` and follow the 8-step setup wizard. Setup runs once per environment to
configure Node.js, VNC (headless), NotebookLM CLI, Google AI Mode MCP, notebook selection,
critique tool, and persistent config at `~/.config/competitor-research/config.json`.

Setup supports **named profiles** for researching competitors across multiple projects or notebooks.

## Input

The skill accepts:
- **Competitor name(s)** (required) — one or multiple names, **comma-separated**, e.g.:
  - Single: `Finch`
  - Multiple: `Finch, Greenlight, BusyKid`
  Comma separation is required for multi-word names (e.g., `Hello Fresh, Greenlight`).
  When multiple names are provided, the skill runs in **parallel mode** (see below).
- **Domain keywords** (optional) — additional search terms specific to each competitor's market.
  When running multiple competitors, the skill asks for domain keywords per competitor during
  the disambiguation step, or infers them from the names.
- **Notebook ID** (optional) — defaults to configured notebook from setup
- **Project path** (optional) — defaults to active rawgentic project path
- **Product clarifier** (optional) — disambiguation when a company name is ambiguous,
  e.g., "Finch self-care app" vs "Finch payroll API". Ask the user if unclear.

## Output Structure

```
{project_path}/competitors/{competitor_name}/
├── 00-index.md                              # Table of contents with reading paths
├── 01-company-overview.md                   # Section 1
├── 02-funding-and-financials.md             # Section 2
├── 03-product-and-features.md               # Section 3
├── 04-pricing-and-monetization.md           # Section 4
├── 05-user-base-and-traction.md             # Section 5
├── 06-target-market-and-positioning.md      # Section 6
├── 07-user-sentiment-and-reviews.md         # Section 7
├── 08-strengths-and-weaknesses.md           # Section 8
├── 09-threat-assessment.md                  # Section 9
├── 10-sources-and-data-quality.md           # Section 10
├── {competitor_name}-full-brief.md          # Combined file (all sections, for NotebookLM)
├── .status.json                             # Pipeline progress (for resume capability)
└── raw/                                     # Raw source texts (for audit trail)
    ├── notebooklm/                          # Fulltexts pulled from NotebookLM
    │   ├── {source_id_short}.md
    │   └── ...
    └── web/                                 # Google AI Mode MCP research results
        ├── search-{topic}.md
        └── ...
```

## Section Definitions

Read `references/section-definitions.md` for the complete section template and all 10
section descriptions. That file is the **single source of truth** — use it when writing
sections (Step 6) and when constructing parallel agent prompts.

## Workflow (9 Steps)

Execute these steps in order. Each step has a clear checkpoint before proceeding.

### Step 1: Prerequisites, Profile & Directory Setup

This step validates the environment, selects the profile, and prepares the output directories.

**1a. Config check:**

```bash
test -f ~/.config/competitor-research/config.json
```

If missing: inform the user and run `/competitor-research setup` automatically.
Do NOT proceed with research until setup completes.

If present: read the config and quick-validate:
1. `notebooklm status` — if auth expired, invoke `/vnc-service:run` and re-auth
2. Check MCP `mcp__google-ai-search__search_ai` is in available tools — if missing, inform user to restart session
3. Load config values (notebook_id, critique_tool, bmad_path, etc.)

**1b. CAPTCHA pre-warming:**

Run a test search before any research begins — this clears any pending CAPTCHA so that
subsequent searches (both single-competitor and parallel agents) proceed without interruption:

```
mcp__google-ai-search__search_ai(query="test", headless=true)
```

If CAPTCHA triggers: invoke `/vnc-service:run`, retry with `headless: false`, user solves
in VNC, then verify headless works. The MCP browser is shared — one cleared session benefits
all subsequent searches.

**1c. Profile selection:**

Load the default profile from config. If multiple profiles exist, or if the user's current
context doesn't match the default, ask:
```
Using profile: "chorestory" (notebook: ChoreStory Investor Research)
Use this profile, or switch? Available profiles: chorestory, [other...]
Or: create a new profile for this research
```
If no profile matches, create a new one inline (ask for notebook + path).

**1d. Notebook verification:**

Set NotebookLM context: `notebooklm use {profile.notebook_id}`
If the notebook no longer exists, ask user to pick a new one and update the profile.

**1e. Project path verification:**

Check if `{profile.project_path}` exists on disk. If not set or missing: ask the user for
the output base directory. If the active rawgentic project path differs from the profile,
ask: "Use {rawgentic_path} or {profile.project_path}?"

**1f. Competitor parsing and confirmation:**

Parse competitor names: split input by commas, trim whitespace. For each competitor:
- Confirm the name with the user
- If ambiguous, ask for clarification (product clarifier)
- Ask for **domain keywords** (or infer): "Domain keywords for {name}?"
- Suggest output directory: `{project_path}/competitors/{competitor_name}/`

For multiple competitors, present all at once for confirmation:
```
Competitors to research:
  1. Finch (self-care pet app) — keywords: gamified wellness self-care
     Output: ./competitors/finch/
  2. Greenlight (kids debit card) — keywords: kids fintech debit card
     Output: ./competitors/greenlight/

Confirm all, or modify any? (confirm / modify #)
```

**1g. Resume detection:**

For each competitor, check if `{output_dir}/.status.json` exists with partial completion:
```
Found partial research for {name} (completed through Step {N}).
Resume from Step {N+1}, or start fresh? (resume / fresh)
```
If "resume": skip completed steps, proceed from the next one.
If "fresh": delete `.status.json` and `raw/` directory, start from Step 3.

**1h. Create directory structure:**

For each competitor: `mkdir -p {output_dir}/raw/notebooklm {output_dir}/raw/web`

**1i. Determine execution mode:**

- If 1 competitor: proceed with single-competitor pipeline (Steps 2-9)
- If 2+ competitors: proceed with **parallel mode** (see "Parallel Mode" section)

Write initial `.status.json`: `{"step": 1, "completed": true}`

**Checkpoint:** Profile loaded, notebook context set, all competitors disambiguated with
domain keywords, directories created, execution mode determined.

### Step 2: Project Context Familiarization

Before analyzing competitors, understand the user's own product so that Sections 3, 6, 8,
and 9 produce strategic comparisons, not generic profiles.

**1. Check config for cached project context:**

If `config.profiles[profile].project_context` exists and is populated, load it and present:
```
Project context loaded from config:
  Product: {product_name} — {one_liner}
  Audience: {primary_user} (buyer: {buyer})
  Stage: {stage}

Use this context, or refresh it? (use / refresh)
```
If "use": proceed to Step 3 with this context.
If "refresh": continue to sub-step 2 below.

**2. Search NotebookLM for project documents:**

Run `notebooklm source list --json` and filter for sources matching patterns like:
- `executive_summary`, `executive-summary`, `overview`
- `pitch_deck`, `pitch-deck`, `investor_brief`
- `product_spec`, `product-spec`, `prd`, `product_requirements`
- `README`, `CLAUDE_*.md` (AI context files)
- `brainstorm`, `concept`, `vision`

**3a. If project context found in NotebookLM:**

- Pull fulltext of the top 3-5 most relevant project documents
- Extract and store: product_name, primary_user, buyer, jtbd, differentiators, monetization, stage, category
- Present summary: "Here's what I understand about {product_name} — is this accurate?" Let user correct.

**3b. If NO project context found:**

Present options:
```
No project context found. Competitor briefs are much more useful when I
understand your product. Would you like to:

  1. Quick briefing (Recommended) — Answer 5-7 questions
  2. Upload existing docs — Point me to local files
  3. Skip — Sections 8-9 will be generic competitive analysis
```

**Option 1 (Quick briefing):** Ask 7 questions about the product (name, audience, problem,
differentiators, monetization, stage, category). Generate a Project Context Brief (300-500 words),
save to `{project_path}/project-context.md`, and upload to NotebookLM.

**Option 2 (Upload docs):** Ask for file paths. Read files, extract structured context, confirm.

**Option 3 (Skip):** Add caveats to Sections 8-9 headers and index.

**4. Save project context to config:**

Update `config.profiles[profile].project_context` with the extracted fields.

Write `.status.json`: `{"step": 2, "completed": true}`

**Checkpoint:** Project context loaded and confirmed (or skipped with caveats noted).

### Step 3: Pull Existing NotebookLM Sources

1. Run `notebooklm source list --json` to get all sources
2. Filter sources by competitor name AND domain keywords (case-insensitive)
3. Also identify likely-related sources (app store URLs, known product URLs)
4. Present the filtered list: "I found {N} sources about {competitor}. Should I include/exclude any?"
5. For each confirmed source, run `notebooklm source fulltext {source_id} --json`
6. Save each fulltext to `raw/notebooklm/{source_id_first8chars}.md` with YAML header
7. Track all source IDs: unique sources, duplicate IDs, wrong-company IDs
8. **Quick section mapping**: Scan pulled sources and note which sections have strong data vs. gaps.
   This informs targeted web research in Step 4.

Write `.status.json`: `{"step": 3, "completed": true}`

**Checkpoint:** Fulltexts saved. Source IDs recorded. Section gap analysis complete.

### Step 4: Web Research via Google AI Mode MCP

Run targeted searches using the `mcp__google-ai-search__search_ai` MCP tool.
Use domain keywords from Step 1 to make searches competitor-specific.

**Required searches** (adapt competitor name + domain keywords):
1. `"{competitor} {domain_keywords} company overview founding team funding {year}"` → company-overview.md
2. `"{competitor} {domain_keywords} revenue users downloads metrics {year}"` → traction-metrics.md
3. `"{competitor} {domain_keywords} pricing subscription model free vs paid {year}"` → pricing.md
4. `"{competitor} {domain_keywords} reviews user sentiment Reddit complaints {year}"` → user-sentiment.md
5. `"{competitor} {domain_keywords} competitors market position comparison {year}"` → market-position.md

**LinkedIn searches** (rich source for team, hiring, culture, and growth signals):
6. `"{competitor} site:linkedin.com/company employees team size headquarters"` → linkedin-company.md
7. `"{competitor} site:linkedin.com CEO founder CTO leadership executive"` → linkedin-leadership.md
8. `"{competitor} site:linkedin.com hiring jobs open positions engineering product"` → linkedin-hiring.md
9. `"{competitor} site:linkedin.com funding raised series investors announcement"` → linkedin-funding.md
10. `"{competitor} {domain_keywords} site:linkedin.com product launch update announcement"` → linkedin-updates.md

**LinkedIn data extraction guidance:**
- **Team size & growth**: LinkedIn company pages show employee count and growth rate.
  Extract current headcount, department breakdown (if visible), and growth % over
  6/12 months. Rapid engineering hiring = product investment. Rapid sales hiring =
  go-to-market push. Layoff signals (shrinking headcount) = burn rate pressure.
- **Leadership profiles**: Founder backgrounds, previous companies, domain expertise,
  board members, advisors. Prior exits or VC connections signal fundraising ability.
- **Job postings**: Technologies in job descriptions reveal tech stack, upcoming features
  (e.g., hiring "ML engineer" = AI feature coming), and geographic expansion (remote
  vs office locations). Senior hires (VP, Director) signal new strategic initiatives.
- **Company updates/posts**: Product launches, partnerships, milestones, culture signals.
  Engagement metrics (likes, comments) on posts indicate brand reach.
- **Connected companies**: "People also viewed" or investor profiles linked to the company
  reveal competitive landscape and investor ecosystem.

**Gap-targeted searches** (based on Step 3 section gap analysis):
11-13. Additional searches targeting specific sections that are data-thin

Save each result to `raw/web/search-{topic}.md` with YAML header (query, date, source).

**CAPTCHA handling:** If a search returns `captchaRequired: true`:
1. Invoke `/vnc-service:run` for connection info
2. Retry the search with `headless: false`
3. User solves CAPTCHA in VNC
4. Retry remaining searches with `headless: true`

Write `.status.json`: `{"step": 4, "completed": true}`

**Checkpoint:** At least 10 web research files saved (5 general + 5 LinkedIn).

### Step 5: Analyze & Verify

Read ALL raw sources (both NotebookLM and web) and:

1. **Company verification**: Flag any sources about a different company with the same name
2. **Fact extraction**: Pull specific data points with source attribution per section
3. **Cross-reference**: Note agreements and discrepancies between sources
4. **Freshness check**: Flag data older than 12 months
5. **Gap identification**: Report remaining gaps to user
6. **Web research contamination check**: Flag AI-generated web research that contains
   data from a wrong-company (common — AI search results conflate same-name companies)

Write `.status.json`: `{"step": 5, "completed": true}`

**Checkpoint:** User informed of wrong-company sources, gaps, and conflicts.

### Step 6: Write Section Files

Read `references/section-definitions.md` for the section template and all 10 section definitions.
Write each section file following those definitions.

Write files 01 through 10, then:
- Create `00-index.md` with executive summary, reading paths (investor track / product track),
  table of contents, and key numbers at a glance
- Create `{competitor_name}-full-brief.md` concatenating all sections with `---` dividers

Write `.status.json`: `{"step": 6, "completed": true}`

### Step 7: Critique & Quality Review

**Run BEFORE deleting NotebookLM sources** — if the critique finds fatal flaws, the original
sources are still available.

**Read `critique_tool` from config. Prefer the configured tool; fall back gracefully if
unavailable** (e.g., BMAD path no longer exists, reflexion plugin was uninstalled). If falling
back, inform the user which tool was used and why the configured tool was unavailable.

**Fallback cascade:** configured tool → self-critique (always available).

**If critique_tool = "bmad":**

1. Read the agent manifest at `{bmad_path}/_config/agent-manifest.csv`
2. Read the BMAD config at `{bmad_path}/core/config.yaml`
3. Read the party mode workflow at `{bmad_path}/core/skills/bmad-party-mode/workflow.md`
4. Follow the workflow.md to activate party mode with 3-5 relevant agents
5. Topic: "Review the competitor market brief at {path_to_full_brief}.
   Evaluate for: factual accuracy, source quality, analytical rigor, completeness
   across all 10 sections, and actionability for both investor pitch and product strategy."
6. Let the user participate — this is interactive, not a batch report

**If critique_tool = "reflexion":**

Invoke `/reflexion:critique` with the same evaluation topic as above.

**If critique_tool = "self":**

Re-read the full brief and evaluate against: factual accuracy, source quality,
completeness, analytical rigor, actionability, bias check. Write a 5-10 bullet
point critique and present to the user.

**After critique:** If significant issues found, offer to revise affected sections.
Regenerate the combined file if revisions are made.

Write `.status.json`: `{"step": 7, "completed": true}`

**Checkpoint:** Critique completed. Report which tool was used:
```
Critique completed using: {actual_tool_used} (configured: {config_value})
```

### Step 8: Upload Consolidated Brief

**Upload BEFORE deleting old sources** — this eliminates the data loss window. If upload
fails, the original sources are still intact.

1. Upload: `notebooklm source add {path_to_full_brief}`
2. Wait: `notebooklm source wait {source_id}`
3. Verify it appears: `notebooklm source list`

If upload fails: inform user the brief is available locally at `{path}` and can be manually
uploaded later. Do NOT proceed to deletion.

Write `.status.json`: `{"step": 8, "completed": true}`

### Step 9: Clean Up NotebookLM Sources

**Requires user confirmation. Only proceed after Step 8 (upload) is verified.**

1. Present the list of source IDs to delete (unique + duplicates + wrong-company)
2. Ask: "The consolidated brief is uploaded and verified. Ready to delete these {N} old
   sources? (y/n)"
3. On confirmation: delete each source via `notebooklm source delete {source_id}`
4. If any deletion fails mid-batch: log the failed ID, continue with remaining deletions,
   report "Deleted {N}/{total}. Failed: {list}" at end. If auth expired mid-batch, re-auth
   via `/vnc-service:run` and retry failed deletions.

Write `.status.json`: `{"step": 9, "completed": true}`

Report:
```
Uploaded: {competitor_name}-full-brief.md
Status: ready
NotebookLM sources: was {old_count}, now {new_count} (freed {delta} slots)
```

## Parallel Mode (Multiple Competitors)

When multiple competitor names are provided, the skill uses a **fan-out / fan-in** pattern:

### Phase 1: Shared Setup (main session)

1. Run Step 1 (Prerequisites, Profile & Directory) for all competitors — this is interactive
   and includes CAPTCHA pre-warming
2. Run Step 2 (Project Context) once — shared across all competitors

### Phase 2: Parallel Research (concurrent agents)

Read `references/agent-prompt-template.md` for the full template. Also read
`references/section-definitions.md` and include the section definitions inline in each
agent prompt (agents cannot read reference files — they need self-contained prompts).

Spawn all competitor agents in a **single message** using multiple Agent tool calls.
The Agent tool runs them concurrently, but the orchestrator **blocks until ALL agents complete**
(there is no incremental notification — this is how Claude Code's Agent tool works).

Each agent runs Steps 3-6 (pull sources, web research, analyze, write sections).

**Important constraints:**
- Agents share the same MCP server — web searches queue through one browser (sequential but fast);
  analysis and writing are truly parallel
- Agents share the same NotebookLM session — source list calls interleave safely (read-only)
- Each agent writes to its own `{output_dir}` — no file conflicts
- No agent should delete or upload NotebookLM sources

### Phase 3: Sequential Completion (main session)

After ALL agents complete, process each competitor sequentially through Steps 7-9:

1. **Check `.status.json`** for each competitor:
   - If `completed: true`: proceed to critique
   - If `completed: false` or file missing: agent failed. Offer to retry or complete manually.
   - If `captcha_blocked: true`: resolve CAPTCHA interactively (invoke `/vnc-service:run`),
     then run missing searches from the main session and re-analyze/rewrite affected sections.

2. **Step 7: Critique** — using the configured critique tool.
   - For **3+ competitors with BMAD**: offer a batch option: "Run self-critique on all briefs
     first, then BMAD deep-dive on the one that needs the most work? Or full BMAD on each?"
     Running N interactive party mode sessions back-to-back is exhausting.
   - For **reflexion or self-critique**: can process all competitors sequentially.

3. **Step 8: Upload** — upload each combined brief to NotebookLM

4. **Step 9: Clean up** — delete old sources (with user confirmation, can batch: "Delete all
   old sources for Finch, Greenlight, and BusyKid? (y/n)")

### Error Recovery

If an agent fails or produces partial output:

1. Read `.status.json` to determine which step failed
2. If Steps 3-4 completed but 5-6 failed: the raw data exists. Offer to run analysis
   and writing from the main session using the existing raw files.
3. If Step 3 failed (no sources pulled): offer to retry the agent or skip this competitor.
4. If agent timed out (no `.status.json`): inform user, offer manual completion.

### Progress Tracking

```
Competitor Research Progress:
  ● Finch        — Steps 3-6 running (agents active, waiting for all to complete)
  ● Greenlight   — Steps 3-6 running
  ● BusyKid      — Steps 3-6 running
  ---
  All agents complete. Processing Steps 7-9:
  ✓ Finch        — Steps 7-9 done
  ● Greenlight   — Step 7 (critique) in progress
  ○ BusyKid      — Pending
```

### Fallback: Sequential Mode

If the user prefers sequential processing (or if parallel agents are not available),
fall back to processing one competitor at a time through the full 9-step pipeline.
Order by NotebookLM source count (heaviest first to free slots early).

## Error Handling

| Error | Response |
|-------|----------|
| NotebookLM auth expired | Invoke `/vnc-service:run`, then `DISPLAY=:99 notebooklm login` |
| Google AI Mode CAPTCHA | Invoke `/vnc-service:run`, retry with `headless: false` |
| MCP not available | Inform user to restart session (MCP initializes at session start) |
| Source fulltext fails | Log source ID, skip, note in Section 10 as "content unavailable" |
| Ambiguous competitor name | Always ask, never guess |
| Thin data | Write honestly. Flag: "Section {N} is thin — only {X} words" |
| Chrome singleton lock | Clear `/path/to/chrome_profile/Singleton*` and retry |
| Config missing | Auto-run `/competitor-research setup` |
