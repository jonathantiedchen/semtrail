# Workspace design

Semtrail's UI is a place to investigate governed data and inspect the evidence.
Its visual references include [Hex's BI interface](https://hex.tech/product/bi/),
[Anthropic](https://www.anthropic.com/), and the
[Astryx design system](https://astryx.atmeta.com/). These inform the typography,
spacing, and visual hierarchy. Semtrail does not copy their branding or assets,
and remains a small React and Tailwind application without a component-library dependency.

The overview combines an investigation composer, domain agent selection, and
recent runs. Warm paper surfaces, restrained sage and clay accents, serif titles,
and monospace metadata distinguish content from controls. The investigation
canvas has a collapsible context/evidence inspector. Catalog search, integrations,
and saved-run access share the same shell.

## Evidence and charts

Charts render actual successful query results, not model-generated chart data.
The initial supported shapes are a single numeric result, or two columns with a
text category and a nonnegative numeric value across 2–12 rows. Bar widths use a
zero baseline and the maximum returned value; they are not shares of a total.
Labels preserve the returned values. Nulls, non-finite values, unsafe integers,
shortened cells, unsupported shapes, and failed queries are not charted. The full
bounded result remains available in the evidence table. Row truncation is stated
on the chart. Clicking its query identifier opens the original SQL/results.

The UI does not infer units, aggregate new totals, or claim new metric definitions.
Database policies and the existing execution gate remain authoritative.

## Interaction and accessibility

- Keyboard-accessible agent selection, navigation, chart citations, and inspector toggle.
- Ctrl/Cmd+Enter submits the question; disabled states prevent duplicate submissions.
- All numeric chart values also appear as text. Animation honors reduced-motion preferences.
- The inspector moves below the investigation on smaller screens; server access
  stays reachable on mobile.
- React integration tests cover the API flow, catalog filtering, context/evidence
  switching, and reopening query evidence from a chart.
