# Dashboard authoring contract

Give this page to anyone (a person or an AI) who writes a dashboard for Concert Operate. A dashboard written this way is taken apart into reusable components by Concert Workbench in one click, with no guessing. One that is not usually needs to be rebuilt by hand.

Workbench's **Check** button (Setup, "Split dashboards into tiles") tells you how well a dashboard follows this.

**First, ask whether it needs code at all.** Most dashboards can be built in the Dashboard Designer (Reactor › Dashboard Designer, or the Workbench **Design** tab) with no code: 19 data sources, click-to-filter, drill-downs, Action flows and Concert Operate actions, all tested against a real tenant. Write a code dashboard only for what the Designer cannot do (a new kind of visual, a source it does not read). See `docs/dashboard-designer-tutorial.html`.

## 1. Folder and files

```
dashboards/<id>/
  <Name>Dashboard.tsx     the main component (one default export)
  <id>.panel.ts           registers the page (use an existing panel file as the model)
  <id>.scss               styles, scoped under one root class
  README.md               what it shows and which Concert data it reads
  version.ts              export const VERSION = 'v1.0.0'
```

Keep the data logic (`logic.ts`, `feed.ts`) in separate files from the layout. Small components (`Cards.tsx`, `Table.tsx`) are welcome.

## 2. Shape of the main component  (this is what makes it splittable)

The main component must **end with one `return (<Root> ... </Root>)`**. Each **direct child** of `<Root>` becomes one tile, named from the comment above it.

```tsx
export default function IncidentDashboard() {
  const alerts = useAlerts();           // all data and state live here, above the return
  const incidents = useIncidents();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="inc-dash">          {/* the single Root */}
      {/* Summary numbers */}
      <section className="inc-dash__kpis"> ... </section>

      {/* Alerts by severity */}
      <section className="inc-dash__severity"> ... </section>

      {/* Open incidents */}
      <section className="inc-dash__incidents"> ... </section>

      {/* Details panel */}
      <Drawer ... />                    {/* overlays stay with the block before them */}
    </div>
  );
}
```

Rules:
- One component per file that returns the dashboard. No early `return` of a different layout.
- All hooks, data and state are declared **above** the final return. Sections only read them.
- Every direct child of Root is one self-contained block with a `{/* Label */}` comment above it. Use 3 to 12 blocks.
- Overlays (`Modal`, `Dialog`, `Drawer`, `Popover`, toasts) go **after** the block that opens them.
- Do not wrap everything in one extra element or render the blocks from a `.map()`.
- Do not use `React.memo`, `forwardRef` or a class component for the main component.

## 3. Blocks that convert to editable widgets automatically

If a block looks like one of these, Workbench also offers to turn it into a Designer widget (a guess you can edit):
- **Row of cards** with a big number and a label: Number widgets. Say what is counted in the label (`Open alerts`, `Critical`).
- **A table** with a header row: Table widget. Name the columns after Concert fields (Severity, Resource, Summary, State, Priority, Owner, Team).
- **A list or bars grouped by a field** ("by team", "by source"): Bar chart. Put the grouping field in the heading.
- **A ring or share chart**: Donut.
Anything else stays a fixed tile, which is fine.

## 4. Data (the rules that kept breaking)

- Read data through the signed-in session: `window.akoraConfig.baseState.API.contentAnalyticsAPI` (`getAlerts`, `getStories`, `getImpactedApplications`, `getRunbook`, `getUsersAndGroups`, ...). This is what the Designer uses.
- **No API keys, tokens or passwords in the code**, and no `process.env.*KEY` / `DefinePlugin` values. A browser bundle is readable by anyone.
- **No tenant ID written into the code.** Take it from the page context or one setting at the top of `constants.ts` that is documented in the README.
- No absolute web addresses in `fetch`. Use `/aiops/api/...` paths on the same host.
- Request the columns you need. Alert insights columns must be quoted: `@insights.type='aiops.ibm.com/insight-type/runbook'`. Use `format: 'AIOPS'`.
- Treat Concert's `"-"` as empty (no owner, no team).
- Show "showing N of M" whenever a list is cut off.
- Handle loading, empty and error states in every block.

What the real API does (found with the Designer's API check, October 2026):
- `getIncidentAlerts` fails inside Concert Operate. Read an incident's alerts with `getAlerts` and the incident as `storyId`.
- `getFiltersViews` without a type fails on tenants with inventory filters. Use `getFilters` with a type condition (`alert` or `incident`).
- `setPolicyLock` is refused by the server (it sends `locked`, which the mutation does not accept). Do not offer locking.
- GraphQL introspection is disabled, and `graphql()` takes the query as text, not an object.
- Answers carry `__typename` fields and nested lists (each alert's `insights`): take the records from the shallowest list, and skip `__typename`.
- Times may be epoch milliseconds (topology). Severity counts may be `null`: show "Not reported", not 0.
- `getGroups` returns **user** groups, not alert groups.

Large tenants:
- Cap what you keep (the Designer keeps 5,000 rows per source) and say when you did.
- Time out slow calls (the Designer uses 60 s), keep one load in flight at a time, and pause refreshing while the browser tab is hidden.
- `getPoliciesMetadata` can return thousands of policies: load it once, not on every refresh.

Changing data (mutations: create or update an incident, activate, deploy, reject, restore or rename policies):
- Always ask the person to confirm first, saying what will change and how many items.
- Act on exactly the rows on screen, after every filter. Accept policy names as well as ids, and list names that match nothing.
- Report the result (done or the server's error) where the person can see it.

## 5. Look and behaviour

- Pages appear in Concert Operate's sidebar under **Reactor** (`dashboard-extension/config/routes.json`, `categoryTitle`). Existing menus such as Custom dashboards are not touched.

- Carbon components and tokens only (`@carbon/react`, `@carbon/charts-react`), light and dark.
- Severity colours: Critical red, Major orange, Minor yellow, Warning blue, Information light blue, Indeterminate purple.
- Compact rows (28 to 32 px) for tables on operations pages.
- Every interactive element is keyboard reachable and has a label.
- One scss file, every rule under one root class (`.inc-dash`).

## 6. Before you hand it over

- [ ] Builds with no TypeScript errors under `strict` and `noImplicitAny` (give callbacks return types, e.g. `(): void => undefined`).
- [ ] Workbench **Check** says "Mostly automatic" or "Ready".
- [ ] No findings marked "bad" (keys or secrets) and no hardcoded tenant.
- [ ] README lists the Concert APIs it calls and what each block shows.
- [ ] Mutations, if any, confirm first and report their result.
- [ ] Tried against a real tenant, or its readers checked with the Designer's API check (⋮ › API check).

## 7. A prompt you can give an AI

> Write a Concert Operate dashboard for <purpose> as a React + TypeScript component folder that follows DASHBOARD-CONTRACT.md exactly: one main component ending in a single `return (<Root>` whose direct children are 3 to 12 self-contained blocks, each preceded by a `{/* Label */}` comment; all hooks and state above the return; overlays after the block that opens them; data only through `window.akoraConfig.baseState.API.contentAnalyticsAPI`; no API keys and no tenant ID in the code; follow the "What the real API does" and "Large tenants" rules in section 4; any change to Concert data asks for confirmation first; Carbon components only; handle loading, empty and error states. Include the panel file, scss scoped under one root class, version.ts and a README that lists the APIs used.
