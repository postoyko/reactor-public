/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small drawn icons for widget types, tinted by what kind of widget it is (live data, content, Carbon component,
 * embedded dashboard). Used by the library, the layers list, the widget title bars and the settings header.
 */

import React from 'react';

export type Kind = 'data' | 'content' | 'carbon' | 'tile';

export function kindOf(type: string): Kind {
  if (type.startsWith('carbon:')) return 'carbon';
  if (type.startsWith('tile:')) return 'tile';
  return type === 'text' || type === 'image' ? 'content' : 'data';
}

/** Carbon component name -> drawn shape, so every component in the library and on the canvas has a recognisable icon. */
const CARBON_SHAPES: Array<[RegExp, string]> = [
  [/^(Donut|Pie)Chart$/, 'donut'],
  [/^(Gauge|Meter)Chart$/, 'gauge'],
  [/^(Line|Area|StackedArea)Chart$/, 'timeseries'],
  [/^Scatter|^Lollipop/, 'scatter'],
  [/^Heatmap|^Treemap/, 'heatmap'],
  [/^Radar/, 'radar'],
  [/^Alluvial/, 'flow'],
  [/^Cloud/, 'text'],
  [/Bar.*Chart$/, 'bar'],
  [/^(DataTable|StructuredList)$/, 'table'],
  [/^(Tabs|ContentSwitcher)$/, 'tabs'],
  [/^Accordion$|^ExpandableTile$/, 'accordion'],
  [/^(SplitPane|ScrollPane|Toolbar|Carousel|TileGroup)$/, 'layout'],
  [/Tile$/, 'card'],
  [/^ApplicationCards$/, 'card'],
  [/^(Breadcrumb|Pagination|PaginationNav|Link)$/, 'nav'],
  [/List$|^TreeView$|^ContainedList$/, 'list'],
  [/^Heading$/, 'heading'],
  [/^CodeSnippet$/, 'code'],
  [/Notification$|^Tooltip$|^Toggletip$|^DefinitionTooltip$|^Popover$/, 'notice'],
  [/^Modal$/, 'modal'],
  [/Indicator$|^Tag$|^CountBadge|^Status/, 'status'],
  [/^Progress|Loading$|^Skeleton/, 'progress'],
  [/^(Search)$/, 'search'],
  [/^(Dropdown|Select|ComboBox|MultiSelect|OverflowMenu|MenuButton|ComboButton)$/, 'dropdown'],
  [/^(Toggle)$/, 'toggle'],
  [/^(Checkbox|CheckboxGroup|RadioButtonGroup)$/, 'check'],
  [/^Slider$/, 'slider'],
  [/^(DatePicker|TimePicker)$/, 'calendar'],
  [/^FileUploader$/, 'upload'],
  [/Input$|^TextArea$/, 'input'],
  [/Button|^ButtonSet$/, 'button'],
  [/^PeoplePicker$/, 'people'],
  [/^Incident|^Runbook/, 'pulse']
];

function carbonShape(type: string): string {
  const name = type.slice(7);
  for (const [re, k] of CARBON_SHAPES) if (re.test(name)) return k;
  return 'carbon';
}

