/**
 * Written by Concert Workbench (Design > Make default). Edit layouts there, not here.
 * null = no shared layout.
 */

export const DEFAULT_LAYOUT: unknown = {
  "kind": "dashboard-builder",
  "version": 1,
  "dashboard": {
    "id": "d-mvi1kzn4nz8ml",
    "name": "Incident Atlas (layout)",
    "updated": 1792660595068,
    "widgets": [
      {
        "id": "w-mvjbt8048qaa4t",
        "type": "text",
        "title": "IOPs",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 2,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "text": "# Incident & alert operations\nOpen incidents, severity, sources and the live alert stream. Click any bar, slice or tile to filter everything else; click a row for details.",
          "bg": "#161616",
          "fg": "#ffffff"
        }
      },
      {
        "id": "w-mvjbt8048rmr82",
        "type": "kpi",
        "title": "Open incidents",
        "x": 0,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getStories",
          "emits": false,
          "listens": true,
          "metric": "count",
          "bg": "#262626",
          "fg": "#ffffff",
          "text": "Under investigation",
          "where": {
            "field": "state",
            "value": "resolved",
            "op": "!="
          }
        }
      },
      {
        "id": "w-mvjbt8048sd1uk",
        "type": "kpi",
        "title": "Priority 1 and 2",
        "x": 2,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getStories",
          "emits": false,
          "listens": true,
          "metric": "count",
          "bg": "#da1e28",
          "fg": "#ffffff",
          "text": "Leadership attention",
          "where": {
            "field": "priority",
            "value": "2",
            "op": "<="
          },
          "also": [
            {
              "field": "state",
              "value": "resolved",
              "op": "!="
            }
          ]
        }
      },
      {
        "id": "w-mvjbt8048t94i0",
        "type": "kpi",
        "title": "Critical alerts",
        "x": 4,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "bg": "#da1e28",
          "fg": "#ffffff",
          "text": "Severity 6, act now",
          "where": {
            "field": "severityLabel",
            "value": "Critical"
          }
        }
      },
      {
        "id": "w-mvjbt8048uafet",
        "type": "kpi",
        "title": "Major alerts",
        "x": 6,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "bg": "#ff832b",
          "fg": "#161616",
          "text": "Severity 5, degrading",
          "where": {
            "field": "severityLabel",
            "value": "Major"
          }
        }
      },
      {
        "id": "w-mvjbt8048v7rjg",
        "type": "kpi",
        "title": "Not acknowledged",
        "x": 8,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "text": "Nobody has picked these up",
          "where": {
            "field": "acknowledged",
            "value": "false"
          }
        }
      },
      {
        "id": "w-mvjbt8048w6rlu",
        "type": "kpi",
        "title": "Resources affected",
        "x": 10,
        "y": 2,
        "w": 2,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "distinct",
          "valueField": "resource",
          "bg": "#525252",
          "fg": "#ffffff",
          "text": "Distinct hosts and services"
        }
      },
      {
        "id": "w-mvjbt8048xdu92",
        "type": "table",
        "title": "Application health",
        "x": 0,
        "y": 5,
        "w": 8,
        "h": 7,
        "config": {
          "query": "getApplications",
          "emits": false,
          "listens": true,
          "limit": 50,
          "columns": [
            "name",
            "severityLabel",
            "alerts",
            "critical",
            "major",
            "incidents",
            "criticality"
          ],
          "sortBy": "criticalityValue",
          "sortDesc": true
        }
      },
      {
        "id": "w-mvjbt8048yozmd",
        "type": "carbon:SimpleBarChart",
        "title": "Alerts by application",
        "x": 8,
        "y": 5,
        "w": 4,
        "h": 7,
        "config": {
          "query": "getApplications",
          "emits": true,
          "listens": true,
          "groupBy": "name",
          "valueField": "alerts",
          "props": {
            "horizontal": true
          },
          "metric": "sum"
        }
      },
      {
        "id": "w-mvjbt8048zci70",
        "type": "carbon:DonutChart",
        "title": "Incidents by priority",
        "x": 0,
        "y": 12,
        "w": 3,
        "h": 8,
        "config": {
          "query": "getStories",
          "emits": true,
          "listens": true,
          "groupBy": "priority",
          "where": {
            "field": "state",
            "value": "resolved",
            "op": "!="
          }
        }
      },
      {
        "id": "w-mvjbt804908e5f",
        "type": "carbon:SimpleBarChart",
        "title": "Critical alert categories",
        "x": 3,
        "y": 12,
        "w": 3,
        "h": 8,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "type",
          "props": {
            "horizontal": true
          },
          "limit": 6,
          "where": {
            "field": "severityLabel",
            "value": "Critical"
          }
        }
      },
      {
        "id": "w-mvjbt80491sh2d",
        "type": "carbon:SimpleBarChart",
        "title": "Major alert categories",
        "x": 6,
        "y": 12,
        "w": 3,
        "h": 8,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "type",
          "props": {
            "horizontal": true
          },
          "limit": 6,
          "where": {
            "field": "severityLabel",
            "value": "Major"
          }
        }
      },
      {
        "id": "w-mvjbt80492dd20",
        "type": "carbon:DonutChart",
        "title": "Alert ingestion sources",
        "x": 9,
        "y": 12,
        "w": 3,
        "h": 8,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "sender",
          "limit": 6
        }
      },
      {
        "id": "w-mvjbt8049319gf",
        "type": "carbon:SplitPane",
        "title": "Incidents and intelligence",
        "x": 0,
        "y": 20,
        "w": 12,
        "h": 17,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "direction": "horizontal",
            "first": "widgets",
            "second": "widgets",
            "size": 62
          }
        }
      },
      {
        "id": "w-mvjbt80494gglk",
        "type": "carbon:Search",
        "title": "Search incidents",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 2,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "labelText": "Search incidents",
            "placeholder": "Search incident titles"
          },
          "chromeless": true,
          "sendTo": [
            "w-mvjbt80495b4s3"
          ],
          "bind": {
            "field": "title",
            "op": "contains",
            "query": "getStories"
          }
        },
        "parent": "w-mvjbt8049319gf#0"
      },
      {
        "id": "w-mvjbt80495b4s3",
        "type": "table",
        "title": "Active incidents",
        "x": 0,
        "y": 2,
        "w": 12,
        "h": 15,
        "config": {
          "query": "getStories",
          "emits": false,
          "listens": true,
          "limit": 50,
          "columns": [
            "priority",
            "title",
            "state",
            "team",
            "owner",
            "alertCount",
            "runbooks",
            "created"
          ],
          "sortBy": "priority",
          "drill": {
            "mode": "details",
            "newTab": true
          },
          "where": {
            "field": "state",
            "value": "resolved",
            "op": "!="
          }
        },
        "parent": "w-mvjbt8049319gf#0"
      },
      {
        "id": "w-mvjbt80496n8hy",
        "type": "carbon:Tabs",
        "title": "Operational intelligence",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 17,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "items": [
              "Top resources :: widgets",
              "Services health :: widgets",
              "Critical stream :: widgets",
              "Patterns :: widgets",
              "Metrics :: widgets",
              "Incident insights :: widgets"
            ]
          }
        },
        "parent": "w-mvjbt8049319gf#1"
      },
      {
        "id": "w-mvjbt8049718ay",
        "type": "carbon:SimpleBarChart",
        "title": "Most affected resources",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 14,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "resource",
          "props": {
            "horizontal": true
          },
          "limit": 10
        },
        "parent": "w-mvjbt80496n8hy#0"
      },
      {
        "id": "w-mvjbt804988mzf",
        "type": "carbon:StackedBarChart",
        "title": "Severity by team",
        "x": 0,
        "y": 0,
        "w": 7,
        "h": 14,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "team",
          "seriesBy": "severityLabel"
        },
        "parent": "w-mvjbt80496n8hy#1"
      },
      {
        "id": "w-mvjbt80499zpyw",
        "type": "carbon:HeatmapChart",
        "title": "Team and severity",
        "x": 7,
        "y": 0,
        "w": 5,
        "h": 14,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "team",
          "seriesBy": "severityLabel"
        },
        "parent": "w-mvjbt80496n8hy#1"
      },
      {
        "id": "w-mvjbt8049a9gjp",
        "type": "table",
        "title": "Critical alerts",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 14,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "limit": 30,
          "columns": [
            "resource",
            "summary",
            "firstOccurrence"
          ],
          "sortBy": "firstOccurrence",
          "sortDesc": true,
          "drill": {
            "mode": "details",
            "newTab": true
          },
          "where": {
            "field": "severityLabel",
            "value": "Critical"
          }
        },
        "parent": "w-mvjbt80496n8hy#2"
      },
      {
        "id": "w-mvjbt8049bd3qw",
        "type": "kpi",
        "title": "Alerts with no incident",
        "x": 0,
        "y": 0,
        "w": 4,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "bg": "#525252",
          "fg": "#ffffff",
          "text": "Not in an incident",
          "where": {
            "field": "inIncident",
            "value": "No"
          }
        },
        "parent": "w-mvjbt80496n8hy#3"
      },
      {
        "id": "w-mvjbt8049ccl68",
        "type": "kpi",
        "title": "Anomalies",
        "x": 4,
        "y": 0,
        "w": 4,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "text": "Metric anomaly",
          "where": {
            "field": "anomaly",
            "value": "Yes"
          }
        },
        "parent": "w-mvjbt80496n8hy#3"
      },
      {
        "id": "w-mvjbt8049dnbzz",
        "type": "kpi",
        "title": "Seasonal",
        "x": 8,
        "y": 0,
        "w": 4,
        "h": 3,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "metric": "count",
          "text": "Repeating pattern",
          "where": {
            "field": "seasonal",
            "value": "Yes"
          }
        },
        "parent": "w-mvjbt80496n8hy#3"
      },
      {
        "id": "w-mvjbt8049e5im9",
        "type": "carbon:SimpleBarChart",
        "title": "Golden signals",
        "x": 0,
        "y": 3,
        "w": 5,
        "h": 11,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "goldenSignal",
          "where": {
            "field": "goldenSignal",
            "value": "None",
            "op": "!="
          }
        },
        "parent": "w-mvjbt80496n8hy#3"
      },
      {
        "id": "w-mvjbt8049fk9c4",
        "type": "carbon:SimpleBarChart",
        "title": "Alerts that keep recurring",
        "x": 5,
        "y": 3,
        "w": 7,
        "h": 11,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "summary",
          "props": {
            "horizontal": true
          },
          "limit": 8,
          "where": {
            "field": "recurrence",
            "value": "2",
            "op": ">="
          }
        },
        "parent": "w-mvjbt80496n8hy#3"
      },
      {
        "id": "w-mvjbt8049gmmn3",
        "type": "carbon:LineChart",
        "title": "Node CPU: actual and forecast",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 14,
        "config": {
          "query": "getMetricSeries",
          "emits": true,
          "listens": true,
          "filter": "kubernetesNode|required_cpu_percentage|",
          "seriesBy": "kind",
          "valueField": "value",
          "props": {
            "bins": 48,
            "legend": "bottom"
          },
          "metric": "avg"
        },
        "parent": "w-mvjbt80496n8hy#4"
      },
      {
        "id": "w-mvjbt8049h420q",
        "type": "carbon:IncidentInsights",
        "title": "Incident insights",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 14,
        "config": {
          "query": "getStories",
          "emits": false,
          "listens": true,
          "where": {
            "field": "state",
            "value": "resolved",
            "op": "!="
          }
        },
        "parent": "w-mvjbt80496n8hy#5"
      },
      {
        "id": "w-mvjbt8049i7ilc",
        "type": "carbon:Accordion",
        "title": "Alerts",
        "x": 0,
        "y": 37,
        "w": 12,
        "h": 32,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "items": [
              "Recent alerts stream :: widgets",
              "Trend and breakdown :: widgets"
            ],
            "startOpen": true
          }
        }
      },
      {
        "id": "w-mvjbt8049jg7xn",
        "type": "carbon:Tabs",
        "title": "Alert stream",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 18,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "items": [
              "All :: widgets",
              "Critical :: widgets",
              "Major :: widgets",
              "Minor and below :: widgets"
            ]
          }
        },
        "parent": "w-mvjbt8049i7ilc#0"
      },
      {
        "id": "w-mvjbt8049kt94o",
        "type": "carbon:Search",
        "title": "Search alerts",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 2,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": false,
          "props": {
            "labelText": "Search alerts",
            "placeholder": "Summary, resource, source"
          },
          "chromeless": true,
          "sendTo": [
            "w-mvjbt8049lxraj"
          ],
          "bind": {
            "field": "summary",
            "op": "contains",
            "query": "getAlerts"
          }
        },
        "parent": "w-mvjbt8049jg7xn#0"
      },
      {
        "id": "w-mvjbt8049lxraj",
        "type": "table",
        "title": "All alerts",
        "x": 0,
        "y": 2,
        "w": 12,
        "h": 14,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "limit": 200,
          "columns": [
            "severityLabel",
            "resource",
            "summary",
            "inIncident",
            "eventCount",
            "recurrence",
            "runbookName",
            "runbookAutomated",
            "firstOccurrence"
          ],
          "sortBy": "severity",
          "sortDesc": true,
          "drill": {
            "mode": "details",
            "newTab": true
          }
        },
        "parent": "w-mvjbt8049jg7xn#0"
      },
      {
        "id": "w-mvjbt8049mvoh2",
        "type": "table",
        "title": "Critical alerts",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 16,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "limit": 200,
          "columns": [
            "severityLabel",
            "resource",
            "summary",
            "inIncident",
            "eventCount",
            "recurrence",
            "runbookName",
            "runbookAutomated",
            "firstOccurrence"
          ],
          "drill": {
            "mode": "details",
            "newTab": true
          },
          "where": {
            "field": "severityLabel",
            "value": "Critical"
          }
        },
        "parent": "w-mvjbt8049jg7xn#1"
      },
      {
        "id": "w-mvjbt8049n8jbe",
        "type": "table",
        "title": "Major alerts",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 16,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "limit": 200,
          "columns": [
            "severityLabel",
            "resource",
            "summary",
            "inIncident",
            "eventCount",
            "recurrence",
            "runbookName",
            "runbookAutomated",
            "firstOccurrence"
          ],
          "drill": {
            "mode": "details",
            "newTab": true
          },
          "where": {
            "field": "severityLabel",
            "value": "Major"
          }
        },
        "parent": "w-mvjbt8049jg7xn#2"
      },
      {
        "id": "w-mvjbt8049ol92u",
        "type": "table",
        "title": "Minor and below",
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 16,
        "config": {
          "query": "getAlerts",
          "emits": false,
          "listens": true,
          "limit": 200,
          "columns": [
            "severityLabel",
            "resource",
            "summary",
            "inIncident",
            "eventCount",
            "recurrence",
            "runbookName",
            "runbookAutomated",
            "firstOccurrence"
          ],
          "sortBy": "severity",
          "sortDesc": true,
          "drill": {
            "mode": "details",
            "newTab": true
          },
          "where": {
            "field": "severity",
            "value": "5",
            "op": "<"
          }
        },
        "parent": "w-mvjbt8049jg7xn#3"
      },
      {
        "id": "w-mvjbt8049p657c",
        "type": "carbon:StackedAreaChart",
        "title": "Alert volume by severity",
        "x": 0,
        "y": 0,
        "w": 8,
        "h": 9,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "seriesBy": "severityLabel",
          "props": {
            "bins": 24,
            "legend": "bottom"
          }
        },
        "parent": "w-mvjbt8049i7ilc#1"
      },
      {
        "id": "w-mvjbt8049qjh74",
        "type": "carbon:DonutChart",
        "title": "Severity mix",
        "x": 8,
        "y": 0,
        "w": 4,
        "h": 9,
        "config": {
          "query": "getAlerts",
          "emits": true,
          "listens": true,
          "groupBy": "severityLabel"
        },
        "parent": "w-mvjbt8049i7ilc#1"
      }
    ],
    "bar": {
      "fields": [
        {
          "query": "getAlerts",
          "field": "severityLabel"
        },
        {
          "query": "getAlerts",
          "field": "team"
        },
        {
          "query": "getAlerts",
          "field": "type"
        },
        {
          "query": "getAlerts",
          "field": "sender"
        }
      ],
      "time": true,
      "preset": "all",
      "refresh": 60
    },
    "rowH": 28
  }
};
