# Dashboard Designer: how the UI interactions work

Diagrams of every interaction in the Dashboard Designer and the Concert Workbench, drawn from the code (Designer v1.61,
Workbench v1.76). GitHub draws them; the tutorial (`docs/dashboard-designer-tutorial.html`, section 15) has the same
diagrams as pictures.

## 1. From idea to Concert Operate

```mermaid
flowchart TD
  A["Designer person"] --> B["Workbench › Design<br/>sample data"]
  B --> C["Save<br/>dashboards/layouts/name.json"]
  C --> D["Publish<br/>published copy + sidebar entry"]
  D --> E["Versions › Commit<br/>dashboard files only"]
  E --> F["Versions › Push<br/>GitHub"]
  D --> G["Deploy<br/>build + upload"]
  G --> H["Concert Operate sidebar<br/>Reactor menu"]
  H --> I["Viewers use it<br/>live data"]
  J["Reactor › Dashboard Designer<br/>inside Concert Operate"] --> K["Saved in that browser"]
  K --> L["Export as JSON"]
  L --> M["Workbench › Dashboards › Import from file"]
  M --> C
```

## 2. Editor modes

```mermaid
flowchart TD
  S(["The Designer opens on an empty dashboard"]) --> E["Edit"]
  E <-->|"Preview / Edit switch"| P["Preview: the dashboard as viewers see it"]
  subgraph inEdit["Only in Edit"]
    direction TB
    T["Templates: replace the canvas (Undo brings it back)"]
    F["Flows: the Action flows editor"]
    W["Wire (key W): draw links on the canvas"]
    A["⋮ › Check the Concert Operate API"]
  end
  subgraph inPreview["Only in Preview, for that viewer"]
    direction TB
    R["Arrange widgets ⇄ Done arranging"]
    L["Link widgets ⇄ Done linking"]
    V["Views: save or pick a view"]
    M["by … and as … menus on charts"]
  end
  E --> inEdit
  P --> inPreview
  T ~~~ F ~~~ W ~~~ A
  R ~~~ L ~~~ V ~~~ M
```

## 3. The editor's parts

```mermaid
flowchart TD
  T["Toolbar<br/>Undo · Wire · Flows · Filters · Templates · Add widget · Tour · ⋮ · Preview/Edit"]
  L["Left panel"] --> L1["Add: widget library<br/>search, list/grid, recently used"]
  L --> L2["Layers: every widget, nested"]
  L --> L3["Wiring: who filters whom"]
  C["Canvas: 12-column grid"] -->|"select a widget"| S["Settings panel"]
  L2 -->|"select"| S
  S --> S1["General: title, Place in, options"]
  S --> S2["Data: source, parameter, conditions, measure, group by, series by, refresh"]
  S --> S3["Style: colours, frame, float"]
  S --> S4["Interact: viewer rights, When clicked, linking, actions"]
  S4 -->|"Edit in Action flows"| F["Action flows editor"]
  T -->|"Flows"| F
```

## 4. Building a widget

```mermaid
flowchart TD
  A["Add widget: click it, or drag it onto the canvas"] --> B["Select it"]
  B --> C["Data › Source"]
  C --> D{"Source needs a parameter?"}
  D -->|"yes"| E["Type it, or let a flow set it<br/>(until then: Waiting for a value)"]
  D -->|"no"| F["Only rows where (optional)"]
  E --> F
  F --> G["Measure · Field · Group by · Series by · Show up to"]
  G --> H["Style: colours, frame"]
  H --> I["Interact: what viewers may change, When clicked"]
  I --> J["Preview to check it"]
```

## 5. How data reaches a widget

```mermaid
flowchart TD
  A["Widget: source + parameter"] --> B{"Required parameter empty?"}
  B -->|"yes"| W["Waiting for a value"]
  B -->|"no"| C["Load queue<br/>one load at a time · 60 s timeout<br/>paused while the tab is hidden"]
  C --> D["contentAnalyticsAPI<br/>Concert Operate"]
  D --> E["Rows<br/>at most 5,000: Showing the first N of M"]
  E --> F["Only rows where"]
  F --> G{"Follows the filter bar?"}
  G -->|"yes"| H["Filter bar + time range"]
  G -->|"no"| I
  H --> I{"Follows filters from other widgets?"}
  I -->|"yes"| J["Click filters from linked widgets"]
  I -->|"no"| K["Chart, table or number"]
  J --> K
```

## 6. What a click does

```mermaid
flowchart TD
  A["Viewer clicks a bar, slice, row or number"] --> B{"Interact › When clicked"}
  B -->|"Filter other widgets"| C["Every widget on the same source follows<br/>chip: Filtering by … · Clear all"]
  B -->|"Show the rows behind it"| D["Side panel with the rows<br/>optional Open button"]
  B -->|"Open an address"| E["Address filled from the row<br/>?db=field:value opens a dashboard already filtered"]
  B -->|"Do nothing"| F["Nothing"]
  A --> G["Action flows listening to this event run too"]
```

