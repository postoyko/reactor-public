/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "How do resources connect?" Two views over the same real links:
 *  - Flow (default): a Sankey, readable at a glance.
 *  - Matrix: exact cell-by-cell lookup, for when the flow gets crowded.
 * Only resources with at least one link are drawn; the counts of what was left out are shown, not hidden.
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@carbon/react';
import { Node3DGen2, Link3DGen2, LinkKind, buildAdjacency, buildLinkFlow, linkedNodes } from './logic';
import LinkFlow from './LinkFlow';
import AdjacencyMatrix from './AdjacencyMatrix';

type Mode = 'flow' | 'matrix';
type KindFilter = 'all' | 'causal' | 'topology';

interface Props {
  nodes: Node3DGen2[];
  links: Link3DGen2[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectLink: (link: Link3DGen2) => void;
}

export default function LinkExplorer({ nodes, links, selectedNodeId, onSelectNode, onSelectLink }: Props) {
  const [mode, setMode] = useState<Mode>('flow');
  const [kind, setKind] = useState<KindFilter>('all');

  const kinds = useMemo<LinkKind[] | undefined>(
    () => (kind === 'causal' ? ['causal'] : kind === 'topology' ? ['physical', 'illustrative'] : undefined),
    [kind]
  );
  const counts = useMemo(() => ({
    causal: links.filter(l => l.kind === 'causal').length,
    topology: links.filter(l => l.kind !== 'causal').length
  }), [links]);

  const flow = useMemo(() => buildLinkFlow(nodes, links, kinds), [nodes, links, kinds]);
  const matrix = useMemo(() => {
    const kept = kinds ? links.filter(l => kinds.includes(l.kind)) : links;
    return buildAdjacency(linkedNodes(nodes, kept), kept);
  }, [nodes, links, kinds]);

  return (
    <div className="insight-view link-explorer">
      <div className="insight-toolbar">
        <div className="insight-switch" role="group" aria-label="Link view">
          <Button size="sm" kind={mode === 'flow' ? 'primary' : 'ghost'} onClick={() => setMode('flow')}>Flow</Button>
          <Button size="sm" kind={mode === 'matrix' ? 'primary' : 'ghost'} onClick={() => setMode('matrix')}>Matrix</Button>
        </div>
        <div className="insight-switch" role="group" aria-label="Link kind">
          <Button size="sm" kind={kind === 'all' ? 'secondary' : 'ghost'} onClick={() => setKind('all')}>All ({links.length})</Button>
          <Button size="sm" kind={kind === 'causal' ? 'secondary' : 'ghost'} onClick={() => setKind('causal')}>Causal ({counts.causal})</Button>
          <Button size="sm" kind={kind === 'topology' ? 'secondary' : 'ghost'} disabled={counts.topology === 0} title={counts.topology === 0 ? 'No topology links were supplied' : undefined} onClick={() => setKind('topology')}>
            Topology ({counts.topology})
          </Button>
        </div>
        <div className="insight-legend">
          <span className="legend-chip"><i style={{ background: '#da1e28' }} />causal</span>
          <span className="legend-chip"><i style={{ background: '#0043ce' }} />topology</span>
          <span className="legend-chip"><i style={{ background: '#6929c4' }} />tiers (est.): core</span>
          <span className="legend-chip"><i style={{ background: '#ba4e00' }} />transport</span>
          <span className="legend-chip"><i style={{ background: '#198038' }} />RAN</span>
          <span className="legend-chip"><i style={{ background: '#0043ce' }} />edge</span>
        </div>
        <div className="insight-stats">
          <span>{flow.nodes.length} linked resources</span>
          <span>{flow.unlinked} without links (hidden)</span>
        </div>
      </div>

      {flow.dropped > 0 && mode === 'flow' && (
        <div className="insight-note">
          {flow.dropped} link{flow.dropped === 1 ? '' : 's'} not drawn because {flow.dropped === 1 ? 'it' : 'they'} would close a loop, which a flow cannot show. The Matrix view lists every link.
        </div>
      )}

      {mode === 'flow' ? (
        <LinkFlow model={flow} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onSelectLink={onSelectLink} />
      ) : (
        <AdjacencyMatrix model={matrix} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onSelectLink={onSelectLink} />
      )}
    </div>
  );
}