function shape(k: string): React.ReactNode {
  switch (k) {
    case 'kpi':
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 9.5h3.5M5 6.5h1.5" /></>);
    case 'bar':
      return (<><path d="M3.5 13V8M8 13V3.5M12.5 13V6" /></>);
    case 'donut':
      return (<><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="1.75" /></>);
    case 'timeseries':
      return (<path d="M2 12l3.5-4.5 3 2L14 3.5" />);
    case 'table':
      return (<><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6.5h12M6 6.5V13" /></>);
    case 'image':
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="5.75" cy="6.5" r="1" /><path d="M2.5 12l3.5-3 2.5 2 2-1.5 3 2.5" /></>);
    case 'text':
      return (<path d="M3 4.5h10M3 8h10M3 11.5h6" />);
    case 'gauge':
      return (<><path d="M2.5 11.5a5.5 5.5 0 0 1 11 0" /><path d="M8 11.5l3-3.5" /></>);
    case 'scatter':
      return (<><path d="M2.5 2.5v11h11" /><circle cx="6" cy="9" r=".9" /><circle cx="9" cy="6" r=".9" /><circle cx="12" cy="8" r=".9" /><circle cx="7.5" cy="5" r=".9" /></>);
    case 'heatmap':
      return (<><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" /></>);
    case 'radar':
      return (<><path d="M8 2l5.5 4-2 6.5h-7L2.5 6z" /><path d="M8 5l2.5 2-1 3h-3l-1-3z" /></>);
    case 'flow':
      return (<><path d="M2.5 4h3c3 0 2 8 5 8h3M2.5 12h3c3 0 2-8 5-8h3" /></>);
    case 'tabs':
      return (<><path d="M2 13V4.5h4.5V6.5H14V13z" /><path d="M6.5 4.5h4v2" /></>);
    case 'accordion':
      return (<><rect x="2" y="2.5" width="12" height="3.5" rx="1" /><rect x="2" y="7.5" width="12" height="6" rx="1" /><path d="M10.5 4.25l1 .75 1-.75" /></>);
    case 'layout':
      return (<><rect x="2" y="2.5" width="12" height="11" rx="1" /><path d="M7 2.5v11M7 8h7" /></>);
    case 'card':
      return (<><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M4.5 6h4M4.5 9.5h7" /></>);
    case 'nav':
      return (<path d="M2.5 8h3M7 8h3M11.5 8h2M5 6l1.5 2L5 10M9.5 6L11 8l-1.5 2" />);
    case 'list':
      return (<><path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5" /><circle cx="3" cy="4.5" r=".7" /><circle cx="3" cy="8" r=".7" /><circle cx="3" cy="11.5" r=".7" /></>);
    case 'heading':
      return (<path d="M3.5 3v10M10 3v10M3.5 8H10M12.5 6.5l1.5-1v7.5" />);
    case 'code':
      return (<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10" />);
    case 'notice':
      return (<><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /><path d="M8 5.5v2M8 9h.01" /></>);
    case 'modal':
      return (<><rect x="2" y="2.5" width="12" height="11" rx="1" /><rect x="4.5" y="5" width="7" height="6" rx="1" /></>);
    case 'status':
      return (<><circle cx="5" cy="8" r="2.5" /><path d="M9.5 8h4" /></>);
    case 'progress':
      return (<><rect x="2" y="6.5" width="12" height="3" rx="1.5" /><path d="M3.5 8h5" /></>);
    case 'search':
      return (<><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></>);
    case 'dropdown':
      return (<><rect x="2" y="4.5" width="12" height="7" rx="1" /><path d="M9.5 7.25l1.25 1.5 1.25-1.5" /></>);
    case 'toggle':
      return (<><rect x="2" y="5" width="12" height="6" rx="3" /><circle cx="11" cy="8" r="1.75" /></>);
    case 'check':
      return (<><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M5 8.25l2 2 4-4.5" /></>);
    case 'slider':
      return (<><path d="M2 8h12" /><circle cx="6" cy="8" r="2" /></>);
    case 'calendar':
      return (<><rect x="2.5" y="3.5" width="11" height="10" rx="1" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>);
    case 'upload':
      return (<path d="M8 11V3M5 6l3-3 3 3M3 10.5V13h10v-2.5" />);
    case 'input':
      return (<><rect x="2" y="4.5" width="12" height="7" rx="1" /><path d="M4.5 6.5v3" /></>);
    case 'button':
      return (<><rect x="2" y="5" width="12" height="6" rx="3" /><path d="M6 8h4" /></>);
    case 'people':
      return (<><circle cx="6" cy="6" r="2.25" /><path d="M2 13c.5-2.5 2-3.5 4-3.5s3.5 1 4 3.5" /><path d="M10.5 4a2 2 0 0 1 0 4M12 9.75c1 .5 1.75 1.5 2 3.25" /></>);
    case 'pulse':
      return (<path d="M2 8h3l1.5-3.5 3 7L11 8h3" />);
    case 'carbon':
      return (<><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>);
    default:
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 6h12M4 4.5h.01M6 4.5h.01" /></>);
  }
}

export function Glyph({ type, size = 24 }: { type: string; size?: number }) {
  const k = kindOf(type);
  const name = k === 'carbon' ? carbonShape(type) : k === 'tile' ? 'tile' : type;
  return (
    <span className="db-glyph" data-k={k} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 16 16" width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round">
        {shape(name)}
      </svg>
    </span>
  );
}
