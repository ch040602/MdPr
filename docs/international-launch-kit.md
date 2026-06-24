# International Launch Kit

Use these drafts to introduce MDPR without sounding like a generic launch
announcement. Prefer one or two focused posts, answer questions, and invite
Markdown edge cases.

## Positioning

```text
MDPR generates editable, visually checked PowerPoint decks from Markdown with a
deterministic runtime. It focuses on PPTX layout quality, slide splitting,
tables/charts/diagrams, icon slots, theme rules, overflow validation, and
repeatable output without requiring an LLM at runtime.
```

## Show HN

Title:

```text
Show HN: MDPR - Markdown to editable PowerPoint without an LLM runtime
```

URL:

```text
https://github.com/ch040602/MdPr
```

First comment:

```text
I built MDPR because I wanted Markdown-generated slides that remain editable in
PowerPoint instead of becoming screenshots or HTML-only decks.

The runtime is deterministic: Markdown is parsed into Presentation IR, planned
into Layout IR, validated for overflow/coherence, and rendered to editable PPTX
first. HTML/PDF/PNG previews are downstream outputs.

The optional mdpr-skill companion can suggest semantic hints or review notes,
but MDPR still owns final slide splitting, coordinates, theme colors, z-order,
and renderer output.

I am especially looking for Markdown edge cases: tables, diagrams, chart/table
pairs, mixed-language text, and docs that usually break when converted into
PowerPoint.
```

## DEV / Hashnode Article

Title:

```text
Generating editable PowerPoint decks from Markdown without an LLM runtime
```

Tags:

```text
markdown, powerpoint, typescript, productivity
```

Outline:

1. The problem: Markdown slide tools often produce HTML decks or PPTX files
   that need manual cleanup.
2. Why editability matters: text, tables, charts, diagrams, and proof objects
   should remain PowerPoint surfaces.
3. MDPR pipeline: Markdown -> Presentation IR -> Layout IR -> validation ->
   editable PPTX.
4. Why deterministic layout matters: no API key, repeatable CI output, fewer
   LLM coherence failures.
5. What feedback is needed: real Markdown files that break layout, overflow, or
   editability.

Call to action:

```text
If you have a Markdown report or research note that usually converts poorly to
PowerPoint, please open a small edge-case issue:
https://github.com/ch040602/MdPr/issues/new/choose
```

## Product Hunt

Name:

```text
MDPR
```

Tagline:

```text
Editable, visually checked PowerPoint decks from Markdown
```

Description:

```text
MDPR is a deterministic Markdown-to-presentation runtime. It converts Markdown
into editable PPTX with layout planning, theme/color rules, table/chart/diagram
support, overflow validation, and generated HTML/PDF/PNG previews. Optional
mdpr-skill hints can help review content, but MDPR owns final rendering.
```

## Reddit r/SideProject Follow-Up

```text
Small update after the first feedback: the closest comparison is Pandoc, but
MDPR is focused more narrowly on editable PowerPoint layout quality.

The goal is not broad document conversion. The focus is Markdown -> varied PPTX
layouts with deterministic slide splitting, tables/charts/diagrams/proof
objects, icon slots, theme/color rules, overflow checks, and generated visual
previews.

If anyone has a Markdown file that usually breaks when converted into slides, I
would be interested in seeing the smallest reproducible snippet.
```

## Where To Share

- Hacker News Show HN: technical audience; keep the post factual.
- DEV / Hashnode: write a short implementation article, not a sales page.
- Product Hunt: use the preview gallery and a concise tagline.
- Reddit r/SideProject: ask for workflow feedback, avoid repeated link drops.
- GitHub: keep issue templates, topics, preview gallery, and help-wanted issues
  current.

## What Not To Do

- Do not ask friends to upvote.
- Do not post the same link drop across many communities.
- Do not frame MDPR as a full replacement for Pandoc, Marp, Slidev, or LLM slide
  tools.
- Do not overpromise AI output. MDPR is deterministic; mdpr-skill is optional
  review support.
