/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Route state (all optional):
 *  - tenantId   tenant used by the generic widgets (default: the toolkit sample tenant, so SET IT)
 *  - readOnly   true hides every editing control
 */

import createPanel from '../app/createPanel';
import DashboardBuilder from '../components/dashboard-builder/DashboardBuilder';

export default createPanel(DashboardBuilder);
