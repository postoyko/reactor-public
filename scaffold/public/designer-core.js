var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// designer/types.ts
var GRID_COLS = 12;
var COND_OPS = ["=", "!=", "<", "<=", ">", ">=", "contains"];
var TIME_PRESETS = [
  { id: "all", label: "All time", ms: 0 },
  { id: "15m", label: "Last 15 minutes", ms: 15 * 6e4 },
  { id: "1h", label: "Last hour", ms: 36e5 },
  { id: "6h", label: "Last 6 hours", ms: 6 * 36e5 },
  { id: "24h", label: "Last 24 hours", ms: 24 * 36e5 },
  { id: "7d", label: "Last 7 days", ms: 7 * 864e5 },
  { id: "30d", label: "Last 30 days", ms: 30 * 864e5 },
  { id: "custom", label: "Custom range", ms: 0 }
];

// designer/carbon-specs.ts
function dataOn(rule, p) {
  switch (rule) {
    case "always":
      return true;
    case "showValue":
      return !!p.showValue;
    case "source=live":
      return p.source === "live";
    case "source=field":
      return p.source === "field";
    case "notice":
      return !!p.when && p.when !== "always" || !!p.showValue;
    case "notFixed":
      return !!p.source && p.source !== "fixed";
    case "filterItems":
      return String(Array.isArray(p.items) ? p.items.join("\n") : p.items || "").includes("filter:");
    default:
      return false;
  }
}
var GROUPS = ["Content", "Navigation", "Data", "Charts", "Status", "Actions", "Inputs"];
var P = (key, label, kind, def, extra) => ({ key, label, kind, def, ...extra });
var SIZES = ["sm", "md", "lg"];
var SOURCE = P("source", "Items come from", "enum", "list", { options: ["list", "field"], help: "\u201Clist\u201D uses the lines below; \u201Cfield\u201D lists the values of a field of the live data (set it under Data) and sets a filter other widgets follow." });
var ITEMS = P("items", "Items (one per line)", "lines", ["First", "Second", "Third"]);
var NOTICE_PROPS = [
  P("kind", "Kind", "enum", "info", { options: ["info", "info-square", "success", "warning", "warning-alt", "error"] }),
  P("title", "Title", "text", "Heads up"),
  P("subtitle", "Text", "text", "Something worth knowing."),
  P("lowContrast", "Low contrast", "bool", false),
  P("hideClose", "Hide the close button", "bool", true),
  P("when", "Show", "enum", "always", { options: ["always", "above", "below", "equals"], help: "Anything but \u201Calways\u201D shows it only when the measure under Data compares to the number below." }),
  P("threshold", "Number to compare with", "number", 0),
  P("showValue", "Append the measure to the text", "bool", false)
];
var THRESH = [
  P("warnAt", "Warning at", "number", 10, { help: "The value at which it turns to warning. Thresholds read the measure under Data." }),
  P("critAt", "Critical at", "number", 25),
  P("direction", "Worse when the value is", "enum", "higher", { options: ["higher", "lower"] })
];
var SHAPE_KINDS = ["failed", "critical", "high", "medium", "low", "cautious", "undefined", "stable", "informative", "incomplete", "draft"];
var ICON_KINDS = ["failed", "caution-major", "caution-minor", "undefined", "succeeded", "normal", "in-progress", "incomplete", "not-started", "pending", "unknown", "informative"];
var IND_SRC = (extra) => P("source", "Status comes from", "enum", "live", { options: ["fixed", "live", "severity"], help: `\u201Cfixed\u201D always shows the kind below. \u201Clive\u201D turns warning / critical when the measure under Data crosses the thresholds. \u201Cseverity\u201D shows the worst ${extra} among the rows.` });
var LABEL = P("label", "Label ({value} = the figure, {count} = rows)", "text", "{value} open");
var STATUS_SPECS = [
  {
    name: "ShapeIndicator",
    label: "Status shape",
    group: "Status",
    description: "Carbon status shape and label. Fixed, or turns warning / critical from live data or the worst severity.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    uses: "measure",
    data: "notFixed",
    props: [IND_SRC("severity (alerts) or priority (incidents)"), P("kind", "Kind (fixed)", "enum", "stable", { options: SHAPE_KINDS }), LABEL, P("textSize", "Text size", "enum", "12", { options: ["12", "14"] }), P("compact", "Shape only (label on hover)", "bool", false), ...THRESH]
  },
  {
    name: "IconIndicator",
    label: "Status icon",
    group: "Status",
    description: "Carbon status icon and label. Fixed, or turns warning / critical from live data or the worst severity.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    uses: "measure",
    data: "notFixed",
    props: [IND_SRC("severity (alerts) or priority (incidents)"), P("kind", "Kind (fixed)", "enum", "succeeded", { options: ICON_KINDS }), LABEL, P("size", "Size", "enum", "16", { options: ["16", "20"] }), P("compact", "Icon only (label on hover)", "bool", false), ...THRESH]
  },
  {
    name: "BadgeIndicator",
    label: "Count badge",
    group: "Status",
    description: "A small count or dot. Shows the live number of rows (or a measure); can hide itself at zero.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    uses: "measure",
    data: "notFixed",
    props: [P("label", "Label", "text", "Open alerts"), P("source", "Count comes from", "enum", "live", { options: ["fixed", "live"], help: "\u201Clive\u201D uses the measure under Data." }), P("count", "Count (fixed)", "number", 3), P("display", "Show", "enum", "count", { options: ["count", "dot"], help: "\u201Cdot\u201D shows a plain dot whenever the figure is above zero." }), P("hideZero", "Hide the badge at zero", "bool", true)]
  },
  {
    name: "Popover",
    label: "Popover",
    group: "Status",
    description: "A button that opens a panel: a note, or a live breakdown whose entries set a filter other widgets follow.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "chart",
    chart: { group: true },
    emits: true,
    data: "always",
    props: [P("text", "Button text", "text", "Breakdown"), P("showCount", "Append the row count to the button", "bool", true), P("content", "Text shown above the breakdown", "area", "Where these come from"), P("breakdown", "List the groups (Data > Group by) with counts", "bool", true), P("align", "Opens", "enum", "bottom", { options: ["bottom", "top", "left", "right", "bottom-start", "bottom-end", "top-start", "top-end"] }), P("limit", "Groups listed", "number", 8)]
  },
  {
    name: "ComboButton",
    label: "Combo button",
    group: "Actions",
    description: "A button with a menu. Lines can open an address or set a filter other widgets follow.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    data: "filterItems",
    props: [P("items", "Actions (first one is the button; Label :: target)", "lines", ["Critical only :: filter:severityLabel=Critical", "Open alerts only :: filter:state=open", "Clear my filters :: clear", "Documentation :: https://www.ibm.com/docs"], { help: "Target is an address (opens in a new tab), filter:field=value (sets a filter on the widgets wired to this button), or clear (removes the filters this button set)." }), P("size", "Size", "enum", "md", { options: ["sm", "md", "lg"] })]
  }
];
var CHART_LEGEND = P("legend", "Legend", "enum", "bottom", { options: ["bottom", "top", "right", "left", "none"] });
var CHART_TITLE = P("title", "Chart title (blank = none)", "text", "");
var CH = (name, label, description, chart, props, extra = {}) => ({ name, label, group: "Charts", description, w: 6, h: 7, minW: 3, minH: 4, uses: "chart", chart, emits: true, data: "always", props: [CHART_TITLE, CHART_LEGEND, ...props], ...extra });
var BINS = P("bins", "Time slots", "number", 24);
var CURVE = P("curve", "Line style", "enum", "smooth", { options: ["smooth", "straight", "step"] });
var CHART_SPECS = [
  CH("SimpleBarChart", "Simple bar chart", "One bar per group (Data > Group by) with the measure. Click a bar to filter other widgets.", { group: true }, [P("horizontal", "Horizontal bars", "bool", false)]),
  CH("GroupedBarChart", "Grouped bar chart", "Bars side by side: Group by on one axis, Series by splitting each group.", { group: true, series: true }, [P("horizontal", "Horizontal bars", "bool", false)]),
  CH("StackedBarChart", "Stacked bar chart", "Bars stacked: Group by on one axis, Series by splitting each bar.", { group: true, series: true }, [P("horizontal", "Horizontal bars", "bool", false), P("percent", "Show as 100%", "bool", false)]),
  CH("LollipopChart", "Lollipop chart", "Like a bar chart, drawn as dots on stems. Good for ranked lists.", { group: true }, []),
  CH("LineChart", "Line chart", "The measure over time (Data > Time field), one line per Series by value.", { time: true, series: true }, [BINS, CURVE]),
  CH("AreaChart", "Area chart", "The measure over time, filled in.", { time: true, series: true }, [BINS, CURVE]),
  CH("StackedAreaChart", "Stacked area chart", "The measure over time, one band per Series by value, stacked.", { time: true, series: true }, [BINS, CURVE]),
  CH("ScatterChart", "Scatter chart", "One dot per row: time across, a number (Data > Field) up.", { time: true, series: true }, [P("maxPoints", "Most dots", "number", 400)]),
  CH("PieChart", "Pie chart", "Share per group. Click a slice to filter other widgets.", { group: true }, []),
  CH("DonutChart", "Donut chart", "Share per group with the total in the middle.", { group: true }, []),
  CH(
    "GaugeChart",
    "Gauge",
    "A dial for one figure against a maximum. Changes colour at the warning and critical values.",
    void 0,
    [P("max", "Maximum", "number", 100), P("type", "Shape", "enum", "semi", { options: ["semi", "full"] }), P("unit", "Unit shown after the figure", "text", ""), ...THRESH],
    { uses: "measure", emits: false, w: 4, h: 7, minW: 3, minH: 4 }
  ),
  CH(
    "MeterChart",
    "Meter",
    "A horizontal bar for one figure against a maximum, with coloured ranges.",
    void 0,
    [P("label", "Label", "text", "Utilisation"), P("max", "Maximum", "number", 100), ...THRESH],
    { uses: "measure", emits: false, w: 6, h: 3, minW: 3, minH: 2 }
  ),
  CH("HeatmapChart", "Heatmap", "A grid: Group by across, Series by down, colour = the measure. Click a cell to filter by both.", { group: true, series: true }, [], { w: 8, h: 8 }),
  CH("TreemapChart", "Treemap", "Rectangles sized by the measure for each group. Click one to filter.", { group: true }, [], { w: 8, h: 8 }),
  CH("RadarChart", "Radar chart", "Group by around the edge, one shape per Series by value.", { group: true, series: true }, [], { w: 6, h: 8 }),
  CH("WordCloudChart", "Word cloud", "Group values as words sized by the measure. Click a word to filter.", { group: true }, [P("limit", "Words", "number", 30)], { w: 6, h: 7 }),
  CH("AlluvialChart", "Flow chart (alluvial)", "How rows flow from one field (Group by) to another (Series by). Click a node to filter.", { group: true, series: true }, [], { w: 10, h: 9, minW: 5, minH: 6 })
];
var SPECS = [
  {
    name: "Heading",
    label: "Heading",
    group: "Content",
    description: "A heading at the right level.",
    w: 4,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Text", "text", "Heading"), P("level", "Level", "enum", "2", { options: ["1", "2", "3", "4", "5", "6"] })]
  },
  {
    name: "Link",
    label: "Link",
    group: "Content",
    description: "A text link.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Text", "text", "Open the documentation"), P("href", "Address", "text", "https://www.ibm.com/docs"), P("inline", "Inline", "bool", false), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "UnorderedList",
    label: "Bulleted list",
    group: "Content",
    description: "A bulleted list.",
    w: 4,
    h: 4,
    props: [ITEMS, P("expressive", "Expressive", "bool", false)]
  },
  {
    name: "OrderedList",
    label: "Numbered list",
    group: "Content",
    description: "A numbered list.",
    w: 4,
    h: 4,
    props: [ITEMS, P("expressive", "Expressive", "bool", false)]
  },
  {
    name: "CodeSnippet",
    label: "Code snippet",
    group: "Content",
    description: "Code or a command with a copy button.",
    w: 6,
    h: 3,
    props: [P("text", "Code", "area", "kubectl get pods -n cp4aiops"), P("type", "Style", "enum", "multi", { options: ["single", "multi", "inline"] })]
  },
  {
    name: "Tile",
    label: "Tile",
    group: "Content",
    description: "A plain card with a title and text.",
    w: 4,
    h: 4,
    props: [P("title", "Title", "text", "Title"), P("body", "Text", "area", "Text goes here.")]
  },
  {
    name: "ClickableTile",
    label: "Clickable tile",
    group: "Content",
    description: "A card that opens a link.",
    w: 4,
    h: 3,
    props: [P("text", "Text", "text", "Open the runbook"), P("href", "Address", "text", "https://www.ibm.com/docs")]
  },
  {
    name: "SelectableTile",
    label: "Selectable tile",
    group: "Content",
    description: "A card that can be ticked.",
    w: 4,
    h: 3,
    props: [P("text", "Text", "text", "Select me")]
  },
  {
    name: "ExpandableTile",
    label: "Expandable tile",
    group: "Content",
    description: "A card that opens to show more.",
    w: 4,
    h: 4,
    props: [P("above", "Always shown", "text", "Summary"), P("below", "Shown when open", "area", "More detail.")]
  },
  {
    name: "TileGroup",
    label: "Tile choice",
    group: "Content",
    description: "Choose one of several tiles.",
    w: 6,
    h: 4,
    props: [P("legend", "Legend", "text", "Pick one"), ITEMS]
  },
  {
    name: "ScrollPane",
    label: "Scroll pane",
    group: "Content",
    description: "A panel that scrolls when what is inside is taller (or wider) than it. Holds any widgets.",
    w: 6,
    h: 8,
    minW: 2,
    minH: 3,
    props: [P("direction", "Scrolls", "enum", "vertical", { options: ["vertical", "horizontal", "both"], help: "Vertical: taller content scrolls up and down. Horizontal and both make the inside wider than the pane." }), P("width", "Inside width when scrolling sideways (% of the pane)", "number", 200), P("content", "Content", "area", "widgets")]
  },
  {
    name: "Carousel",
    label: "Carousel",
    group: "Content",
    description: "Slides with arrows and dots. Each slide holds widgets, text or a dashboard. Can advance by itself.",
    w: 12,
    h: 10,
    minW: 3,
    minH: 4,
    props: [P("items", "Slides (Label :: text)", "lines", ["Slide 1 :: widgets", "Slide 2 :: widgets", "Slide 3 :: widgets"]), P("auto", "Advance by itself every (seconds, 0 = off)", "number", 0, { help: "Only while viewing, never while editing." }), P("dots", "Show dots", "bool", true), P("loop", "Go round again after the last slide", "bool", true)]
  },
  {
    name: "Toolbar",
    label: "Toolbar",
    group: "Content",
    description: "A slim strip for inputs: a search box, dropdowns, toggles. Wire them to the widgets below.",
    w: 12,
    h: 4,
    minW: 3,
    minH: 2,
    props: [P("label", "Label (optional)", "text", ""), P("content", "Content", "area", "widgets")]
  },
  {
    name: "SplitPane",
    label: "Split pane (resizable)",
    group: "Content",
    description: "Two panels with a draggable divider. Each holds widgets, text or a dashboard.",
    w: 12,
    h: 10,
    minW: 3,
    minH: 3,
    props: [P("direction", "Direction", "enum", "horizontal", { options: ["horizontal", "vertical"], help: "Horizontal puts the panels side by side." }), P("first", "First panel (text or tile:id#part)", "area", "widgets"), P("second", "Second panel (text or tile:id#part)", "area", "widgets"), P("size", "First panel size (%)", "number", 60), P("min", "Smallest panel (%)", "number", 15)]
  },
  {
    name: "Accordion",
    label: "Accordion",
    group: "Content",
    description: "Sections that open and close. Each holds widgets, text or a dashboard.",
    w: 6,
    h: 6,
    props: [P("items", "Sections (Title :: text)", "lines", ["Overview :: widgets", "Details :: widgets"]), P("align", "Arrow", "enum", "end", { options: ["start", "end"] }), P("size", "Size", "enum", "md", { options: SIZES }), P("flush", "Flush", "bool", false), P("single", "One section open at a time", "bool", false), P("startOpen", "Start with every section open", "bool", false)]
  },
  {
    name: "Tabs",
    label: "Tabs",
    group: "Content",
    description: "Tabs; each holds widgets, text or a dashboard.",
    w: 12,
    h: 10,
    minW: 3,
    minH: 3,
    props: [P("items", "Tabs (Label :: text)", "lines", ["Overview :: widgets", "Details :: widgets"]), P("contained", "Contained", "bool", false), P("size", "Size", "enum", "md", { options: ["md", "lg"] })]
  },
  {
    name: "Breadcrumb",
    label: "Breadcrumb",
    group: "Navigation",
    description: "A trail of links. Each line: Label :: address.",
    w: 6,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("items", "Crumbs (Label :: address)", "lines", ["Home :: #", "Dashboards :: #", "This one"]), P("noTrailingSlash", "No trailing slash", "bool", false)]
  },
  {
    name: "ContainedList",
    label: "Contained list",
    group: "Content",
    description: "A boxed list with a heading.",
    w: 4,
    h: 6,
    props: [P("label", "Heading", "text", "Items"), ITEMS, P("kind", "Style", "enum", "on-page", { options: ["on-page", "disclosed"] }), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "TreeView",
    label: "Tree",
    group: "Content",
    description: "A tree. Indent a line by two spaces to nest it.",
    w: 4,
    h: 8,
    props: [P("label", "Label", "text", "Services"), P("items", "Nodes (indent 2 spaces per level)", "lines", ["Platform", "  ingress", "  openshift-node", "Digital", "  payments", "  orders"])]
  },
  {
    name: "DataTable",
    label: "Data table",
    group: "Data",
    description: "Carbon data table of the rows: sorting, search, paging.",
    w: 8,
    h: 10,
    minW: 3,
    minH: 4,
    uses: "rows",
    data: "always",
    props: [P("size", "Row height", "enum", "md", { options: ["xs", "sm", "md", "lg", "xl"] }), P("sortable", "Sortable columns", "bool", true), P("search", "Search box", "bool", true), P("zebra", "Zebra stripes", "bool", false), P("pagination", "Paging", "bool", true), P("pageSize", "Rows per page", "number", 10)]
  },
  {
    name: "StructuredList",
    label: "Structured list",
    group: "Data",
    description: "The rows as a Carbon structured list.",
    w: 6,
    h: 8,
    minW: 3,
    minH: 3,
    uses: "rows",
    data: "always",
    props: [P("condensed", "Condensed", "bool", false), P("flush", "Flush", "bool", false)]
  },
  {
    name: "Tag",
    label: "Tag",
    group: "Status",
    description: "A coloured label, optionally with a live figure.",
    w: 2,
    h: 2,
    minW: 1,
    minH: 1,
    uses: "measure",
    data: "showValue",
    props: [P("text", "Text", "text", "Critical"), P("type", "Colour", "enum", "auto", { help: "\u201Cauto\u201D uses the severity or priority colour when this tag counts one severity or priority (set under Data).", options: ["auto", "red", "magenta", "purple", "blue", "cyan", "teal", "green", "gray", "cool-gray", "warm-gray", "high-contrast", "outline"] }), P("size", "Size", "enum", "md", { options: SIZES }), P("showValue", "Show the measure after the text", "bool", false)]
  },
  {
    name: "ProgressBar",
    label: "Progress bar",
    group: "Status",
    description: "A bar toward a target, fixed or from live data.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "measure",
    data: "source=live",
    props: [P("label", "Label", "text", "Progress"), P("helperText", "Helper text", "text", ""), P("source", "Value", "enum", "fixed", { options: ["fixed", "live"], help: "\u201Clive\u201D uses the measure under Data." }), P("value", "Value (fixed)", "number", 40), P("max", "Maximum", "number", 100), P("status", "Status", "enum", "active", { options: ["active", "finished", "error"] }), P("size", "Size", "enum", "big", { options: ["small", "big"] })]
  },
  {
    name: "ProgressIndicator",
    label: "Progress steps",
    group: "Status",
    description: "Steps with the current one marked.",
    w: 8,
    h: 3,
    minW: 3,
    minH: 2,
    props: [P("items", "Steps", "lines", ["Detect", "Correlate", "Resolve"]), P("current", "Current step (from 0)", "number", 1), P("vertical", "Vertical", "bool", false), P("spaceEqually", "Space equally", "bool", true)]
  },
  {
    name: "InlineNotification",
    label: "Notification (inline)",
    group: "Status",
    description: "A banner; can appear only when a measure crosses a number.",
    w: 6,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "measure",
    data: "notice",
    props: NOTICE_PROPS
  },
  {
    name: "ToastNotification",
    label: "Notification (toast)",
    group: "Status",
    description: "A toast card.",
    w: 4,
    h: 3,
    minW: 2,
    minH: 2,
    uses: "measure",
    data: "notice",
    props: NOTICE_PROPS
  },
  {
    name: "ActionableNotification",
    label: "Notification (with action)",
    group: "Status",
    description: "A banner with an action button.",
    w: 6,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "measure",
    data: "notice",
    props: [...NOTICE_PROPS, P("actionLabel", "Button text", "text", "View")]
  },
  {
    name: "InlineLoading",
    label: "Inline loading",
    group: "Status",
    description: "A spinner with text.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("description", "Text", "text", "Loading\u2026"), P("status", "Status", "enum", "active", { options: ["active", "inactive", "finished", "error"] })]
  },
  {
    name: "Loading",
    label: "Loading spinner",
    group: "Status",
    description: "A spinner.",
    w: 2,
    h: 3,
    minW: 1,
    minH: 1,
    props: [P("small", "Small", "bool", false), P("description", "Description", "text", "Loading")]
  },
  {
    name: "SkeletonText",
    label: "Skeleton text",
    group: "Status",
    description: "Grey placeholder lines.",
    w: 4,
    h: 3,
    props: [P("lineCount", "Lines", "number", 3), P("heading", "Heading", "bool", false), P("paragraph", "Paragraph", "bool", true)]
  },
  {
    name: "SkeletonPlaceholder",
    label: "Skeleton block",
    group: "Status",
    description: "A grey placeholder block.",
    w: 4,
    h: 4,
    props: []
  },
  {
    name: "Button",
    label: "Button",
    group: "Actions",
    description: "A button, optionally a link.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Text", "text", "Open"), P("kind", "Kind", "enum", "primary", { options: ["primary", "secondary", "tertiary", "ghost", "danger", "danger--tertiary", "danger--ghost"] }), P("size", "Size", "enum", "md", { options: ["sm", "md", "lg", "xl", "2xl"] }), P("href", "Address (makes it a link)", "text", ""), P("disabled", "Disabled", "bool", false)]
  },
  {
    name: "ButtonSet",
    label: "Button set",
    group: "Actions",
    description: "Buttons side by side. Each line: Label :: address.",
    w: 6,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("items", "Buttons (Label :: address)", "lines", ["Cancel", "Save"]), P("stacked", "Stacked", "bool", false)]
  },
  {
    name: "CopyButton",
    label: "Copy button",
    group: "Actions",
    description: "Copies a text to the clipboard.",
    w: 2,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Text to copy", "text", "kubectl get pods"), P("feedback", "Message", "text", "Copied")]
  },
  {
    name: "OverflowMenu",
    label: "Overflow menu",
    group: "Actions",
    description: "A three-dot menu with links. Each line: Label :: address.",
    w: 1,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("items", "Items (Label :: address)", "lines", ["Documentation :: https://www.ibm.com/docs", "Support :: https://www.ibm.com/support"]), P("flipped", "Open to the left", "bool", false), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "MenuButton",
    label: "Menu button",
    group: "Actions",
    description: "A button that opens a menu. Each line: Label :: address.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Text", "text", "Actions"), P("items", "Items (Label :: address)", "lines", ["Documentation :: https://www.ibm.com/docs"]), P("kind", "Kind", "enum", "primary", { options: ["primary", "tertiary", "ghost"] })]
  },
  {
    name: "Modal",
    label: "Modal (opens from a button)",
    group: "Actions",
    description: "A button that opens a dialog.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("buttonLabel", "Button text", "text", "Show details"), P("kind", "Button kind", "enum", "primary", { options: ["primary", "secondary", "tertiary", "ghost"] }), P("heading", "Dialog heading", "text", "Details"), P("modalLabel", "Small label", "text", ""), P("body", "Dialog text", "area", "Text goes here."), P("passive", "Close button only", "bool", true), P("primaryText", "OK button text", "text", "OK"), P("secondaryText", "Cancel button text", "text", "Cancel"), P("size", "Size", "enum", "sm", { options: ["xs", "sm", "md", "lg"] })]
  },
  {
    name: "Tooltip",
    label: "Tooltip",
    group: "Actions",
    description: "A button that explains itself on hover.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Button text", "text", "Hover me"), P("content", "Tooltip text", "text", "More about this."), P("align", "Position", "enum", "bottom", { options: ["top", "bottom", "left", "right"] })]
  },
  {
    name: "Toggletip",
    label: "Toggletip",
    group: "Actions",
    description: "A button that opens a small note.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Button text", "text", "Info"), P("content", "Note", "area", "More about this."), P("align", "Position", "enum", "bottom", { options: ["top", "bottom", "left", "right"] })]
  },
  {
    name: "DefinitionTooltip",
    label: "Definition tooltip",
    group: "Actions",
    description: "A term with its definition on hover.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("text", "Term", "text", "Causal union"), P("definition", "Definition", "text", "Alerts joined into one incident because of a shared cause.")]
  },
  {
    name: "Dropdown",
    label: "Dropdown",
    group: "Inputs",
    description: "A chooser; can list the values of a field and filter other widgets.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("titleText", "Label", "text", "Severity"), P("placeholder", "Placeholder", "text", "Choose"), P("size", "Size", "enum", "md", { options: SIZES }), ITEMS]
  },
  {
    name: "Select",
    label: "Select",
    group: "Inputs",
    description: "A native select; can list the values of a field and filter other widgets.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("labelText", "Label", "text", "State"), P("size", "Size", "enum", "md", { options: SIZES }), ITEMS]
  },
  {
    name: "ComboBox",
    label: "Combo box",
    group: "Inputs",
    description: "A chooser you can type into.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("titleText", "Label", "text", "Resource"), P("placeholder", "Placeholder", "text", "Type or choose"), P("size", "Size", "enum", "md", { options: SIZES }), ITEMS]
  },
  {
    name: "MultiSelect",
    label: "Multi-select",
    group: "Inputs",
    description: "Choose several; can filter other widgets.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("titleText", "Label", "text", "Teams"), P("placeholder", "Placeholder", "text", "Choose options"), P("size", "Size", "enum", "md", { options: SIZES }), ITEMS]
  },
  {
    name: "RadioButtonGroup",
    label: "Radio buttons",
    group: "Inputs",
    description: "Pick one; can filter other widgets.",
    w: 3,
    h: 4,
    minW: 2,
    minH: 2,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("legendText", "Legend", "text", "View"), P("orientation", "Direction", "enum", "vertical", { options: ["vertical", "horizontal"] }), ITEMS]
  },
  {
    name: "ContentSwitcher",
    label: "Content switcher",
    group: "Inputs",
    description: "Segmented control; can filter other widgets, or show text per segment (Label :: text).",
    w: 6,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "source=field",
    props: [SOURCE, P("size", "Size", "enum", "md", { options: SIZES }), P("items", "Segments (Label :: text)", "lines", ["Day :: Last 24 hours", "Week :: Last 7 days"])]
  },
  {
    name: "Toggle",
    label: "Toggle",
    group: "Inputs",
    description: "An on/off switch.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("labelText", "Label", "text", "Auto refresh"), P("labelA", "Off text", "text", "Off"), P("labelB", "On text", "text", "On"), P("size", "Size", "enum", "md", { options: ["sm", "md"] }), P("on", "On at start", "bool", false)]
  },
  {
    name: "Checkbox",
    label: "Checkbox",
    group: "Inputs",
    description: "A tick box.",
    w: 3,
    h: 2,
    minW: 1,
    minH: 1,
    props: [P("labelText", "Label", "text", "Include cleared alerts"), P("helperText", "Helper text", "text", ""), P("on", "Ticked at start", "bool", false)]
  },
  {
    name: "CheckboxGroup",
    label: "Checkbox group",
    group: "Inputs",
    description: "Several tick boxes.",
    w: 3,
    h: 4,
    props: [P("legendText", "Legend", "text", "Show"), ITEMS, P("orientation", "Direction", "enum", "vertical", { options: ["vertical", "horizontal"] })]
  },
  {
    name: "Search",
    label: "Search",
    group: "Inputs",
    description: "A search box.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("labelText", "Label", "text", "Search"), P("placeholder", "Placeholder", "text", "Search"), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "TextInput",
    label: "Text input",
    group: "Inputs",
    description: "A one-line text box.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("labelText", "Label", "text", "Name"), P("placeholder", "Placeholder", "text", ""), P("helperText", "Helper text", "text", ""), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "PasswordInput",
    label: "Password input",
    group: "Inputs",
    description: "A masked text box.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("labelText", "Label", "text", "Password"), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "TextArea",
    label: "Text area",
    group: "Inputs",
    description: "A multi-line text box.",
    w: 4,
    h: 4,
    minW: 2,
    minH: 2,
    props: [P("labelText", "Label", "text", "Notes"), P("placeholder", "Placeholder", "text", ""), P("rows", "Rows", "number", 4), P("maxCount", "Character limit (0 = none)", "number", 0)]
  },
  {
    name: "NumberInput",
    label: "Number input",
    group: "Inputs",
    description: "A number box with steppers.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("label", "Label", "text", "Count"), P("value", "Start at", "number", 0), P("min", "Smallest", "number", 0), P("max", "Largest", "number", 100), P("step", "Step", "number", 1), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "Slider",
    label: "Slider",
    group: "Inputs",
    description: "A slider.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("labelText", "Label", "text", "Threshold"), P("value", "Start at", "number", 50), P("min", "Smallest", "number", 0), P("max", "Largest", "number", 100), P("step", "Step", "number", 1)]
  },
  {
    name: "DatePicker",
    label: "Date picker",
    group: "Inputs",
    description: "A date or date range.",
    w: 4,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("type", "Type", "enum", "single", { options: ["simple", "single", "range"] }), P("labelText", "Label", "text", "Date"), P("placeholder", "Placeholder", "text", "mm/dd/yyyy")]
  },
  {
    name: "TimePicker",
    label: "Time picker",
    group: "Inputs",
    description: "A time box.",
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    props: [P("labelText", "Label", "text", "Time"), P("placeholder", "Placeholder", "text", "hh:mm")]
  },
  {
    name: "FileUploader",
    label: "File uploader",
    group: "Inputs",
    description: "Choose files.",
    w: 4,
    h: 4,
    minW: 2,
    minH: 2,
    props: [P("title", "Title", "text", "Upload files"), P("description", "Description", "text", "Any file, up to 500 MB"), P("buttonLabel", "Button text", "text", "Add file"), P("multiple", "Several files", "bool", true)]
  },
  {
    name: "Pagination",
    label: "Pagination",
    group: "Navigation",
    description: "Page controls.",
    w: 8,
    h: 2,
    minW: 3,
    minH: 1,
    props: [P("totalItems", "Total items", "number", 120), P("pageSize", "Items per page", "number", 10)]
  },
  {
    name: "PaginationNav",
    label: "Page numbers",
    group: "Navigation",
    description: "Numbered page links.",
    w: 6,
    h: 2,
    minW: 3,
    minH: 1,
    props: [P("totalItems", "Pages", "number", 12), P("itemsShown", "Numbers shown", "number", 5)]
  },
  ...STATUS_SPECS,
  ...CHART_SPECS,
  // Widgets for the Concert Operate queries that are not plain rows.
  {
    name: "IncidentInsights",
    label: "Incident insights",
    group: "Data",
    description: "Probable cause and similar earlier incidents for the incident you choose from its list. Follows other widgets\u2019 filters.",
    w: 6,
    h: 12,
    minW: 4,
    minH: 6,
    uses: "rows",
    data: "always",
    query: "getStories",
    props: [P("show", "Show", "enum", "both", { options: ["both", "probable cause", "similar incidents"] }), P("labelText", "Chooser label", "text", "Incident")]
  },
  {
    name: "RunbookActivity",
    label: "Runbook activity",
    group: "Data",
    description: "Recent runs of the runbooks attached to the alerts shown: runbook, status, when, and which alert.",
    w: 6,
    h: 10,
    minW: 4,
    minH: 5,
    uses: "rows",
    data: "always",
    query: "getAlerts",
    props: [P("rows", "Runs to list", "number", 10), P("statusTags", "Status counts on top", "bool", true)]
  },
  {
    name: "PeoplePicker",
    label: "People and teams",
    group: "Inputs",
    description: 'Choose real people or teams from the tenant\u2019s users and groups. Set "Values of field" under Data to Owner (people) or Team (teams); other widgets filter to the choice.',
    w: 3,
    h: 2,
    minW: 2,
    minH: 1,
    uses: "values",
    data: "always",
    emits: true,
    props: [P("titleText", "Label", "text", "Owner"), P("placeholder", "Placeholder", "text", "Anyone"), P("size", "Size", "enum", "md", { options: SIZES })]
  },
  {
    name: "ApplicationCards",
    label: "Application cards",
    group: "Data",
    description: "One card per business application: worst severity, alert counts, open incidents and criticality. Click a card to filter other widgets.",
    w: 12,
    h: 6,
    minW: 3,
    minH: 3,
    uses: "rows",
    data: "always",
    emits: true,
    query: "getApplications",
    props: [P("minWidth", "Card width (px)", "number", 190)]
  }
];
var BY_NAME = new Map(SPECS.map((x) => [x.name, x]));
function carbonSpec(type) {
  return type.startsWith("carbon:") ? BY_NAME.get(type.slice(7)) : void 0;
}
function carbonDefaults(spec) {
  const o = {};
  spec.props.forEach((x) => {
    if (x.def !== void 0) o[x.key] = x.def;
  });
  return o;
}

