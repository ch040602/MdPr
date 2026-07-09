# Conference Slide Template Profiles

This note records the public conference-slide corpus used to tune MDPR layout selection. The corpus is used only for structural analysis. Original slide content, images, diagrams, and visual assets are not copied into this repository.

## Corpus

- local corpus: `C:\Users\hcslab_523\Downloads\mdpr-conference-slide-corpus`
- public source directories:
  - `https://www.ietf.org/proceedings/98/slides/`
  - `https://www.ietf.org/proceedings/99/slides/`
  - `https://www.ietf.org/proceedings/100/slides/`
  - `https://www.ietf.org/proceedings/101/slides/`
- downloaded PPT/PPTX files: 120
- analyzed PPTX files: 107
- analysis artifacts:
  - `analysis/deck-features.json`
  - `analysis/group-summary.json`
  - `analysis/group-summary.md`

## Profile Groups

| Profile | Count | Median slides | Median chars/slide | Median pictures/slide | Median shapes/slide | MDPR behavior |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `balanced-research-talk` | 70 | 7.0 | 436.65 | 0.0 | 2.45 | Keep one claim per slide, prefer restrained title/body, list, comparison, or grid layouts. |
| `dense-technical-prose` | 4 | 5.0 | 876.2 | 0.0 | 1.8 | Avoid prose walls; preserve paragraph indentation and prefer split text or text relief. |
| `diagram-workflow-heavy` | 30 | 8.0 | 396.1 | 0.0 | 9.75 | Route explicit flow language and diagram blocks to pipeline layouts. |
| `visual-evidence-heavy` | 3 | 9.0 | 238.0 | 0.56 | 3.9 | Prefer image-focus layouts; use chart-table only when images are paired with tables or charts. |

Two additional runtime profiles cover frequent MDPR inputs not isolated as large IETF clusters:

- `data-table-chart-heavy`: table or editable chart proof object drives the slide.
- `status-agenda-update`: compact agenda, chair-update, or status-progress slides.

## Implementation Rules

- Profile inference lives in `@mdpresent/core` as a semantic helper, not in renderers.
- Layout profile use is advisory: it adds candidates and scoring penalties but does not override explicit slide intent, object coverage, coherence groups, or section continuity.
- Image-heavy profiles must preserve original aspect ratio through renderer placement. Cropping is allowed only for explicit cover-style/focal-point policy.
- Dense prose profiles must preserve Markdown paragraph line indentation and expose hierarchy through split regions or compact vertical structure.
- Table-only slides prefer `table-focus`; chart+table or mixed proof-object slides prefer `chart-table`.
- Image-only slides prefer `image-focus`; `chart-table` must not outrank image-focus unless a chart or table is present.

## Template Mapping

| Input signal | Template profile | First-choice layouts | Fallback layouts |
| --- | --- | --- | --- |
| Long prose, standards notes, indented paragraphs | `dense-technical-prose` | `comparison` | `text-icon-aside`, `vertical-list` |
| Arrow flow, diagram block, many process shapes | `diagram-workflow-heavy` | `pipeline` | `pipeline-one-page` when deck mode requires it |
| Image or screenshot evidence | `visual-evidence-heavy` | `image-focus` | `chart-table` only for mixed evidence |
| Table or chart evidence | `data-table-chart-heavy` | `table-focus`, `chart-table` | `vertical-list` only for narrative metric slides |
| Short agenda or status list | `status-agenda-update` | `vertical-list`, `grid` | `title-body` |

