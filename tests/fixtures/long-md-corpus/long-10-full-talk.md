# Full Research Talk Fixture

## Motivation

Researchers frequently start with Markdown notes that contain claims, constraints, and evidence in the same file. MDPR should turn that source into a deck without requiring the author to manually decide every layout.

## Contribution

- Corpus-backed template profiles from 100+ public conference slide files.
- Dense prose support that respects paragraph indentation.
- Image placement that preserves aspect ratio by default.
- Layout scoring that distinguishes tables, charts, images, workflows, and status lists.

## System flow

The generation path should keep semantic decisions visible before renderer-specific output is produced.

Markdown source => Semantic IR => Split planning => Conference profile inference => Layout scoring => PPTX/HTML rendering => QA diagnostics

## Evaluation setup

Claim: the evaluation covers collection, grouping, fixture generation, and build output rather than a single happy path.

```metric-dots
Collection, 100
Grouping, 107
Fixtures, 10
Builds, 20
```

## Results

Claim: each scenario maps to a distinct profile and layout family, which keeps long technical decks from collapsing into generic body slides.

| Scenario | Expected profile | Expected layout family |
| --- | --- | --- |
| Long standards prose | dense-technical-prose | split text |
| Flow diagram | diagram-workflow-heavy | pipeline |
| Chart and table | data-table-chart-heavy | chart-table |
| Agenda list | status-agenda-update | vertical list |

## Limitations

The fixture does not embed copyrighted conference images. Image behavior is tested through renderer placement logic and through source-provided image references in separate render tests.

## Conclusion

The deck should demonstrate that MDPR can support long, technical conference-style content while keeping the existing theme, semantic object boundaries, and author-provided hierarchy intact.