// designer/grid.ts
var isOverlay = (i) => Boolean(i && i.config && i.config.overlay);
function overlaps(a, b) {
  if (isOverlay(a) || isOverlay(b)) return false;
  return a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function clampBox(b, minW = 2, minH = 2) {
  const w = Math.min(Math.max(Math.round(b.w), minW), GRID_COLS);
  const h = Math.max(Math.round(b.h), minH);
  const x = Math.min(Math.max(Math.round(b.x), 0), GRID_COLS - w);
  const y = Math.max(Math.round(b.y), 0);
  return { ...b, x, y, w, h };
}
function compact(items) {
  const order = items.map((_, i) => i).sort((i, j) => items[i].y - items[j].y || items[i].x - items[j].x || i - j);
  const placed = [];
  const out = items.slice();
  order.forEach((i) => {
    if (isOverlay(items[i])) {
      out[i] = items[i];
      return;
    }
    let it = { ...items[i], y: 0 };
    while (placed.some((p) => overlaps(it, p))) it = { ...it, y: it.y + 1 };
    placed.push(it);
    out[i] = it;
  });
  return out;
}
function resolve(items, id) {
  if (!items.some((i) => i.id === id)) return compact(items);
  return compactAround(items, id);
}
function compactAround(items, anchorId) {
  const anchor = items.find((i) => i.id === anchorId);
  const others = items.filter((i) => i.id !== anchorId).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [anchor];
  const byId = /* @__PURE__ */ new Map();
  byId.set(anchor.id, anchor);
  others.forEach((o) => {
    if (isOverlay(o)) {
      byId.set(o.id, o);
      return;
    }
    let it = { ...o, y: 0 };
    while (placed.some((p) => overlaps(it, p))) it = { ...it, y: it.y + 1 };
    placed.push(it);
    byId.set(it.id, it);
  });
  return items.map((i) => byId.get(i.id));
}
function moveItem(items, id, x, y) {
  const next = items.map((i) => i.id === id ? clampBox({ ...i, x, y }) : i);
  return resolve(next, id);
}
function resizeItem(items, id, w, h, minW = 2, minH = 2) {
  const next = items.map((i) => i.id === id ? clampBox({ ...i, w, h }, minW, minH) : i);
  return resolve(next, id);
}
function findSpot(items, w, h) {
  const cw = Math.min(Math.max(w, 1), GRID_COLS);
  const rows = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x + cw <= GRID_COLS; x++) {
      const probe = { id: "__new__", x, y, w: cw, h };
      if (!items.some((i) => overlaps(probe, i))) return { x, y };
    }
  }
  return { x: 0, y: rows };
}
function gridHeight(items) {
  return items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
}
var gapFor = (row) => row <= 32 ? 6 : 8;
var CONTENT_PX = {
  Tag: 28,
  ShapeIndicator: 28,
  IconIndicator: 28,
  BadgeIndicator: 28,
  ProgressBar: 64,
  InlineNotification: 64,
  ActionableNotification: 70,
  ToastNotification: 90,
  Button: 40,
  ComboButton: 40,
  Popover: 40,
  MenuButton: 40,
  OverflowMenu: 40,
  CopyButton: 40,
  Toggle: 56,
  Checkbox: 32,
  Search: 44,
  Slider: 72,
  Dropdown: 72,
  Select: 72,
  ComboBox: 72,
  MultiSelect: 72,
  TextInput: 72,
  NumberInput: 72,
  PasswordInput: 72,
  DatePicker: 72,
  TimePicker: 72
};
var CHROME_PX = 38 + 16;
function fitHeights(list, rowH) {
  const row = rowH && rowH >= 24 && rowH <= 96 ? rowH : 48, gap = gapFor(row);
  const out = list.map((w) => ({ ...w }));
  const need = (w) => {
    if (!w.type.startsWith("carbon:") || w.config.chromeless || w.config.overlay) return w.h;
    const c = CONTENT_PX[w.type.slice(7)];
    return c ? Math.max(w.h, Math.ceil((c + CHROME_PX + gap) / (row + gap))) : w.h;
  };
  const groups = /* @__PURE__ */ new Map();
  out.forEach((w) => {
    const k = w.parent || "";
    groups.set(k, [...groups.get(k) || [], w]);
  });
  groups.forEach((items) => {
    const orig = new Map(items.map((w) => [w.id, { y: w.y, h: w.h }]));
    items.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((k) => {
      const o = orig.get(k.id);
      let y = o.y;
      items.forEach((j) => {
        const oj = orig.get(j.id);
        if (j === k || oj.y + oj.h > o.y || j.x >= k.x + k.w || j.x + j.w <= k.x) return;
        y = Math.max(y, j.y + j.h + (o.y - (oj.y + oj.h)));
      });
      k.y = y;
      k.h = Math.max(k.h, need(k));
    });
  });
  return out;
}

