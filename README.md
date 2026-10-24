# reactor

Custom dashboards and the Dashboard Designer for IBM Concert Operate / Cloud Pak for AIOps.

| Folder / file | What it is |
| --- | --- |
| `dashboard-extension/` | IBM's UI extension toolkit (aiops-ui-extension-template) with these dashboards built in |
| `dashboards/` | The dashboards' source, one folder each; `deploy-dashboards.sh` copies them into the toolkit |
| `scaffold/` | Concert Workbench: a local tool (http://127.0.0.1:4000) to design, publish and deploy dashboards |
| `scaffold/designer/` | The Dashboard Designer's master copy |
| `deploy-dashboards.sh` | Builds and deploys everything to the cluster |
| `sync-designer.sh` | Keeps `scaffold/designer/` and `dashboards/dashboard-builder/` identical |

## Deploy

```bash
cd dashboard-extension && npm ci && cd ..
./deploy-dashboards.sh
```

The dashboards appear in Concert Operate's sidebar under **Reactor**.

## Working on the Dashboard Designer

Edit `scaffold/designer/`, then run `./sync-designer.sh`. The deploy stops if the two copies differ
(`./sync-designer.sh --back` keeps edits made in `dashboards/dashboard-builder/` instead).
Its changes are listed in `scaffold/designer/CHANGES.md`.

## Checks

```bash
./sync-designer.sh --check                         # the two Designer copies match
cd dashboard-extension && npm run test:designer    # unit tests, type check and lint
```

GitHub runs both on every push and pull request (`.github/workflows/designer.yml`).
