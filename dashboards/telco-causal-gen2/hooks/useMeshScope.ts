/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshSession, useIsHost, useMeshSession } from '../session/MeshSession';
import { resolveMeshProps } from './resolveMeshProps';

/**
 * Which session this component belongs to. The full dashboard has a private session; a component that shows one `part`
 * joins the page-wide session so that several tiles behave as one dashboard. `isHost` is true for exactly one
 * component of a session (see session/MeshSession.ts).
 */
export function useMeshScope(m: ReturnType<typeof resolveMeshProps>): { session: MeshSession; isHost: boolean } {
  const session = useMeshSession(Boolean(m.part));
  const isHost = useIsHost(session);
  return { session, isHost };
}