// designer/nesting.ts
var MAX_DEPTH = 3;
var slotOwner = (slot) => slot.split("#")[0];
var pairOf = (s) => {
  const i = s.indexOf("::");
  return i < 0 ? [s.trim(), ""] : [s.slice(0, i).trim(), s.slice(i + 2).trim()];
};
var linesOf = (v) => (Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" ? v.split("\n") : []).filter((x) => x.trim() !== "");
function propOf(w, key) {
  const p = w.config.props || {};
  if (p[key] !== void 0) return p[key];
  const spec = carbonSpec(w.type);
  const ps = spec ? spec.props.find((x) => x.key === key) : void 0;
  return ps ? ps.def : void 0;
}
function slotsOfWidget(w) {
  if (w.type === "group") return [{ slot: `${w.id}#0`, label: w.title, owner: w.id }];
  if (w.type === "carbon:ScrollPane" || w.type === "carbon:Toolbar") {
    return String(propOf(w, "content") ?? "widgets").trim() === "widgets" ? [{ slot: `${w.id}#0`, label: w.title, owner: w.id }] : [];
  }
  if (w.type === "carbon:Tabs" || w.type === "carbon:Accordion" || w.type === "carbon:Carousel") {
    const noun = w.type === "carbon:Tabs" ? "tab" : w.type === "carbon:Carousel" ? "slide" : "section";
    return linesOf(propOf(w, "items")).map((l, i) => ({ l: pairOf(l), i })).filter((x) => x.l[1].trim() === "widgets").map((x) => ({ slot: `${w.id}#${x.i}`, label: `${w.title} \u203A ${x.l[0] || `${noun} ${x.i + 1}`}`, owner: w.id }));
  }
  if (w.type === "carbon:SplitPane") {
    const out = [];
    if (String(propOf(w, "first") || "").trim() === "widgets") out.push({ slot: `${w.id}#0`, label: `${w.title} \u203A first panel`, owner: w.id });
    if (String(propOf(w, "second") || "").trim() === "widgets") out.push({ slot: `${w.id}#1`, label: `${w.title} \u203A second panel`, owner: w.id });
    return out;
  }
  return [];
}
var slotsOf = (widgets) => widgets.flatMap(slotsOfWidget);
function compactTree(widgets) {
  const groups = /* @__PURE__ */ new Map();
  widgets.forEach((w, i) => {
    const k = w.parent || "";
    groups.set(k, [...groups.get(k) || [], i]);
  });
  const out = widgets.slice();
  groups.forEach((idx) => {
    const c = compact(idx.map((i) => widgets[i]));
    idx.forEach((i, j) => {
      out[i] = c[j];
    });
  });
  return out;
}

// designer/rows.ts
var RUNBOOK_COLUMN = "@insights.type='aiops.ibm.com/insight-type/runbook'";
var ins = (t) => `@insights.type='aiops.ibm.com/insight-type/${t}'`;
var causal = (src) => `${ins("relationship/causal")} and insights.source='aiops.ibm.com/insight-source/relationship/causal/${src}'`;
var COL = {
  criticality: ins("business/criticality"),
  topoRes: ins("topology/resource"),
  topoGroup: ins("topology/group"),
  anomaly: ins("anomaly"),
  seasonal: ins("seasonal-occurrence"),
  golden: ins("golden-signal"),
  lad1: ins("lad/resolutions"),
  lad2: ins("lad/templates"),
  union: ins("relationship/causal-union"),
  causal: [causal("topological-group"), causal("custom"), causal("temporal")]
};
var TIER1 = [RUNBOOK_COLUMN, "eventCount"];
var TIER2 = ["relatedStoryIds", "relatedContextualStoryIds", "signature", COL.criticality, COL.topoRes, COL.topoGroup, COL.anomaly, COL.seasonal, COL.golden, COL.lad1, COL.lad2, COL.union, ...COL.causal];
var EXTRA_COLUMNS = [...TIER1, ...TIER2];
var ALERT_COLUMNS = [
  "id",
  "severity",
  "state",
  "summary",
  "type.classification",
  "sender.name",
  "resource.name",
  "firstOccurrenceTime",
  "lastOccurrenceTime",
  "closedTime",
  "owner",
  "team",
  "acknowledged",
  "suppressed",
  ...EXTRA_COLUMNS
];
var FIELDS = {
  getAlerts: [
    { key: "severityLabel", label: "Severity", kind: "text" },
    { key: "severity", label: "Severity (number)", kind: "number" },
    { key: "state", label: "State", kind: "text" },
    { key: "resource", label: "Resource", kind: "text" },
    { key: "sender", label: "Source (sender)", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "team", label: "Team", kind: "text" },
    { key: "service", label: "Business service", kind: "text" },
    { key: "runbooks", label: "Runbooks attached", kind: "number" },
    { key: "eventCount", label: "Event count", kind: "number" },
    { key: "runbookName", label: "Runbook", kind: "text" },
    { key: "runbookAutomated", label: "Runbook type", kind: "text" },
    { key: "inIncident", label: "In an incident", kind: "text" },
    { key: "incidentCount", label: "Incidents", kind: "number" },
    { key: "criticality", label: "Business criticality", kind: "number" },
    { key: "entityType", label: "Entity type", kind: "text" },
    { key: "topologyGroup", label: "Topology group", kind: "text" },
    { key: "anomaly", label: "Anomaly", kind: "text" },
    { key: "seasonal", label: "Seasonal", kind: "text" },
    { key: "goldenSignal", label: "Golden signal", kind: "text" },
    { key: "logFixes", label: "Log-analysis fixes", kind: "number" },
    { key: "causalGroup", label: "Causal group", kind: "text" },
    { key: "causalLinks", label: "Causal links", kind: "number" },
    { key: "signature", label: "Signature", kind: "text" },
    { key: "recurrence", label: "Times seen", kind: "number" },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "acknowledged", label: "Acknowledged", kind: "text" },
    { key: "summary", label: "Summary", kind: "text" },
    { key: "firstOccurrence", label: "First occurrence", kind: "time" },
    { key: "lastOccurrence", label: "Last occurrence", kind: "time" },
    { key: "id", label: "Alert id", kind: "text" }
  ],
  getStories: [
    { key: "priority", label: "Priority", kind: "number" },
    { key: "state", label: "State", kind: "text" },
    { key: "team", label: "Team", kind: "text" },
    { key: "service", label: "Business service", kind: "text" },
    { key: "runbooks", label: "Runbooks attached", kind: "number" },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "text" },
    { key: "alertCount", label: "Alert count", kind: "number" },
    { key: "created", label: "Created", kind: "time" },
    { key: "id", label: "Incident id", kind: "text" }
  ],
  // Business applications and services as Concert Operate sees them (getImpactedApplications).
  getApplications: [
    { key: "name", label: "Application", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "severityLabel", label: "Worst severity", kind: "text" },
    { key: "alerts", label: "Alerts", kind: "number" },
    { key: "critical", label: "Critical", kind: "number" },
    { key: "major", label: "Major", kind: "number" },
    { key: "minor", label: "Minor", kind: "number" },
    { key: "warning", label: "Warning", kind: "number" },
    { key: "incidents", label: "Open incidents", kind: "number" },
    { key: "priority", label: "Top incident priority", kind: "number" },
    { key: "criticality", label: "Business criticality", kind: "text" },
    { key: "criticalityValue", label: "Criticality value", kind: "number" },
    { key: "id", label: "Application id", kind: "text" }
  ],
  // One metric of one resource over time, with what the model expected and its forecast (getMetricManagerData and getMetricForecastData).
  getMetricSeries: [
    { key: "time", label: "Time", kind: "time" },
    { key: "kind", label: "Actual or forecast", kind: "text" },
    { key: "value", label: "Value", kind: "number" },
    { key: "expected", label: "Expected", kind: "number" },
    { key: "min", label: "Lower bound", kind: "number" },
    { key: "max", label: "Upper bound", kind: "number" },
    { key: "anomalous", label: "Anomalous", kind: "text" },
    { key: "resource", label: "Resource", kind: "text" },
    { key: "metric", label: "Metric", kind: "text" },
    { key: "id", label: "Point id", kind: "text" }
  ]
};
var DEFAULT_GROUP = { getAlerts: "severityLabel", getStories: "priority", getApplications: "severityLabel", getMetricSeries: "kind" };
var DEFAULT_TIME = { getAlerts: "firstOccurrence", getStories: "created", getApplications: "", getMetricSeries: "time" };
function fieldsOf(query, kind) {
  return FIELDS[query].filter((f) => !kind || f.kind === kind);
}

// designer/tiles-extra.ts
var EXTRA_TILES = [];

