# Workspace design

Semtrail's UI is a place to investigate governed data and inspect the evidence.
Its visual references include [Hex's BI interface](https://hex.tech/product/bi/),
[Anthropic](https://www.anthropic.com/), and the
[Astryx design system](https://astryx.atmeta.com/). These inform the typography,
spacing, and visual hierarchy. Semtrail does not copy their branding or assets,
and remains a small React and Tailwind application without a component-library dependency.

The main screen is a chat interface with a bottom composer, an agent selector,
and chat history in the sidebar. Replies remain in the conversation. Follow-ups
reference up to six prior saved responses, resolved by the server for the same agent. Warm paper surfaces, restrained sage and clay accents, serif titles,
and monospace metadata distinguish content from controls. The chat
canvas has an optional context/evidence inspector, closed by default. Catalog search, integrations,
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
- Ctrl/Cmd+Enter sends the message; disabled states prevent duplicate submissions.
- All numeric chart values also appear as text. Animation honors reduced-motion preferences.
- The inspector moves below the investigation on smaller screens; server access
  stays reachable on mobile.
- React integration tests cover the API flow, catalog filtering, context/evidence
  switching, and reopening query evidence from a chart.


## Agent choice and Settings

The composer contains the agent picker: Auto or an explicit domain agent. The
sidebar contains chats and navigation only. Settings manages agent instructions,
dbt tag policies and budgets, plus Auto's enabled domains and routing model source.
Auto is a two-node LangGraph router/delegator: one ready domain per message, or a
clarifying question. The selected domain is visible on the reply, and its own query
policy remains authoritative. Configuration edits apply to new messages.