## 7. Building an Action flow

```mermaid
flowchart TD
  A["Flows"] --> B["Add trigger: the widget people use"]
  B --> C["Pick its event<br/>a value is picked, clicked, Enter pressed …"]
  C --> D["Drag from its port ●"]
  D --> E["Drop on a widget, or on Concert Operate"]
  E --> F["Side panel: pick the action<br/>only what that target understands"]
  F --> G["Fill its fields<br/>the value chip inserts what the event carried"]
  G --> H["Optional: Only when the value is …"]
  H --> I["Close: runs in Preview and in Concert Operate"]
  J["Tile dropdowns"] -.->|"change event, action or target"| F
  K["Suggested flows"] -.->|"Add"| F
```

## 8. A flow at runtime: the drill-down

```mermaid
sequenceDiagram
  actor V as Viewer
  participant P as Incident picker
  participant R as Flow rules
  participant D as Detail widgets
  participant C as Concert Operate
  V->>P: picks incident inc-1001
  P->>R: event "a value is picked", value inc-1001
  R->>R: match event and "Only when the value is"
  R->>D: Change its source parameter = inc-1001
  D->>C: Alerts of an incident, Alert groups, Related incidents
  C-->>D: rows
  D-->>V: the incident's alerts, groups and related incidents
```

## 9. A Concert Operate action

```mermaid
sequenceDiagram
  actor V as Viewer
  participant W as Dashboard
  participant C as Concert Operate
  V->>W: clicks a button or presses Enter in a box
  alt action not supported (policy lock)
    W-->>V: warning, nothing sent
  end
  W->>W: alerts = rows the widget shows, after every filter
  opt policy names given
    W->>C: Policies (once, if no widget has them)
    C-->>W: names and ids
    W->>W: names to ids, unknown names left out
  end
  W->>V: confirm: summary, names not found, "This changes data in Concert Operate"
  alt cancelled
    W-->>V: nothing sent
  else confirmed
    W->>C: the change (create incident, activate policies …)
    C-->>W: result
    W-->>V: banner: done, or the server's error
  end
```

## 10. Changes a viewer makes for themselves

```mermaid
flowchart LR
  A["Viewer, in a published dashboard"] --> B["Arrange widgets: move, resize"]
  A --> C["Link widgets: draw or cut links, Filter bar chip"]
  A --> D["by …: regroup a chart"]
  A --> E["as …: show as another chart"]
  A --> F["Views: save filters, range, links"]
  B --> S["Kept in that viewer's browser only"]
  C --> S
  D --> S
  E --> S
  F --> S
  S --> R["Reset changes: back to the published dashboard"]
  P["Designer: Interact tab"] -.->|"allows or forbids each, per widget"| A
```

## 11. Dashboard versions in git

```mermaid
flowchart TD
  A["Save / Publish"] --> B["Versions badge: N files changed"]
  B --> C["Commit: message"]
  C --> D{"Allowed branch, no merge in progress?"}
  D -->|"no"| X["Refused: says why"]
  D -->|"yes"| E["Commit dashboard files only"]
  E --> F["Push: never forced"]
  F --> G["GitHub"]
  H["Pull"] --> I{"Fast-forward possible?"}
  I -->|"yes"| J["Up to date"]
  I -->|"no"| K{"Merges cleanly?"}
  K -->|"yes"| L["Merged"]
  K -->|"no"| M["Merge undone, files named<br/>settle it in a terminal"]
  N["History of this dashboard"] --> O["Open an old version"]
  O --> P["In the editor as unsaved changes"]
  P --> A
```

## 12. The API check

```mermaid
flowchart TD
  A["⋮ › Check the Concert Operate API"] --> B["Options: incident id, resource id,<br/>function code, ask the server, sample values"]
  B --> C["Run"]
  C --> D["Every data source once<br/>OK · empty · error · missing · skipped"]
  D --> E["Extra read functions"]
  E --> F["Schema probe"]
  F --> G["Helper functions looked up"]
  G --> H{"Ask the server option on?"}
  H -->|"yes"| I["Each change action sent an invalid tenant id<br/>server refuses and lists its parameters"]
  H -->|"no"| J["Change actions looked up only"]
  I --> K["Copy report / Download"]
  J --> K
```

## 13. Deploying

```mermaid
flowchart TD
  A["Workbench › Deploy, or ./deploy-dashboards.sh"] --> B["Sync dashboards into the toolkit<br/>protected panels untouched"]
  B --> C["npm install if needed"]
  C --> D["npm run build"]
  D --> E["1/3 Log in with target.json, upload the bundle"]
  E --> F["2/3 OpenShift login<br/>OPENSHIFT_PASSWORD"]
  F --> G["3/3 Update the UI extension and its routes"]
  G --> H["Hard-refresh Concert Operate"]
```