// designer/registry.ts
var NATIVE = [
  { type: "kpi", label: "Number", description: "One figure: a count, distinct count, max, average or sum.", w: 3, h: 3, minW: 2, minH: 2 },
  { type: "bar", label: "Bar chart", description: "Rows grouped by a field. Click a bar to filter other widgets.", w: 4, h: 6, minW: 3, minH: 3 },
  { type: "donut", label: "Donut", description: "Share per group. Click a slice to filter other widgets.", w: 4, h: 6, minW: 3, minH: 4 },
  { type: "timeseries", label: "Timeline", description: "Rows counted over time (first occurrence, created and so on).", w: 6, h: 5, minW: 3, minH: 3 },
  { type: "table", label: "Table", description: "The rows themselves, with the columns you pick.", w: 6, h: 8, minW: 3, minH: 3 },
  { type: "image", label: "Image", description: "A picture (PNG, JPEG, GIF, WebP, SVG, BMP) kept inside the dashboard.", w: 4, h: 5, minW: 1, minH: 1 },
  { type: "group", label: "Container", description: "A panel with its own grid that holds other widgets.", w: 6, h: 6, minW: 3, minH: 3 },
  { type: "text", label: "Note", description: "Free text: a heading or a short explanation.", w: 4, h: 2, minW: 2, minH: 1 }
];
var BUILTIN_TILES = [
  { id: "telco-causal-gen2", label: "Telco Causal Mesh (Gen 2)", description: "Topology, insight views and replay. Give it at least 8 x 14 cells.", w: 12, h: 16 },
  { id: "telco-causal", label: "Telco Causal Mesh (original)", description: "3D mesh and signal observatory.", w: 12, h: 14 },
  { id: "telco-command", label: "Telco Command Center", description: "360-degree operations view.", w: 12, h: 14 },
  { id: "incident-dashboard", label: "Incident & Alert Dashboard", description: "Incident and alert KPIs, charts and table.", w: 12, h: 14 },
  { id: "cognitive-deep-dive", label: "Cognitive Deep Dive", description: "Investigation view.", w: 12, h: 14 },
  { id: "top-n", label: "Top N (alerts)", description: "Top alert groups.", w: 6, h: 8 },
  { id: "top-n-incidents", label: "Top N (incidents)", description: "Top incident groups.", w: 6, h: 8 },
  { id: "application-heatmap", label: "Application Heatmap", description: "Heatmap by application.", w: 6, h: 8 },
  { id: "incidents-pie-chart", label: "Incident Pie Chart", description: "Incidents by group.", w: 4, h: 7 },
  { id: "monitor-boxes", label: "Monitor Boxes", description: "Alert counts per saved filter.", w: 8, h: 6 },
  { id: "alerts-workflow", label: "Alerts Workflow", description: "Alert status groups.", w: 8, h: 8 }
];
var TILES = [...BUILTIN_TILES];
function registerExtraTiles(list) {
  list.forEach((t) => {
    if (t && typeof t.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(t.id) && !TILES.some((x) => x.id === t.id)) TILES.push(t);
  });
}
registerExtraTiles(EXTRA_TILES);
function tileDef(type) {
  return type.startsWith("tile:") ? TILES.find((t) => `tile:${t.id}` === type) : void 0;
}
function nativeDef(type) {
  return NATIVE.find((n) => n.type === type);
}
function isKnownType(type) {
  return NATIVE.some((n) => n.type === type) || TILES.some((t) => `tile:${t.id}` === type) || !!carbonSpec(type);
}
function minSize(type) {
  const n = nativeDef(type);
  if (n) return { minW: n.minW, minH: n.minH };
  const c = carbonSpec(type);
  return c ? { minW: c.minW || 2, minH: c.minH || 2 } : { minW: 2, minH: 2 };
}
function defaultConfig(type, query = "getAlerts") {
  const base = { query, emits: true, listens: true };
  switch (type) {
    case "kpi":
      return { ...base, metric: "count" };
    case "bar":
      return { ...base, groupBy: DEFAULT_GROUP[query], metric: "count", limit: 8 };
    case "donut":
      return { ...base, groupBy: query === "getAlerts" ? "state" : "state", metric: "count", limit: 6 };
    case "timeseries":
      return { ...base, timeField: DEFAULT_TIME[query], emits: false };
    case "table":
      return {
        ...base,
        emits: false,
        limit: 50,
        columns: query === "getAlerts" ? ["severityLabel", "resource", "summary", "state"] : ["priority", "title", "state", "team"]
      };
    case "text":
      return { ...base, text: "Notes", emits: false, listens: false };
    case "image":
      return { ...base, emits: false, listens: false, fit: "contain" };
    case "group":
      return { ...base, emits: false, listens: false };
    case "carbon:PeoplePicker":
      return { ...base, groupBy: "owner", emits: true, listens: true };
    default: {
      const c = carbonSpec(type);
      if (c) return { ...base, query: query === "getAlerts" && c.query ? c.query : query, emits: c.emits === true, listens: c.uses === "rows" || c.uses === "values" || c.uses === "measure" || c.uses === "chart" };
      return { ...base, emits: false, listens: false };
    }
  }
}
function defaultTitle(type) {
  const n = nativeDef(type);
  if (n) return n.label;
  const t = tileDef(type);
  if (t) return t.label;
  const c = carbonSpec(type);
  return c ? c.label : "Widget";
}

// designer/image.ts
var IMAGE_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];
var IMAGE_MAX_BYTES = 3 * 1024 * 1024;
var IMAGE_MAX_CHARS = Math.ceil(IMAGE_MAX_BYTES * 4 / 3) + 200;
var SRC_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp);base64,[A-Za-z0-9+/]+={0,2}$/;
function isImageSrc(v) {
  return typeof v === "string" && v.length <= IMAGE_MAX_CHARS && SRC_RE.test(v);
}
function imageMimeOk(mime) {
  return IMAGE_MIME.includes(mime);
}
var IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp";
function describeImageError(name, mime) {
  if (/tiff?$/i.test(name) || mime === "image/tiff") {
    return "TIFF cannot be shown in a browser. Convert it to PNG or JPEG first (Concert Workbench\u2019s Layout Editor does this for you).";
  }
  return `\u201C${name}\u201D is not a supported picture. Use PNG, JPEG, GIF, WebP, SVG or BMP.`;
}

