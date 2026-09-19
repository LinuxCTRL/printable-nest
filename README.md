# Worksheet mirror

A static mirror of real, reproducible worksheets (math and reading) sourced
from [**commoncoresheets.com**](https://www.commoncoresheets.com), stored as
ready-to-download PDFs plus a companion MDX index per worksheet. Each PDF is a
genuine worksheet — real problem sets and real reading passages — not a
placeholder template.

```
.
├── pdfs/                    # the printables themselves
│   ├── math/         457     # Grade K–8 · sheets grouped by K-4 band
│   ├── general/      583     # general / cross-unit practice sheets
│   ├── reading/       11     # reading & ELA
│   └── life-skills/   29     # life skills & geography
├── mdx/                      # one index page per worksheet (same tree)
└── README.md
```

**1080 worksheets · 1080 PDFs.**

Rebuilt occasionally from CommonCoreSheets; see [Regeneration](#regeneration).

---

## Direct download URLs

Every PDF is available at a stable, public, raw URL — no GitHub account, no
token, usable directly in `mdx` frontmatter, `<a href>`, or `curl`/`wget`.

Shape:

```
https://raw.githubusercontent.com/LinuxCTRL/printable-nest/main/pdfs/<subject>/<slug>.pdf
```

Examples:

| Worksheet | Direct PDF URL |
| --- | --- |
| Matching Addition | `https://raw.githubusercontent.com/LinuxCTRL/printable-nest/main/pdfs/math/matching-addition.pdf` |
| Finding 1 More and 1 Less | `https://raw.githubusercontent.com/LinuxCTRL/printable-nest/main/pdfs/general/finding-1-more-and-1-less.pdf` |
| Alaskan Hare | `https://raw.githubusercontent.com/LinuxCTRL/printable-nest/main/pdfs/general/alaskan-hare.pdf` |

---

## MDX index

Each worksheet has a sibling `.mdx` under `mdx/` with the same folder layout and
filename as its PDF. It carries frontmatter with everything you need to embed a
worksheet in a docs/site (e.g. a static site generator or a learning-objectives
checklist):

```mdx
---
title: "Matching Addition"
slug: "matching-addition"
subject: "Math & Numbers"
grade: "Grade 4"
source: "CommonCoreSheets"
sourceUrl: "https://www.commoncoresheets.com/matching-addition/29"
pdfPath: "./pdfs/math/matching-addition.pdf"
description: "Each worksheet has 20 problems …"
---
```

Key fields:

| Field | Meaning |
| --- | --- |
| `title`, `slug` | Worksheet title and URL slug |
| `subject`, `grade` | Browsing dimensions (as indexed on the original mirror) |
| `source`, `sourceUrl` | Real upstream worksheet link (CommonCoreSheets) |
| `pdfPath` | the one field you consume for actual downloads |
| Body | short description of the worksheet |

---

## Regeneration

The mirror is produced by an offline mapping pass plus a downloader (kept out of
the repo to keep it a pure content mirror):

- a script scrapes the upstream subject index, then resolves each worksheet to
  its real CommonCoreSheets worksheet id (by slug, title, and problem/operator
  signature), and downloads `…/pdfs/<subject>/<slug>.pdf` from
  `commoncoresheets.com`.
- a second script emits `mdx/` frontmatter + prose.

### Source & license

- Worksheets are sourced from **CommonCoreSheets** and are **© their authors**.
  CommonCoreSheets' terms of use restrict automated bulk harvesting and
  republishing of their content on other sites/platforms; your use of this
  mirror for personal homeschool / single-classroom use should respect that.
- This repository is **not affiliated with or endorsed by** CommonCoreSheets or
  PrintableNest.