// designer/store.ts
var FILE_KIND = "dashboard-builder";
var counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v, fallback, max = 200) {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : fallback;
}
function numOr(v) {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? n : void 0;
}
function jsonClean(v, depth = 0) {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : void 0;
  if (typeof v === "string") return v.slice(0, 2e3);
  if (depth >= 6) return void 0;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => jsonClean(x, depth + 1)).filter((x) => x !== void 0);
  if (isObj(v)) {
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 100) break;
      if (k === "__proto__" || k === "constructor" || k === "prototype" || k.length > 64) continue;
      const c = jsonClean(v[k], depth + 1);
      if (c !== void 0) {
        o[k] = c;
        n += 1;
      }
    }
    return o;
  }
  return void 0;
}
function sanitizeTileProps(raw) {
  if (!isObj(raw)) return void 0;
  const out = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= 24) break;
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(key) || key === "constructor" || key === "prototype") continue;
    const v = raw[key];
    if (typeof v === "string") out[key] = v.slice(0, 500);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
    else if (Array.isArray(v) || isObj(v)) {
      const c = jsonClean(v);
      if (c !== void 0) out[key] = c;
      else continue;
    } else continue;
    n += 1;
  }
  if (n === 0) return void 0;
  return JSON.stringify(out).length > 4e4 ? void 0 : out;
}
function sanitizeSettings(raw) {
  if (!isObj(raw)) return void 0;
  const out = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= 40) break;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(key) || key === "constructor" || key === "prototype" || key === "__proto__") continue;
    const c = jsonClean(raw[key]);
    if (c === void 0) continue;
    out[key] = c;
    n += 1;
  }
  if (n === 0) return void 0;
  return JSON.stringify(out).length > 4e4 ? void 0 : out;
}
function sanitizeConfig(raw, type) {
  const r = isObj(raw) ? raw : {};
  const query = r.query === "getStories" ? "getStories" : r.query === "getApplications" ? "getApplications" : r.query === "getMetricSeries" ? "getMetricSeries" : "getAlerts";
  const base = defaultConfig(type, query);
  const cfg = { ...base, query };
  if (typeof r.filter === "string") cfg.filter = r.filter.slice(0, 500);
  if (typeof r.groupBy === "string") cfg.groupBy = r.groupBy.slice(0, 80);
  if (typeof r.seriesBy === "string") cfg.seriesBy = r.seriesBy.slice(0, 80);
  if (typeof r.valueField === "string") cfg.valueField = r.valueField.slice(0, 80);
  if (typeof r.timeField === "string") cfg.timeField = r.timeField.slice(0, 80);
  if (typeof r.sortBy === "string") cfg.sortBy = r.sortBy.slice(0, 80);
  if (typeof r.sortDesc === "boolean") cfg.sortDesc = r.sortDesc;
  if (r.overlay === true) cfg.overlay = true;
  if (typeof r.bg === "string" && /^#[0-9a-fA-F]{6}$/.test(r.bg)) cfg.bg = r.bg.toLowerCase();
  if (typeof r.fg === "string" && /^#[0-9a-fA-F]{6}$/.test(r.fg)) cfg.fg = r.fg.toLowerCase();
  if (r.followBar === false) cfg.followBar = false;
  if (r.pivot === false) cfg.pivot = false;
  if (r.resize === false) cfg.resize = false;
  if (r.notify === false) cfg.notify = false;
  if (typeof r.text === "string") cfg.text = r.text.slice(0, 2e3);
  if (typeof r.part === "string") cfg.part = r.part.slice(0, 200);
  if (type === "text" && typeof r.chromeless === "boolean") cfg.chromeless = r.chromeless;
  if (type.startsWith("carbon:")) {
    const props = sanitizeTileProps(r.props);
    if (props) cfg.props = props;
    if (typeof r.chromeless === "boolean") cfg.chromeless = r.chromeless;
  }
  if (type.startsWith("tile:")) {
    const props = sanitizeTileProps(r.props);
    if (props) cfg.props = props;
    const settings = sanitizeSettings(r.settings);
    if (settings) cfg.settings = settings;
    if (typeof r.chromeless === "boolean") cfg.chromeless = r.chromeless;
  }
  if (type === "image") {
    if (isImageSrc(r.src)) cfg.src = r.src;
    if (typeof r.alt === "string") cfg.alt = r.alt.slice(0, 200);
    if (r.fit === "cover" || r.fit === "fill" || r.fit === "contain") cfg.fit = r.fit;
  }
  if (["count", "distinct", "max", "avg", "sum"].includes(r.metric)) cfg.metric = r.metric;
  if (Array.isArray(r.columns)) cfg.columns = r.columns.filter((c) => typeof c === "string").slice(0, 12);
  const limit = numOr(r.limit);
  if (limit !== void 0) cfg.limit = Math.min(Math.max(Math.round(limit), 1), 500);
  const refresh = numOr(r.refreshSeconds);
  if (refresh !== void 0) cfg.refreshSeconds = refresh <= 0 ? 0 : Math.min(Math.max(Math.round(refresh), 10), 3600);
  if (typeof r.emits === "boolean") cfg.emits = r.emits;
  if (typeof r.listens === "boolean") cfg.listens = r.listens;
  if (typeof r.hidden === "boolean" && r.hidden) cfg.hidden = true;
  if (Array.isArray(r.on)) {
    const on = r.on.filter((l) => isObj(l) && typeof l.event === "string" && typeof l.to === "string" && typeof l.do === "string" && l.event && l.to && l.do).slice(0, 40).map((l) => ({
      event: String(l.event).slice(0, 40),
      to: String(l.to).slice(0, 80),
      do: String(l.do).slice(0, 80),
      ...typeof l.arg === "string" && l.arg ? { arg: l.arg.slice(0, 4e3) } : {},
      ...typeof l.when === "string" && l.when ? { when: l.when.slice(0, 200) } : {}
    }));
    if (on.length) cfg.on = on;
  }
  if (Array.isArray(r.sendTo)) cfg.sendTo = r.sendTo.filter((x) => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 80);
  if (isObj(r.drill) && (r.drill.mode === "details" || r.drill.mode === "link")) {
    const u = typeof r.drill.url === "string" ? r.drill.url.trim().slice(0, 500) : "";
    cfg.drill = { mode: r.drill.mode, ...u && /^(https?:\/\/|\/|#)/i.test(u) ? { url: u } : {}, newTab: r.drill.newTab !== false };
  }
  if (isObj(r.bind) && typeof r.bind.field === "string" && r.bind.field) {
    const b = r.bind;
    cfg.bind = { field: b.field.slice(0, 80), op: COND_OPS.includes(b.op) ? b.op : "=", query: b.query === "getStories" ? "getStories" : b.query === "getApplications" ? "getApplications" : b.query === "getMetricSeries" ? "getMetricSeries" : "getAlerts" };
  }
  const cond = (x) => isObj(x) && typeof x.field === "string" && typeof x.value === "string" ? { field: x.field.slice(0, 80), value: x.value.slice(0, 200), ...COND_OPS.includes(x.op) && x.op !== "=" ? { op: x.op } : {} } : void 0;
  const w1 = cond(r.where);
  if (w1) cfg.where = w1;
  if (Array.isArray(r.also)) {
    const more = r.also.map(cond).filter((x) => !!x).slice(0, 8);
    if (more.length) cfg.also = more;
  }
  return cfg;
}
var BAR_PRESETS = ["all", "15m", "1h", "6h", "24h", "7d", "30d", "custom"];
function sanitizeBar(raw) {
  if (!isObj(raw)) return void 0;
  const fields = [];
  (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 12).forEach((f) => {
    if (isObj(f) && (f.query === "getAlerts" || f.query === "getStories") && typeof f.field === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(f.field) && !fields.some((x) => x.query === f.query && x.field === f.field)) fields.push({ query: f.query, field: f.field });
  });
  const bar2 = { fields };
  if (raw.time === true) bar2.time = true;
  if (raw.timeField === "firstOccurrence" || raw.timeField === "lastOccurrence") bar2.timeField = raw.timeField;
  if (typeof raw.preset === "string" && BAR_PRESETS.includes(raw.preset) && raw.preset !== "custom") bar2.preset = raw.preset;
  if (Number.isFinite(Number(raw.refresh)) && Number(raw.refresh) > 0) bar2.refresh = Math.min(Math.max(Math.round(Number(raw.refresh)), 5), 3600);
  return bar2;
}
function sanitizeDashboard(raw) {
  if (!isObj(raw) || !Array.isArray(raw.widgets)) return null;
  let dropped = 0;
  const widgets = [];
  const seen = /* @__PURE__ */ new Set();
  raw.widgets.forEach((w) => {
    if (!isObj(w) || typeof w.type !== "string" || !isKnownType(w.type)) {
      dropped++;
      return;
    }
    const type = w.type;
    let id = typeof w.id === "string" && w.id ? w.id : newId("w");
    if (seen.has(id)) id = newId("w");
    seen.add(id);
    const { minW, minH } = minSize(type);
    const box = clampBox({ id, x: Number(w.x) || 0, y: Number(w.y) || 0, w: Number(w.w) || 4, h: Number(w.h) || 4 }, minW, minH);
    widgets.push({
      id,
      type,
      title: str(w.title, "Widget", 120),
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      config: sanitizeConfig(w.config, type),
      ...typeof w.parent === "string" && /^[A-Za-z0-9_-]{1,80}#\d{1,2}$/.test(w.parent) ? { parent: w.parent } : {}
    });
  });
  const ids = new Set(widgets.map((x) => x.id));
  widgets.forEach((x) => {
    if (!x.parent) return;
    let cur = x;
    let n = 0;
    let ok = true;
    while (cur && cur.parent && n < MAX_DEPTH + 2) {
      const o = slotOwner(cur.parent);
      if (!ids.has(o) || o === cur.id) {
        ok = false;
        break;
      }
      cur = widgets.find((y) => y.id === o);
      n++;
    }
    if (!ok || n >= MAX_DEPTH + 2) delete x.parent;
  });
  widgets.forEach((x) => {
    if (x.config.sendTo) {
      const s = x.config.sendTo.filter((t) => ids.has(t) && t !== x.id);
      if (s.length) x.config.sendTo = s;
      else delete x.config.sendTo;
    }
  });
  widgets.forEach((x) => {
    if (x.config.on) {
      const k = x.config.on.filter((l) => ids.has(l.to) && l.to !== x.id);
      if (k.length) x.config.on = k;
      else delete x.config.on;
    }
  });
  const rowN = Number(raw.rowH);
  const laid = fitHeights(compactTree(widgets), Number.isFinite(rowN) && rowN > 0 ? Math.min(Math.max(Math.round(rowN), 24), 96) : void 0);
  return {
    dashboard: { id: str(raw.id, newId("d"), 80), name: str(raw.name, "Imported dashboard", 80), updated: Date.now(), widgets: laid, ...sanitizeBar(raw.bar) ? { bar: sanitizeBar(raw.bar) } : {}, ...Number.isFinite(Number(raw.rowH)) && Number(raw.rowH) > 0 ? { rowH: Math.min(Math.max(Math.round(Number(raw.rowH)), 24), 96) } : {} },
    dropped
  };
}
function exportJson(d) {
  return JSON.stringify({ kind: FILE_KIND, version: 1, dashboard: d }, null, 2);
}
function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: "That file is not valid JSON." };
  }
  const body = isObj(parsed) && parsed.kind === FILE_KIND ? parsed.dashboard : parsed;
  const s = sanitizeDashboard(body);
  if (!s) return { error: "That file does not look like a dashboard exported from this builder." };
  return { dashboard: { ...s.dashboard, id: newId("d") }, dropped: s.dropped };
}

// designer/templates.ts
var stable = null;
var widgetId = () => stable ? `w-${stable.prefix}-${++stable.n}` : newId("w");
var stably = (id, build) => () => {
  const prev = stable;
  stable = { prefix: id, n: 0 };
  try {
    return build();
  } finally {
    stable = prev;
  }
};
var Sheet = class {
  constructor() {
    __publicField(this, "list", []);
  }
  add(type, title, x, y, w, h, cfg = {}, parent) {
    const base = defaultConfig(type, cfg.query || "getAlerts");
    const widget = { id: widgetId(), type, title, x, y, w, h, config: { ...base, ...cfg }, ...parent ? { parent } : {} };
    this.list.push(widget);
    return widget;
  }
};
var A = (...f) => f.map((field) => ({ query: "getAlerts", field }));
var S = (...f) => f.map((field) => ({ query: "getStories", field }));
var bar = (fields, extra = {}) => ({ fields, time: true, preset: "all", ...extra });
var where = (field, value, op) => ({ field, value, ...op ? { op } : {} });
var kpi = (s, title, x, y, w, cfg = {}, parent) => s.add("kpi", title, x, y, w, 3, { metric: "count", emits: false, ...cfg }, parent);
var fig = (s, title, caption, x, y, w, cfg = {}, parent) => kpi(s, title, x, y, w, { text: caption, ...cfg }, parent);
var OPEN_INC = where("state", "resolved", "!=");
var RED = { bg: "#da1e28", fg: "#ffffff" };
var ORANGE = { bg: "#ff832b", fg: "#161616" };
var PURPLE = { bg: "#393939", fg: "#ffffff" };
var NAVY = { bg: "#262626", fg: "#ffffff" };
var GREEN = { bg: "#525252", fg: "#ffffff" };
var head = (s, title, sub) => s.add("text", title, 0, 0, 12, 2, { text: `# ${title}
${sub}`, emits: false, listens: false, bg: "#161616", fg: "#ffffff", chromeless: true });
var cc0 = (name) => `carbon:${name}`;
var attention = (c = {}) => ({ where: where("severity", "5", ">="), also: [where("acknowledged", "false")], sortBy: "severity", sortDesc: true, ...c });
var operations = () => {
  const s = new Sheet();
  head(s, "Operations overview", "Production alert posture across every monitoring source. Click a bar or slice to filter the rest; click a row for its details.");
  fig(s, "Open alerts", "Across all monitoring sources", 0, 2, 3, NAVY);
  fig(s, "Critical", "Act now", 3, 2, 3, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Major", "Service is degrading", 6, 2, 3, { where: where("severityLabel", "Major"), ...ORANGE });
  fig(s, "Not acknowledged", "Nobody has picked these up", 9, 2, 3, { where: where("acknowledged", "false") });
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 0, 5, 8, 8, { seriesBy: "severityLabel", props: { bins: 24, legend: "bottom" } });
  s.add(cc0("StackedBarChart"), "Severity by team", 8, 5, 4, 8, { groupBy: "team", seriesBy: "severityLabel" });
  s.add("table", "Needs attention: Critical and Major, not yet acknowledged", 0, 13, 8, 10, attention({ columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 50, drill: { mode: "details" } }));
  s.add(cc0("SimpleBarChart"), "Noisiest resources", 8, 13, 4, 10, { groupBy: "resource", limit: 10, props: { horizontal: true } });
  return s.list;
};
var triage = () => {
  const s = new Sheet();
  head(s, "Alert triage", "The work queue: find an alert, see who owns it, decide what to do next. Search narrows every figure, chart and row below.");
  const search = s.add("carbon:Search", "Search summary", 0, 2, 12, 3, { props: { labelText: "Search the alert summary", placeholder: "For example: pod restarting, disk usage, checkout", size: "lg" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false, chromeless: true });
  const out = [];
  out.push(fig(s, "In the queue", "Alerts matching the search and filters", 0, 5, 3, NAVY));
  out.push(fig(s, "Critical and Major", "Need a decision today", 3, 5, 3, { where: where("severity", "5", ">="), ...RED }));
  out.push(fig(s, "Unassigned", "No owner yet", 6, 5, 3, { where: where("owner", "(none)"), ...ORANGE }));
  out.push(fig(s, "Not acknowledged", "Nobody has looked at these", 9, 5, 3, { where: where("acknowledged", "false") }));
  out.push(s.add("bar", "By severity", 0, 8, 4, 5, { groupBy: "severityLabel" }));
  out.push(s.add("bar", "By team", 4, 8, 4, 5, { groupBy: "team" }));
  out.push(s.add("bar", "By monitoring source", 8, 8, 4, 5, { groupBy: "sender", limit: 6 }));
  out.push(s.add("table", "Alerts to work through", 0, 13, 12, 13, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "owner", "acknowledged", "firstOccurrence"], limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }));
  search.config.sendTo = out.map((w) => w.id);
  return s.list;
};
var executive = () => {
  const s = new Sheet();
  head(s, "Executive summary", "Service health in one page for leadership: what is broken, how big it is, who is on it, and whether it is getting better.");
  fig(s, "Open incidents", "Problems under investigation", 0, 2, 3, { query: "getStories", where: OPEN_INC, ...PURPLE });
  fig(s, "Critical alerts", "Customer impact likely", 3, 2, 3, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Open alerts", "Total signal from monitoring", 6, 2, 3, NAVY);
  fig(s, "Teams engaged", "Teams with open work", 9, 2, 3, { metric: "distinct", valueField: "team", ...GREEN });
  s.add(cc0("DonutChart"), "Severity mix", 0, 5, 4, 8, { groupBy: "severityLabel" });
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 4, 5, 8, 8, { seriesBy: "severityLabel", props: { bins: 24 } });
  s.add("table", "Incidents that need leadership attention (priority 1 and 2)", 0, 13, 8, 6, { query: "getStories", where: where("priority", "2", "<="), also: [OPEN_INC], columns: ["priority", "title", "state", "team", "owner", "created"], sortBy: "priority", limit: 10, drill: { mode: "details" } });
  s.add(cc0("SimpleBarChart"), "Open incidents by team", 8, 13, 4, 6, { query: "getStories", groupBy: "team", where: OPEN_INC });
  return s.list;
};
var incidents = () => {
  const s = new Sheet();
  const q = { query: "getStories" };
  head(s, "Incident review", "Incidents (correlated alert groups) by priority, team and state. Click a priority or team to focus the list.");
  fig(s, "Open incidents", "Not yet resolved", 0, 2, 3, { ...q, where: OPEN_INC, ...NAVY });
  fig(s, "Priority 1", "All hands", 3, 2, 3, { ...q, where: where("priority", "1"), also: [OPEN_INC], ...RED });
  fig(s, "Priority 2", "Work in progress", 6, 2, 3, { ...q, where: where("priority", "2"), also: [OPEN_INC], ...ORANGE });
  fig(s, "Alerts in open incidents", "Folded together by correlation", 9, 2, 3, { ...q, where: OPEN_INC, metric: "sum", valueField: "alertCount" });
  s.add(cc0("StackedBarChart"), "Priority by team", 0, 5, 6, 7, { ...q, groupBy: "team", seriesBy: "priority" });
  s.add(cc0("DonutChart"), "Incidents by state", 6, 5, 6, 7, { ...q, groupBy: "state" });
  s.add("table", "Incidents", 0, 12, 12, 7, { ...q, columns: ["priority", "title", "state", "team", "owner", "alertCount", "created"], sortBy: "priority", limit: 50, drill: { mode: "details" } });
  return s.list;
};
var telco = () => {
  const s = new Sheet();
  head(s, "Telco network operations", "Causal mesh and command views on live alerts. The tabs below are your own dashboards, embedded.");
  fig(s, "Open alerts", "Network and service alarms", 0, 2, 4, NAVY);
  fig(s, "Critical", "Service-affecting", 4, 2, 4, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Open incidents", "Correlated faults", 8, 2, 4, { query: "getStories", where: OPEN_INC, ...PURPLE });
  const tabs = s.add("carbon:Tabs", "Network views", 0, 5, 12, 17, { props: { items: ["Causal mesh :: widgets", "Command center :: widgets", "Alerts :: widgets"] }, listens: false });
  const mesh = tileDef("tile:telco-causal-gen2");
  const cmd = tileDef("tile:telco-command");
  if (mesh) s.add("tile:telco-causal-gen2", mesh.label, 0, 0, 12, 14, {}, `${tabs.id}#0`);
  if (cmd) s.add("tile:telco-command", cmd.label, 0, 0, 12, 14, {}, `${tabs.id}#1`);
  s.add(cc0("SimpleBarChart"), "Alerts by type", 0, 0, 5, 9, { groupBy: "type" }, `${tabs.id}#2`);
  s.add("table", "Alerts", 5, 0, 7, 12, { columns: ["severityLabel", "resource", "summary", "firstOccurrence"], sortBy: "severity", sortDesc: true, limit: 50, drill: { mode: "details" } }, `${tabs.id}#2`);
  return s.list;
};
var workspace = () => {
  const s = new Sheet();
  head(s, "Investigation workspace", "Search on the left, read the pattern on the right. Everything follows the search box and anything you click.");
  const sp = s.add("carbon:SplitPane", "Investigation", 0, 2, 12, 19, { props: { direction: "horizontal", first: "widgets", second: "widgets", size: 56 }, listens: false });
  const search = s.add("carbon:Search", "Search summary", 0, 0, 12, 3, { props: { labelText: "Search the alert summary", placeholder: "Type to narrow the alerts" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false, chromeless: true }, `${sp.id}#0`);
  const table = s.add("table", "Alerts", 0, 3, 12, 14, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }, `${sp.id}#0`);
  const a = s.add(cc0("DonutChart"), "Severity", 0, 0, 6, 7, { groupBy: "severityLabel" }, `${sp.id}#1`);
  const b = s.add(cc0("SimpleBarChart"), "Team", 6, 0, 6, 7, { groupBy: "team" }, `${sp.id}#1`);
  const c = s.add(cc0("StackedAreaChart"), "Alerts over time", 0, 7, 12, 8, { seriesBy: "severityLabel" }, `${sp.id}#1`);
  search.config.sendTo = [table.id, a.id, b.id, c.id];
  return s.list;
};
var noc = () => {
  const s = new Sheet();
  head(s, "NOC command center", "One screen for the shift: figures on top, views on the left, where-from breakdowns on the right.");
  fig(s, "Open alerts", "Right now", 0, 2, 3, NAVY);
  fig(s, "Critical", "Act now", 3, 2, 3, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Major", "Degrading", 6, 2, 3, { where: where("severityLabel", "Major"), ...ORANGE });
  fig(s, "Not acknowledged", "Unowned", 9, 2, 3, { where: where("acknowledged", "false") });
  const sp = s.add("carbon:SplitPane", "Command center", 0, 5, 12, 20, { props: { direction: "horizontal", first: "widgets", second: "widgets", size: 64 }, listens: false });
  const tabs = s.add("carbon:Tabs", "Views", 0, 0, 12, 18, { props: { items: ["Overview :: widgets", "Alerts :: widgets", "Timeline :: widgets"] }, listens: false }, `${sp.id}#0`);
  s.add(cc0("StackedBarChart"), "Severity by team", 0, 0, 6, 14, { groupBy: "severityLabel", seriesBy: "team" }, `${tabs.id}#0`);
  s.add(cc0("DonutChart"), "By monitoring source", 6, 0, 6, 14, { groupBy: "sender", limit: 6 }, `${tabs.id}#0`);
  s.add("table", "Alerts", 0, 0, 12, 14, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }, `${tabs.id}#1`);
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 0, 0, 12, 12, { seriesBy: "severityLabel" }, `${tabs.id}#2`);
  const acc = s.add("carbon:Accordion", "Breakdowns", 0, 0, 12, 18, { props: { items: ["By team :: widgets", "Top monitoring sources :: widgets", "Busiest resources :: widgets"], startOpen: true }, listens: false }, `${sp.id}#1`);
  s.add("bar", "By team", 0, 0, 12, 3, { groupBy: "team" }, `${acc.id}#0`);
  s.add("bar", "Top sources", 0, 0, 12, 4, { groupBy: "sender", limit: 6 }, `${acc.id}#1`);
  s.add("bar", "Busiest resources", 0, 0, 12, 6, { groupBy: "resource", limit: 8 }, `${acc.id}#2`);
  return s.list;
};
var service = () => {
  const s = new Sheet();
  head(s, "Service review", "A periodic review pack: summary, incidents, alerts and notes. Use it in the weekly operations meeting.");
  const tabs = s.add("carbon:Tabs", "Service review", 0, 2, 12, 22, { props: { items: ["Summary :: widgets", "Incidents :: widgets", "Alerts :: widgets", "Notes :: widgets"] }, listens: false });
  const t = (i) => `${tabs.id}#${i}`;
  fig(s, "Open alerts", "In scope for this review", 0, 0, 3, NAVY, t(0));
  fig(s, "Critical", "Needs a post-incident look", 3, 0, 3, { where: where("severityLabel", "Critical"), ...RED }, t(0));
  fig(s, "Open incidents", "Still unresolved", 6, 0, 3, { query: "getStories", where: OPEN_INC, ...PURPLE }, t(0));
  fig(s, "Teams involved", "Who carried the load", 9, 0, 3, { metric: "distinct", valueField: "team", ...GREEN }, t(0));
  const sp = s.add("carbon:SplitPane", "Breakdown", 0, 3, 12, 15, { props: { direction: "horizontal", first: "widgets", second: "widgets", size: 45 }, listens: false }, t(0));
  s.add(cc0("DonutChart"), "Severity mix", 0, 0, 12, 11, { groupBy: "severityLabel" }, `${sp.id}#0`);
  const acc = s.add("carbon:Accordion", "Where it comes from", 0, 0, 12, 13, { props: { items: ["By team :: widgets", "By monitoring source :: widgets"], startOpen: true }, listens: false }, `${sp.id}#1`);
  s.add("bar", "By team", 0, 0, 12, 4, { groupBy: "team" }, `${acc.id}#0`);
  s.add("bar", "By source", 0, 0, 12, 5, { groupBy: "sender", limit: 6 }, `${acc.id}#1`);
  s.add(cc0("SimpleBarChart"), "Incidents by team", 0, 0, 4, 9, { query: "getStories", groupBy: "team" }, t(1));
  s.add("table", "Incidents", 4, 0, 8, 14, { query: "getStories", columns: ["priority", "title", "state", "team", "alertCount", "created"], sortBy: "priority", limit: 50, drill: { mode: "details" } }, t(1));
  const search = s.add("carbon:Search", "Search summary", 0, 0, 12, 3, { props: { labelText: "Search the alert summary", placeholder: "Type to narrow the alerts" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false, chromeless: true }, t(2));
  const table = s.add("table", "Alerts", 0, 3, 12, 14, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }, t(2));
  search.config.sendTo = [table.id];
  s.add("text", "Review notes", 0, 0, 12, 8, { text: "# Review notes\nWhat changed this period?\n- Add the notable incidents and what caused them\nWhat is still open, and who owns it?\n- Name an owner and a date for each item\nWhat do we do differently next time?\n- One change per recurring cause", emits: false, listens: false }, t(3));
  return s.list;
};
var workbench = () => {
  const s = new Sheet();
  head(s, "Triage workbench", "Charts above for the shape of the problem, queues below for the work. Critical first.");
  const sp = s.add("carbon:SplitPane", "Workbench", 0, 2, 12, 24, { props: { direction: "vertical", first: "widgets", second: "widgets", size: 34 }, listens: false });
  s.add(cc0("SimpleBarChart"), "By severity", 0, 0, 4, 7, { groupBy: "severityLabel" }, `${sp.id}#0`);
  s.add(cc0("DonutChart"), "By monitoring source", 4, 0, 4, 7, { groupBy: "sender", limit: 6 }, `${sp.id}#0`);
  s.add(cc0("SimpleBarChart"), "By team", 8, 0, 4, 7, { groupBy: "team" }, `${sp.id}#0`);
  const tabs = s.add("carbon:Tabs", "Work queues", 0, 0, 12, 15, { props: { items: ["Critical :: widgets", "Major :: widgets", "Everything else :: widgets"] }, listens: false }, `${sp.id}#1`);
  const cols = ["severityLabel", "resource", "summary", "inIncident", "runbookName", "owner", "firstOccurrence"];
  s.add("table", "Critical alerts", 0, 0, 12, 12, { columns: cols, where: where("severityLabel", "Critical"), limit: 100, drill: { mode: "details" } }, `${tabs.id}#0`);
  s.add("table", "Major alerts", 0, 0, 12, 12, { columns: cols, where: where("severityLabel", "Major"), limit: 100, drill: { mode: "details" } }, `${tabs.id}#1`);
  s.add("table", "Everything else", 0, 0, 12, 12, { columns: cols, where: where("severity", "5", "<"), limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }, `${tabs.id}#2`);
  return s.list;
};
var wall = () => {
  const s = new Sheet();
  const c = s.add("carbon:Carousel", "Wall display", 0, 0, 12, 21, { props: { items: ["Right now :: widgets", "Where it hurts :: widgets", "Incidents :: widgets", "Trend :: widgets"], auto: 12, dots: true, loop: true }, listens: false });
  const at = (i) => `${c.id}#${i}`;
  const big = (title, caption, x, cfg) => s.add("kpi", title, x, 0, 3, 6, { metric: "count", emits: false, text: caption, ...cfg }, at(0));
  big("Open alerts", "Across all sources", 0, { ...NAVY });
  big("Critical", "Act now", 3, { where: where("severityLabel", "Critical"), ...RED });
  big("Major", "Degrading", 6, { where: where("severityLabel", "Major"), ...ORANGE });
  big("Open incidents", "Under investigation", 9, { query: "getStories", where: OPEN_INC, ...PURPLE });
  s.add(cc0("DonutChart"), "Severity mix", 0, 6, 5, 11, { groupBy: "severityLabel" }, at(0));
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 5, 6, 7, 11, { seriesBy: "severityLabel" }, at(0));
  s.add(cc0("StackedBarChart"), "Severity by team", 0, 0, 7, 17, { groupBy: "team", seriesBy: "severityLabel" }, at(1));
  s.add(cc0("SimpleBarChart"), "Busiest resources", 7, 0, 5, 17, { groupBy: "resource", limit: 8, props: { horizontal: true } }, at(1));
  s.add("table", "Incidents by priority", 0, 0, 12, 16, { query: "getStories", columns: ["priority", "title", "team", "state", "alertCount"], sortBy: "priority", limit: 12 }, at(2));
  s.add(cc0("StackedAreaChart"), "Alerts over time by team", 0, 0, 12, 16, { seriesBy: "team" }, at(3));
  return s.list;
};
var teamReport = () => {
  const s = new Sheet();
  head(s, "Team report", "A readout for one team or one period: the figures, then each section opened in turn.");
  fig(s, "Open alerts", "In this report", 0, 2, 3, NAVY);
  fig(s, "Critical", "Highest severity", 3, 2, 3, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Major", "Next highest", 6, 2, 3, { where: where("severityLabel", "Major"), ...ORANGE });
  fig(s, "Open incidents", "Correlated problems", 9, 2, 3, { query: "getStories", where: OPEN_INC, ...PURPLE });
  const acc = s.add("carbon:Accordion", "Report", 0, 5, 12, 22, { props: { items: ["Critical alerts :: widgets", "Major alerts :: widgets", "Incidents by team :: widgets", "Alerts by monitoring source :: widgets"], startOpen: true }, listens: false });
  const cols = ["resource", "summary", "inIncident", "runbookName", "owner", "firstOccurrence"];
  s.add("table", "Critical alerts", 0, 0, 12, 7, { columns: cols, where: where("severityLabel", "Critical"), limit: 50, drill: { mode: "details" } }, `${acc.id}#0`);
  s.add("table", "Major alerts", 0, 0, 12, 7, { columns: cols, where: where("severityLabel", "Major"), limit: 50, drill: { mode: "details" } }, `${acc.id}#1`);
  s.add(cc0("StackedBarChart"), "Incident priority by team", 0, 0, 5, 8, { query: "getStories", groupBy: "team", seriesBy: "priority" }, `${acc.id}#2`);
  s.add("table", "Incidents", 5, 0, 7, 8, { query: "getStories", columns: ["priority", "title", "team", "created"], sortBy: "priority", limit: 20 }, `${acc.id}#2`);
  s.add(cc0("SimpleBarChart"), "Alerts by monitoring source", 0, 0, 12, 8, { groupBy: "sender", limit: 8 }, `${acc.id}#3`);
  return s.list;
};
var hub = () => {
  const s = new Sheet();
  head(s, "Operations hub", "Health, investigation and reports in one place. Tabs on the outside; accordions and split panes inside.");
  const tabs = s.add("carbon:Tabs", "Operations hub", 0, 2, 12, 26, { props: { items: ["Health :: widgets", "Investigate :: widgets", "Reports :: widgets"] }, listens: false });
  const t = (i) => `${tabs.id}#${i}`;
  const health = s.add("carbon:Accordion", "Health sections", 0, 0, 12, 24, { props: { items: ["Headline figures :: widgets", "Severity and source :: widgets", "Trend :: widgets"], startOpen: true }, listens: false }, t(0));
  const h = (i) => `${health.id}#${i}`;
  fig(s, "Open alerts", "All sources", 0, 0, 3, NAVY, h(0));
  fig(s, "Critical", "Act now", 3, 0, 3, { where: where("severityLabel", "Critical"), ...RED }, h(0));
  fig(s, "Major", "Degrading", 6, 0, 3, { where: where("severityLabel", "Major"), ...ORANGE }, h(0));
  fig(s, "Open incidents", "Under investigation", 9, 0, 3, { query: "getStories", where: OPEN_INC, ...PURPLE }, h(0));
  s.add(cc0("SimpleBarChart"), "By severity", 0, 0, 6, 8, { groupBy: "severityLabel" }, h(1));
  s.add(cc0("DonutChart"), "By monitoring source", 6, 0, 6, 8, { groupBy: "sender", limit: 6 }, h(1));
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 0, 0, 12, 8, { seriesBy: "severityLabel" }, h(2));
  const sp = s.add("carbon:SplitPane", "Investigation", 0, 0, 12, 22, { props: { direction: "horizontal", first: "widgets", second: "widgets", size: 58 }, listens: false }, t(1));
  const search = s.add("carbon:Search", "Search summary", 0, 0, 12, 3, { props: { labelText: "Search the alert summary", placeholder: "Type to narrow the alerts" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false, chromeless: true }, `${sp.id}#0`);
  const table = s.add("table", "Alerts", 0, 3, 12, 15, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 100, sortBy: "severity", sortDesc: true, drill: { mode: "details" } }, `${sp.id}#0`);
  const a = s.add(cc0("SimpleBarChart"), "By team", 0, 0, 12, 8, { groupBy: "team" }, `${sp.id}#1`);
  const b = s.add(cc0("SimpleBarChart"), "By monitoring source", 0, 8, 12, 8, { groupBy: "sender", limit: 6 }, `${sp.id}#1`);
  search.config.sendTo = [table.id, a.id, b.id];
  const rep = s.add("carbon:Accordion", "Report sections", 0, 0, 12, 24, { props: { items: ["Critical alerts :: widgets", "Incidents :: widgets"], startOpen: true }, listens: false }, t(2));
  s.add("table", "Critical alerts", 0, 0, 12, 9, { columns: ["resource", "summary", "team", "owner", "firstOccurrence"], where: where("severityLabel", "Critical"), limit: 50, drill: { mode: "details" } }, `${rep.id}#0`);
  s.add("table", "Incidents", 0, 0, 12, 9, { query: "getStories", columns: ["priority", "title", "team", "alertCount", "created"], sortBy: "priority", limit: 20 }, `${rep.id}#1`);
  return s.list;
};
var insight = () => {
  const s = new Sheet();
  const c = (name) => `carbon:${name}`;
  s.add(c("ShapeIndicator"), "Worst severity", 0, 0, 3, 2, { props: { source: "severity", label: "Worst: {value}" } });
  s.add(c("IconIndicator"), "Critical alerts", 3, 0, 3, 2, { where: where("severityLabel", "Critical"), props: { source: "live", label: "{value} critical", warnAt: 1, critAt: 5 } });
  s.add(c("BadgeIndicator"), "Open alerts", 6, 0, 2, 2, { props: { label: "Open", source: "live" } });
  s.add(c("Popover"), "By team", 8, 0, 2, 2, { groupBy: "team", props: { text: "Teams", content: "Pick a team to filter the whole board.", limit: 8 } });
  s.add(c("ComboButton"), "Quick filters", 10, 0, 2, 2, { props: { items: ["Critical only :: filter:severityLabel=Critical", "Major only :: filter:severityLabel=Major", "Clear my filters :: clear", "Documentation :: https://www.ibm.com/docs"] } });
  s.add(c("GaugeChart"), "Alert load", 0, 2, 3, 7, { props: { max: 150, warnAt: 60, critAt: 100, type: "semi" } });
  s.add(c("StackedBarChart"), "Severity by team", 3, 2, 5, 7, { groupBy: "severityLabel", seriesBy: "team", limit: 7 });
  s.add(c("DonutChart"), "By source", 8, 2, 4, 7, { groupBy: "sender", limit: 6 });
  s.add(c("AreaChart"), "Alerts over time by severity", 0, 9, 6, 8, { seriesBy: "severityLabel", props: { bins: 24 } });
  s.add(c("HeatmapChart"), "Team and severity", 6, 9, 6, 8, { groupBy: "team", seriesBy: "severityLabel" });
  s.add(c("AlluvialChart"), "Severity to team", 0, 17, 7, 9, { groupBy: "severityLabel", seriesBy: "team", limit: 7 });
  s.add(c("TreemapChart"), "Busiest resources", 7, 17, 5, 9, { groupBy: "resource", limit: 12 });
  s.add("table", "Alerts", 0, 26, 12, 9, { columns: ["severityLabel", "resource", "summary", "inIncident", "runbookName", "firstOccurrence"], limit: 50, drill: { mode: "details" } });
  return s.list;
};
var cc = (name) => `carbon:${name}`;
var galleryCompare = () => {
  const s = new Sheet();
  s.add(cc("SimpleBarChart"), "Alerts by severity", 0, 0, 4, 7, { groupBy: "severityLabel" });
  s.add(cc("GroupedBarChart"), "Severity by team", 4, 0, 4, 7, { groupBy: "severityLabel", seriesBy: "team" });
  s.add(cc("StackedBarChart"), "Source by severity", 8, 0, 4, 7, { groupBy: "sender", seriesBy: "severityLabel", limit: 6, props: { horizontal: true } });
  s.add(cc("LollipopChart"), "Busiest resources", 0, 7, 4, 7, { groupBy: "resource", limit: 8 });
  s.add(cc("PieChart"), "Alerts by type", 4, 7, 4, 7, { groupBy: "type", limit: 6 });
  s.add(cc("DonutChart"), "Alerts by team", 8, 7, 4, 7, { groupBy: "team" });
  s.add(cc("TreemapChart"), "Resources by alert count", 0, 14, 6, 8, { groupBy: "resource", limit: 14 });
  s.add(cc("WordCloudChart"), "Alert types", 6, 14, 6, 8, { groupBy: "type", props: { limit: 30 } });
  return s.list;
};
var galleryPatterns = () => {
  const s = new Sheet();
  s.add(cc("LineChart"), "Alerts over time by severity", 0, 0, 6, 8, { seriesBy: "severityLabel" });
  s.add(cc("AreaChart"), "Alerts over time by team", 6, 0, 6, 8, { seriesBy: "team" });
  s.add(cc("StackedAreaChart"), "Stacked by severity", 0, 8, 6, 8, { seriesBy: "severityLabel" });
  s.add(cc("ScatterChart"), "Each alert: when and how severe", 6, 8, 6, 8, { seriesBy: "team" });
  s.add(cc("HeatmapChart"), "Team and severity", 0, 16, 6, 8, { groupBy: "team", seriesBy: "severityLabel" });
  s.add(cc("RadarChart"), "Severity profile by team", 6, 16, 6, 8, { groupBy: "severityLabel", seriesBy: "team" });
  s.add(cc("AlluvialChart"), "Type to team", 0, 24, 8, 9, { groupBy: "type", seriesBy: "team", limit: 6 });
  s.add(cc("GaugeChart"), "Alert load", 8, 24, 4, 6, { props: { max: 150, warnAt: 60, critAt: 100 } });
  s.add(cc("MeterChart"), "Critical budget", 8, 30, 4, 3, { where: where("severityLabel", "Critical"), props: { label: "Critical (budget 20)", max: 20, warnAt: 5, critAt: 12 } });
  return s.list;
};
var statusBoard = () => {
  const s = new Sheet();
  const tag = (text, type, x, sev) => s.add(cc("Tag"), text, x, 0, 2, 2, { where: where("severityLabel", sev), props: { text, type, showValue: true } });
  tag("Critical", "auto", 0, "Critical");
  tag("Major", "auto", 2, "Major");
  tag("Minor", "auto", 4, "Minor");
  tag("Warning", "auto", 6, "Warning");
  tag("Information", "auto", 8, "Information");
  tag("Indeterminate", "auto", 10, "Indeterminate");
  s.add(cc("InlineNotification"), "Critical alert banner", 0, 2, 6, 2, { where: where("severityLabel", "Critical"), props: { kind: "error", title: "Critical alerts are open.", subtitle: "Count now:", when: "above", threshold: 0, showValue: true, hideClose: true } });
  s.add(cc("InlineNotification"), "Major alert banner", 6, 2, 6, 2, { where: where("severityLabel", "Major"), props: { kind: "warning", title: "Major alerts are piling up.", subtitle: "Count now:", when: "above", threshold: 10, showValue: true, hideClose: true } });
  s.add(cc("ShapeIndicator"), "Worst severity", 0, 4, 3, 2, { props: { source: "severity", label: "Worst: {value}" } });
  s.add(cc("IconIndicator"), "Critical", 3, 4, 3, 2, { where: where("severityLabel", "Critical"), props: { source: "live", label: "{value} critical", warnAt: 1, critAt: 5 } });
  s.add(cc("IconIndicator"), "Major", 6, 4, 3, 2, { where: where("severityLabel", "Major"), props: { source: "live", label: "{value} major", warnAt: 10, critAt: 25 } });
  s.add(cc("BadgeIndicator"), "Not acknowledged", 9, 4, 3, 2, { where: where("acknowledged", "false"), props: { label: "Not acknowledged", source: "live" } });
  s.add(cc("ProgressBar"), "Critical against target", 0, 6, 6, 3, { where: where("severityLabel", "Critical"), props: { label: "Critical alerts (target: under 20)", source: "live", max: 20, size: "big" } });
  s.add(cc("ProgressBar"), "Major against budget", 6, 6, 6, 3, { where: where("severityLabel", "Major"), props: { label: "Major alerts (budget: 60)", source: "live", max: 60, size: "big" } });
  s.add(cc("Popover"), "By team", 0, 9, 3, 2, { groupBy: "team", props: { text: "Teams", content: "Choose a team to filter the table and chart." } });
  s.add(cc("ComboButton"), "Quick filters", 3, 9, 4, 2, { props: { items: ["Critical only :: filter:severityLabel=Critical", "Major only :: filter:severityLabel=Major", "Clear my filters :: clear"] } });
  s.add(cc("DataTable"), "Open alerts", 0, 11, 8, 10, { columns: ["severityLabel", "resource", "summary", "team"], limit: 100, props: { pageSize: 8 } });
  s.add(cc("DonutChart"), "By severity", 8, 11, 4, 10, { groupBy: "severityLabel" });
  return s.list;
};
var controlRoom = () => {
  const s = new Sheet();
  const out = [];
  out.push(kpi(s, "Alerts shown", 3, 0, 3));
  out.push(kpi(s, "Teams", 6, 0, 3, { metric: "distinct", valueField: "team" }));
  out.push(kpi(s, "Resources", 9, 0, 3, { metric: "distinct", valueField: "resource" }));
  out.push(s.add(cc("StackedBarChart"), "Severity by team", 3, 3, 5, 7, { groupBy: "severityLabel", seriesBy: "team" }));
  out.push(s.add(cc("DonutChart"), "By source", 8, 3, 4, 7, { groupBy: "sender", limit: 6 }));
  out.push(s.add(cc("DataTable"), "Alerts", 3, 10, 9, 10, { columns: ["severityLabel", "resource", "summary", "state", "team"], limit: 200 }));
  s.add(cc("Dropdown"), "Severity", 0, 0, 3, 3, { groupBy: "severityLabel", props: { source: "field", titleText: "Severity", placeholder: "Any severity" } });
  s.add(cc("MultiSelect"), "Team", 0, 3, 3, 3, { groupBy: "team", props: { source: "field", titleText: "Teams", placeholder: "Any team" } });
  s.add(cc("RadioButtonGroup"), "State", 0, 6, 3, 4, { groupBy: "state", props: { source: "field", legendText: "State" } });
  s.add(cc("ComboBox"), "Resource", 0, 10, 3, 3, { groupBy: "resource", props: { source: "field", titleText: "Resource", placeholder: "Type or choose" } });
  const search = s.add(cc("Search"), "Search summary", 0, 13, 3, 3, { props: { labelText: "Search the summary", placeholder: "Type to narrow" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false });
  const slider = s.add(cc("Slider"), "Minimum severity", 0, 16, 3, 3, { props: { labelText: "Minimum severity (0 to 6)", min: 0, max: 6, step: 1, value: 0 }, bind: { field: "severity", op: ">=", query: "getAlerts" }, listens: false });
  search.config.sendTo = out.map((w) => w.id);
  slider.config.sendTo = out.map((w) => w.id);
  return s.list;
};
var actionsDemo = () => {
  const s = new Sheet();
  const status = s.add("text", "What is picked", 9, 0, 3, 4, { text: "Nothing picked yet. Click a bar, or use the buttons.", emits: false, listens: false });
  const prog = s.add(cc("ProgressBar"), "Progress", 0, 4, 12, 2, { props: { label: "Progress: press Add 10%", value: 0, max: 100, source: "fixed" } });
  const chart = s.add(cc("SimpleBarChart"), "Alerts by severity", 0, 6, 6, 8, { groupBy: "severityLabel" });
  s.add(cc("DonutChart"), "By source", 6, 6, 6, 8, { groupBy: "sender", limit: 6 });
  const table = s.add(cc("DataTable"), "Alerts", 0, 14, 12, 10, { columns: ["severityLabel", "resource", "summary", "state", "team"], limit: 200, hidden: true });
  s.add(cc("Toggle"), "Show the alert table", 0, 0, 3, 4, { props: { labelText: "Show the alert table", labelA: "Hidden", labelB: "Shown" }, on: [{ event: "change", to: table.id, do: "toggleVisible" }] });
  s.add(cc("Button"), "Critical only", 3, 0, 2, 4, { props: { text: "Critical only", kind: "primary" }, on: [{ event: "click", to: chart.id, do: "pick", arg: "Critical" }] });
  s.add(cc("Button"), "Clear", 5, 0, 2, 4, { props: { text: "Clear", kind: "tertiary" }, on: [{ event: "click", to: chart.id, do: "clearPick" }] });
  s.add(cc("Button"), "Add 10%", 7, 0, 2, 4, { props: { text: "Add 10%", kind: "secondary" }, on: [{ event: "click", to: prog.id, do: "add:value", arg: "10" }] });
  chart.config.on = [{ event: "select", to: status.id, do: "set:text", arg: "Picked: {value}" }];
  return s.list;
};
var incidentDesk = () => {
  const s = new Sheet();
  const q = { query: "getStories" };
  const tag = (text, type, x, pr) => s.add(cc("Tag"), text, x, 0, 2, 2, { ...q, where: where("priority", pr), props: { text, type, showValue: true } });
  tag("Priority 1", "auto", 0, "1");
  tag("Priority 2", "auto", 2, "2");
  tag("Priority 3", "auto", 4, "3");
  tag("Priority 4", "auto", 6, "4");
  s.add(cc("BadgeIndicator"), "Alerts inside incidents", 8, 0, 4, 2, { ...q, metric: "sum", valueField: "alertCount", props: { label: "Alerts inside incidents", source: "live" } });
  s.add(cc("InlineNotification"), "Priority 1 banner", 0, 2, 8, 2, { ...q, where: where("priority", "1"), props: { kind: "error", title: "Priority 1 incidents are open.", subtitle: "Count now:", when: "above", threshold: 0, showValue: true, hideClose: true } });
  s.add(cc("Popover"), "By team", 8, 2, 2, 2, { ...q, groupBy: "team", props: { text: "Teams", content: "Choose a team." } });
  s.add(cc("ComboButton"), "Quick filters", 10, 2, 2, 2, { ...q, props: { items: ["Priority 1 :: filter:priority=1", "Priority 2 :: filter:priority=2", "Clear my filters :: clear"] } });
  s.add(cc("StackedBarChart"), "Priority by team", 0, 4, 4, 7, { ...q, groupBy: "team", seriesBy: "priority" });
  s.add(cc("AreaChart"), "Incidents opened over time", 4, 4, 4, 7, { ...q, seriesBy: "priority" });
  s.add(cc("DonutChart"), "By state", 8, 4, 4, 7, { ...q, groupBy: "state" });
  s.add(cc("StructuredList"), "Incident queue", 0, 11, 5, 9, { ...q, columns: ["priority", "title", "team", "state"], limit: 30 });
  s.add(cc("DataTable"), "Incidents", 5, 11, 7, 9, { ...q, columns: ["priority", "title", "state", "team", "owner", "alertCount"], limit: 100, props: { pageSize: 8 } });
  return s.list;
};
var scorecard = () => {
  const s = new Sheet();
  const rows = [["Critical", 30, 5, 15], ["Major", 60, 20, 40], ["Minor", 60, 25, 45], ["Warning", 60, 25, 45]];
  rows.forEach(([sev, max, warn, crit], i) => {
    const x = i * 3;
    s.add(cc("ShapeIndicator"), `${sev} status`, x, 0, 3, 2, { where: where("severityLabel", sev), props: { source: "live", label: `${sev}: {value}`, warnAt: warn, critAt: crit } });
    s.add(cc("GaugeChart"), `${sev} load`, x, 2, 3, 6, { where: where("severityLabel", sev), props: { max, warnAt: warn, critAt: crit, type: "semi" } });
    s.add(cc("MeterChart"), `${sev} budget`, x, 8, 3, 3, { where: where("severityLabel", sev), props: { label: `${sev} (budget ${max})`, max, warnAt: warn, critAt: crit } });
  });
  s.add(cc("AlluvialChart"), "Severity to team", 0, 11, 7, 9, { groupBy: "severityLabel", seriesBy: "team", limit: 7 });
  s.add(cc("HeatmapChart"), "Team and severity", 7, 11, 5, 9, { groupBy: "team", seriesBy: "severityLabel" });
  return s.list;
};
var headed = (title, sub, build) => () => {
  const list = build();
  list.forEach((w) => {
    if (!w.parent) w.y += 2;
  });
  const s = new Sheet();
  const h = head(s, title, sub);
  return [h, ...list];
};
var incidentOps = () => {
  const s = new Sheet();
  head(s, "Incident command center", "Open incidents, severity, sources and the live alert stream. Click any bar, slice or tile to filter everything else; click a row for details.");
  fig(s, "Open incidents", "Under investigation", 0, 2, 2, { query: "getStories", where: OPEN_INC, ...NAVY });
  fig(s, "Priority 1 and 2", "Leadership attention", 2, 2, 2, { query: "getStories", where: where("priority", "2", "<="), also: [OPEN_INC], ...RED });
  fig(s, "Critical alerts", "Severity 6, act now", 4, 2, 2, { where: where("severityLabel", "Critical"), ...RED });
  fig(s, "Major alerts", "Severity 5, degrading", 6, 2, 2, { where: where("severityLabel", "Major"), ...ORANGE });
  fig(s, "Not acknowledged", "Nobody has picked these up", 8, 2, 2, { where: where("acknowledged", "false") });
  fig(s, "Resources affected", "Distinct hosts and services", 10, 2, 2, { metric: "distinct", valueField: "resource", ...GREEN });
  const appRow = [];
  appRow.push(s.add("table", "Application health", 0, 5, 8, 7, { query: "getApplications", columns: ["name", "severityLabel", "alerts", "critical", "major", "incidents", "criticality"], sortBy: "criticalityValue", sortDesc: true, limit: 50 }));
  appRow.push(s.add(cc0("SimpleBarChart"), "Alerts by application", 8, 5, 4, 7, { query: "getApplications", groupBy: "name", metric: "sum", valueField: "alerts", props: { horizontal: true } }));
  s.add(cc0("DonutChart"), "Incidents by priority", 0, 5, 3, 8, { query: "getStories", groupBy: "priority", where: OPEN_INC });
  s.add(cc0("SimpleBarChart"), "Critical alert categories", 3, 5, 3, 8, { groupBy: "type", where: where("severityLabel", "Critical"), limit: 6, props: { horizontal: true } });
  s.add(cc0("SimpleBarChart"), "Major alert categories", 6, 5, 3, 8, { groupBy: "type", where: where("severityLabel", "Major"), limit: 6, props: { horizontal: true } });
  s.add(cc0("DonutChart"), "Alert ingestion sources", 9, 5, 3, 8, { groupBy: "sender", limit: 6 });
  const sp = s.add("carbon:SplitPane", "Incidents and intelligence", 0, 13, 12, 17, { props: { direction: "horizontal", first: "widgets", second: "widgets", size: 62 }, listens: false });
  const isearch = s.add("carbon:Search", "Search incidents", 0, 0, 12, 2, { props: { labelText: "Search incidents", placeholder: "Search incident titles" }, bind: { field: "title", op: "contains", query: "getStories" }, listens: false, chromeless: true }, `${sp.id}#0`);
  const inc = s.add("table", "Active incidents", 0, 2, 12, 15, { query: "getStories", where: OPEN_INC, columns: ["priority", "title", "state", "team", "owner", "alertCount", "runbooks", "created"], sortBy: "priority", limit: 50, drill: { mode: "details" } }, `${sp.id}#0`);
  isearch.config.sendTo = [inc.id];
  const intel = s.add("carbon:Tabs", "Operational intelligence", 0, 0, 12, 17, { props: { items: ["Top resources :: widgets", "Services health :: widgets", "Critical stream :: widgets", "Patterns :: widgets", "Metrics :: widgets", "Incident insights :: widgets"] }, listens: false }, `${sp.id}#1`);
  const t = (i) => `${intel.id}#${i}`;
  s.add(cc0("SimpleBarChart"), "Most affected resources", 0, 0, 12, 14, { groupBy: "resource", limit: 10, props: { horizontal: true } }, t(0));
  s.add(cc0("StackedBarChart"), "Severity by team", 0, 0, 7, 14, { groupBy: "team", seriesBy: "severityLabel" }, t(1));
  s.add(cc0("HeatmapChart"), "Team and severity", 7, 0, 5, 14, { groupBy: "team", seriesBy: "severityLabel" }, t(1));
  s.add("table", "Critical alerts", 0, 0, 12, 14, { columns: ["resource", "summary", "firstOccurrence"], where: where("severityLabel", "Critical"), sortBy: "firstOccurrence", sortDesc: true, limit: 30, drill: { mode: "details" } }, t(2));
  fig(s, "Alerts with no incident", "Not in an incident", 0, 0, 4, { where: where("inIncident", "No"), ...GREEN }, t(3));
  fig(s, "Anomalies", "Metric anomaly", 4, 0, 4, { where: where("anomaly", "Yes") }, t(3));
  fig(s, "Seasonal", "Repeating pattern", 8, 0, 4, { where: where("seasonal", "Yes") }, t(3));
  s.add(cc0("SimpleBarChart"), "Golden signals", 0, 3, 5, 11, { groupBy: "goldenSignal", where: where("goldenSignal", "None", "!=") }, t(3));
  s.add(cc0("SimpleBarChart"), "Alerts that keep recurring", 5, 3, 7, 11, { groupBy: "summary", where: where("recurrence", "2", ">="), limit: 8, props: { horizontal: true } }, t(3));
  s.add(cc0("LineChart"), "Node CPU: actual and forecast", 0, 0, 12, 14, { query: "getMetricSeries", filter: "kubernetesNode|required_cpu_percentage|", seriesBy: "kind", metric: "avg", valueField: "value", props: { bins: 48, legend: "bottom" } }, t(4));
  s.add(cc0("IncidentInsights"), "Incident insights", 0, 0, 12, 14, { query: "getStories", where: OPEN_INC }, t(5));
  const acc = s.add("carbon:Accordion", "Alerts", 0, 30, 12, 32, { props: { items: ["Recent alerts stream :: widgets", "Trend and breakdown :: widgets"], startOpen: true }, listens: false });
  const a = (i) => `${acc.id}#${i}`;
  const stream = s.add("carbon:Tabs", "Alert stream", 0, 0, 12, 18, { props: { items: ["All :: widgets", "Critical :: widgets", "Major :: widgets", "Minor and below :: widgets"] }, listens: false }, a(0));
  const st = (i) => `${stream.id}#${i}`;
  const cols = ["severityLabel", "resource", "summary", "inIncident", "eventCount", "recurrence", "runbookName", "runbookAutomated", "firstOccurrence"];
  const asearch = s.add("carbon:Search", "Search alerts", 0, 0, 12, 2, { props: { labelText: "Search alerts", placeholder: "Summary, resource, source" }, bind: { field: "summary", op: "contains", query: "getAlerts" }, listens: false, chromeless: true }, st(0));
  const all = s.add("table", "All alerts", 0, 2, 12, 14, { columns: cols, sortBy: "severity", sortDesc: true, limit: 200, drill: { mode: "details" } }, st(0));
  asearch.config.sendTo = [all.id];
  s.add("table", "Critical alerts", 0, 0, 12, 16, { columns: cols, where: where("severityLabel", "Critical"), limit: 200, drill: { mode: "details" } }, st(1));
  s.add("table", "Major alerts", 0, 0, 12, 16, { columns: cols, where: where("severityLabel", "Major"), limit: 200, drill: { mode: "details" } }, st(2));
  s.add("table", "Minor and below", 0, 0, 12, 16, { columns: cols, where: where("severity", "5", "<"), sortBy: "severity", sortDesc: true, limit: 200, drill: { mode: "details" } }, st(3));
  s.add(cc0("StackedAreaChart"), "Alert volume by severity", 0, 0, 8, 9, { seriesBy: "severityLabel", props: { bins: 24, legend: "bottom" } }, a(1));
  s.add(cc0("DonutChart"), "Severity mix", 8, 0, 4, 9, { groupBy: "severityLabel" }, a(1));
  s.list.forEach((w) => {
    if (!w.parent && w.y >= 5 && !appRow.includes(w)) w.y += 7;
  });
  return s.list;
};
var appHealth = () => {
  const s = new Sheet();
  const q = { query: "getApplications" };
  head(s, "Application health", "The business applications and services Concert Operate tracks, with their alerts, open incidents and business criticality.");
  fig(s, "Applications", "Tracked by Concert", 0, 2, 3, { ...q, ...NAVY });
  fig(s, "Critical alerts", "Across all applications", 3, 2, 3, { ...q, metric: "sum", valueField: "critical", ...RED });
  fig(s, "Major alerts", "Across all applications", 6, 2, 3, { ...q, metric: "sum", valueField: "major", ...ORANGE });
  fig(s, "Open incidents", "Across all applications", 9, 2, 3, { ...q, metric: "sum", valueField: "incidents", ...PURPLE });
  s.add(cc0("ApplicationCards"), "Applications", 0, 5, 12, 6, { ...q });
  s.add(cc0("DonutChart"), "Applications by worst severity", 0, 11, 4, 8, { ...q, groupBy: "severityLabel" });
  s.add(cc0("SimpleBarChart"), "Alerts by application", 4, 11, 4, 8, { ...q, groupBy: "name", metric: "sum", valueField: "alerts", props: { horizontal: true } });
  s.add(cc0("SimpleBarChart"), "Open incidents by application", 8, 11, 4, 8, { ...q, groupBy: "name", metric: "sum", valueField: "incidents", props: { horizontal: true } });
  s.add("table", "Applications", 0, 19, 8, 10, { ...q, columns: ["name", "type", "severityLabel", "alerts", "critical", "major", "minor", "incidents", "priority", "criticality"], sortBy: "criticalityValue", sortDesc: true, limit: 100 });
  s.add(cc0("DonutChart"), "By business criticality", 8, 19, 4, 10, { ...q, groupBy: "criticality" });
  return s.list;
};
var metricsBoard = () => {
  const s = new Sheet();
  head(s, "Metrics explorer", "Six hours of a metric and what is forecast. Choose the group, metric and resource in each chart\u2019s settings.");
  const line = (title, spec, x, y) => s.add(cc0("LineChart"), title, x, y, 6, 9, { query: "getMetricSeries", filter: spec, seriesBy: "kind", metric: "avg", valueField: "value", props: { bins: 48, legend: "bottom" } });
  line("Node CPU (percent of request)", "kubernetesNode|required_cpu_percentage|", 0, 2);
  line("Node memory (percent of request)", "kubernetesNode|required_mem_percentage|", 6, 2);
  line("Node CPU requested", "kubernetesNode|required_cpu|", 0, 11);
  line("Node CPU: expected range", "kubernetesNode|required_cpu_percentage|", 6, 11);
  s.add("table", "Anomalous points", 0, 20, 12, 7, { query: "getMetricSeries", filter: "kubernetesNode|required_cpu_percentage|", where: where("anomalous", "Yes"), columns: ["time", "resource", "metric", "value", "expected", "min", "max"], limit: 50 });
  return s.list;
};
var insightsBoard = () => {
  const s = new Sheet();
  head(s, "Alert insights", "Which alerts belong to an incident, which are anomalies or repeats, and which have a runbook, automated or not.");
  s.add(cc0("PeoplePicker"), "Owner", 0, 2, 3, 2, { groupBy: "owner", chromeless: true, props: { titleText: "Owner", placeholder: "Anyone", size: "md" } });
  s.add(cc0("PeoplePicker"), "Team", 3, 2, 3, 2, { groupBy: "team", chromeless: true, props: { titleText: "Team", placeholder: "Any team", size: "md" } });
  fig(s, "Alerts with no incident", "Not in an incident", 0, 4, 3, { where: where("inIncident", "No"), ...GREEN });
  fig(s, "Anomalies", "Metric anomaly", 3, 4, 3, { where: where("anomaly", "Yes") });
  fig(s, "Seasonal", "Repeating pattern", 6, 4, 3, { where: where("seasonal", "Yes") });
  fig(s, "Automated runbooks", "Can run by themselves", 9, 4, 3, { where: where("runbookAutomated", "Automated"), ...NAVY });
  s.add(cc0("DonutChart"), "Runbook coverage", 0, 7, 4, 8, { groupBy: "runbookAutomated" });
  s.add(cc0("SimpleBarChart"), "Runbooks used", 4, 7, 4, 8, { groupBy: "runbookName", where: where("runbookName", "(none)", "!="), limit: 8, props: { horizontal: true } });
  s.add(cc0("SimpleBarChart"), "Golden signals", 8, 7, 4, 8, { groupBy: "goldenSignal", where: where("goldenSignal", "None", "!=") });
  s.add(cc0("SimpleBarChart"), "Entity types", 0, 15, 4, 8, { groupBy: "entityType", limit: 8, props: { horizontal: true } });
  s.add(cc0("SimpleBarChart"), "Alerts that keep recurring", 4, 15, 4, 8, { groupBy: "summary", where: where("recurrence", "2", ">="), limit: 8, props: { horizontal: true } });
  s.add(cc0("DonutChart"), "In an incident", 8, 15, 4, 8, { groupBy: "inIncident" });
  s.add("table", "Alerts worth a look: anomalies and repeats", 0, 23, 12, 9, { where: where("anomaly", "Yes"), columns: ["severityLabel", "resource", "summary", "goldenSignal", "entityType", "recurrence", "runbookName", "firstOccurrence"], sortBy: "severity", sortDesc: true, limit: 100, drill: { mode: "details" } });
  s.add(cc0("RunbookActivity"), "Runbook activity", 0, 32, 6, 13, {});
  s.add(cc0("IncidentInsights"), "Incident insights", 6, 32, 6, 13, { query: "getStories", where: OPEN_INC });
  return s.list;
};
var plus = (build, more) => () => {
  const list = build();
  const bottom = list.filter((w) => !w.parent).reduce((m, w) => Math.max(m, w.y + w.h), 0);
  const s = new Sheet();
  more(s, bottom);
  return [...list, ...s.list];
};
var appCards = (s, y) => s.add(cc0("ApplicationCards"), "Applications", 0, y, 12, 6, { query: "getApplications" });
var incInsights = (s, y) => s.add(cc0("IncidentInsights"), "Incident insights", 0, y, 12, 13, { query: "getStories", where: OPEN_INC });
var fitBand = (list, rowH) => {
  const row = rowH || 48, h = Math.max(2, Math.ceil(106 / (row + 6)));
  const band = list.find((w) => !w.parent && w.type === "text" && w.y === 0 && w.h === 2 && w.config.bg === "#161616" && w.config.chromeless);
  if (!band || h === 2) return list;
  list.forEach((w) => {
    if (!w.parent) w.y += h - 2;
  });
  band.y = 0;
  band.h = h;
  return list;
};
var TEMPLATES = [
  {
    id: "incidentops",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type", "sender"), { refresh: 60 }),
    name: "Incident command center",
    advanced: true,
    tagline: "The incident-alert-dashboard, built from components",
    detail: "KPI tiles, four analytic cards, incidents beside a tabbed intelligence panel (split pane + tabs), and the alert stream in severity tabs inside an accordion. Every chart filters the rest; search boxes narrow their own tables.",
    build: incidentOps
  },
  {
    id: "apphealth",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Application health",
    tagline: "Business applications from Concert",
    detail: "The applications and services Concert Operate tracks: alerts by severity, open incidents, top priority and business criticality.",
    build: appHealth
  },
  {
    id: "metrics",
    rowH: 28,
    name: "Metrics explorer",
    tagline: "Metrics and their forecast",
    detail: "Six hours of node CPU and memory, with the forecast. Choose a different group, metric or resource in each chart\u2019s settings.",
    build: metricsBoard
  },
  {
    id: "insights",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type")),
    name: "Alert insights",
    tagline: "Incident link, anomalies, runbooks",
    detail: "Which alerts belong to an incident, which are anomalies or repeats, golden signals, topology entity types, and runbook coverage.",
    build: insightsBoard
  },
  {
    id: "operations",
    rowH: 28,
    bar: bar(A("severityLabel", "state", "sender", "team")),
    name: "Operations overview",
    tagline: "Alerts at a glance",
    detail: "Counts, severity and state charts, a timeline, and a table whose rows open a details panel. Click a bar to filter the rest.",
    build: plus(operations, appCards)
  },
  {
    id: "triage",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type", "state")),
    name: "Alert triage",
    tagline: "Search, filter, work the list",
    detail: "A toolbar with a search box and two dropdowns wired to charts and a table sorted by severity.",
    build: triage
  },
  {
    id: "executive",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Executive summary",
    tagline: "Big numbers, one headline",
    detail: "Four colourful headline figures, an editable headline, the severity mix and the incidents that matter.",
    build: plus(executive, appCards)
  },
  {
    id: "incidents",
    rowH: 28,
    bar: bar(S("priority", "state", "team")),
    name: "Incident review",
    tagline: "Priority, team and state",
    detail: "Everything about incidents (stories): totals, priority, team, state, a timeline and the list.",
    build: plus(incidents, incInsights)
  },
  {
    id: "telco",
    rowH: 28,
    bar: bar(A("severityLabel", "type", "sender")),
    name: "Telco network",
    tagline: "Mesh and command views in tabs",
    detail: "Your causal mesh and command center dashboards in tabs, with alert figures above and an alerts tab.",
    build: telco,
    needs: ["telco-causal-gen2"]
  },
  {
    id: "workspace",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Investigation workspace",
    tagline: "Split screen: list left, charts right",
    detail: "A resizable split pane: search and table on the left, charts on the right, all following each other.",
    build: workspace
  },
  {
    id: "noc",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type", "sender")),
    name: "NOC command center",
    advanced: true,
    tagline: "Split pane + tabs + accordion + filter bar",
    detail: "A filter toolbar over a split pane: tabs (overview, alerts, timeline) on the left, an accordion of breakdowns on the right. Three levels of nesting.",
    build: noc
  },
  {
    id: "service",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Service review",
    advanced: true,
    tagline: "Tabs holding split panes and accordions",
    detail: "Summary, incidents, alerts and notes in tabs. The summary tab has a split pane with an accordion inside it.",
    build: service
  },
  {
    id: "workbench",
    rowH: 28,
    bar: bar(A("team", "type", "state")),
    name: "Triage workbench",
    advanced: true,
    tagline: "Vertical split: charts above, queues below",
    detail: "A vertical split pane: charts on top, and tabs below with a work queue each for Critical, Major and everything else.",
    build: workbench
  },
  {
    id: "wall",
    rowH: 40,
    bar: bar([], { refresh: 60 }),
    name: "Wall display",
    advanced: true,
    tagline: "Carousel that rotates by itself",
    detail: "A carousel that advances every 12 seconds through figures, hot spots, incidents and a timeline. For a screen on the wall.",
    build: wall
  },
  {
    id: "report",
    rowH: 28,
    bar: bar(A("team", "type", "state")),
    name: "Team report",
    advanced: true,
    tagline: "Accordion report with headline figures",
    detail: "Headline figures above an accordion of sections: critical alerts, major alerts, incidents by team, alerts by source.",
    build: plus(teamReport, (s2, y) => {
      s2.add(cc0("RunbookActivity"), "Runbook activity", 0, y, 12, 10, {});
    })
  },
  {
    id: "hub",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Operations hub",
    advanced: true,
    tagline: "Tabs with an accordion or split pane in each tab",
    detail: "Two levels of containment: tabs on the outside; inside, an accordion of health sections, a split pane for investigation, an accordion of report sections.",
    build: hub
  },
  {
    id: "insight",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type")),
    name: "Insight board",
    tagline: "Carbon charts, status indicators and quick filters",
    detail: "Status shape and icon, count badge, a team popover and a combo button of quick filters, over a gauge, stacked bars, donut, area chart, heatmap, flow chart and treemap. Click anything and every chart follows.",
    build: headed("Insight board", "Status at the top, then the shape of the problem in six different charts. Everything is clickable and everything follows.", insight)
  },
  {
    id: "gallery1",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type")),
    name: "Chart gallery: compare",
    tagline: "Eight Carbon charts for comparing categories",
    detail: "Bar, grouped bar, stacked bar, lollipop, pie, donut, treemap and word cloud on live alerts. Click any one and the rest follow.",
    build: headed("Chart gallery: compare", "Eight ways to compare categories on live alerts. Click any one and the rest follow.", galleryCompare)
  },
  {
    id: "gallery2",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type")),
    name: "Chart gallery: patterns",
    tagline: "Time, relationships and thresholds",
    detail: "Line, area, stacked area, scatter, heatmap, radar, flow, gauge and meter on live alerts, with the time range and filter bar driving all of them.",
    build: headed("Chart gallery: patterns", "Change over time, relationships and thresholds. The time range and filter bar drive every chart.", galleryPatterns)
  },
  {
    id: "status",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Status board",
    tagline: "Tags, banners, indicators, progress and badge",
    detail: "Live counts as Carbon tags, banners that appear only when a number crosses a line, status shapes and icons that change colour, progress bars against targets, a count badge, a team popover and quick filters.",
    build: headed("Status board", "Live counts as tags, banners that appear only when a number crosses a line, indicators and targets.", statusBoard)
  },
  {
    id: "control",
    rowH: 28,
    bar: bar(A("severityLabel", "team", "type")),
    name: "Control room",
    tagline: "Carbon inputs driving charts and a table",
    detail: "A dropdown, multi-select, radio buttons, combo box, search box and slider, wired to figures, a stacked bar, a donut and a data table.",
    build: headed("Control room", "Inputs on the left drive the figures, charts and table on the right.", controlRoom)
  },
  {
    id: "actions",
    rowH: 28,
    bar: bar(A("severityLabel", "team")),
    name: "Interactive controls",
    tagline: "Buttons, a toggle and a chart that make other widgets react",
    detail: "Action wiring in use: a toggle shows a hidden table, buttons pick a severity on the chart, a button adds 10% to a progress bar each press, and picking a bar rewrites a text widget. Open Wire mode, choose Actions, and see (or change) every wire.",
    build: headed("Interactive controls", "Wires between widgets: a toggle shows the table, buttons pick a severity, a chart click updates the text.", actionsDemo)
  },
  {
    id: "incdesk",
    rowH: 28,
    bar: bar(S("team", "state"), {}),
    name: "Incident desk",
    tagline: "The same components on incidents",
    detail: "Priority tags, a banner for priority 1, charts by team, priority and time, a structured list queue and a data table, all on live incidents.",
    build: plus(headed("Incident desk", "The same components on incidents: priorities, teams, trend and the queue.", incidentDesk), incInsights)
  },
  {
    id: "scorecard",
    rowH: 28,
    bar: bar(A("team", "type")),
    name: "Severity scorecard",
    tagline: "Gauge, meter and status per severity",
    detail: "For each of Critical, Major, Minor and Warning: a status shape, a gauge and a meter with warning and critical thresholds, then a flow chart and heatmap.",
    build: headed("Severity scorecard", "Each severity against its own warning and critical thresholds.", scorecard)
  }
];
TEMPLATES.forEach((t) => {
  const b = t.build;
  t.build = () => fitBand(b(), t.rowH);
});
TEMPLATES.forEach((t) => {
  t.build = stably(t.id, t.build);
});
var availableTemplates = () => TEMPLATES.filter((t) => !t.needs || t.needs.every((id) => Boolean(tileDef(`tile:${id}`))));
export {
  FIELDS,
  FILE_KIND,
  GRID_COLS,
  GROUPS,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  NATIVE,
  SPECS,
  TEMPLATES,
  TILES,
  availableTemplates,
  carbonDefaults,
  carbonSpec,
  clampBox,
  compact,
  compactTree,
  dataOn,
  defaultConfig,
  defaultTitle,
  describeImageError,
  exportJson,
  fieldsOf,
  findSpot,
  gridHeight,
  imageMimeOk,
  importJson,
  isImageSrc,
  isKnownType,
  minSize,
  moveItem,
  nativeDef,
  newId,
  overlaps,
  registerExtraTiles,
  resizeItem,
  sanitizeDashboard,
  sanitizeSettings,
  sanitizeTileProps,
  slotOwner,
  slotsOf,
  tileDef
};
