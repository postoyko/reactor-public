/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenStreetMap view. One circle per site, coloured by its worst alert, sized by its alert count.
 * No image files are used for markers, so nothing extra has to be bundled.
 */

import React, { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SiteMarker, severityLabel } from './logic';
import { sevColor } from './theme';

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const WORLD_CENTER: [number, number] = [20, 0];
const MAX_VISIBLE_ALERTS = 5;

interface MapViewProps {
  markers: SiteMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Fits the map to all sites, flies to the selected one, and fixes the map size when its container resizes. */
const Viewport: React.FC<{ markers: SiteMarker[]; selectedId: string | null }> = ({ markers, selectedId }) => {
  const map = useMap();
  const key = markers.map(m => m.site.id).join('|');

  useEffect(() => {
    if (!markers.length) return;
    if (markers.length === 1) { map.setView([markers[0].site.lat, markers[0].site.lng], 8); return; }
    map.fitBounds(L.latLngBounds(markers.map(m => [m.site.lat, m.site.lng] as [number, number])), { padding: [40, 40], maxZoom: 10 });
    // Refit only when the set of sites changes, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  useEffect(() => {
    const m = markers.find(x => x.site.id === selectedId);
    if (m) map.flyTo([m.site.lat, m.site.lng], Math.max(map.getZoom(), 8), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ markers, selectedId, onSelect }) => (
  <MapContainer center={WORLD_CENTER} zoom={2} minZoom={2} worldCopyJump className="osm-map__leaflet" scrollWheelZoom>
    <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
    <Viewport markers={markers} selectedId={selectedId} />
    {markers.map(m => {
      const colour = sevColor(m.severity);
      const selected = m.site.id === selectedId;
      return (
        <CircleMarker
          key={m.site.id}
          center={[m.site.lat, m.site.lng]}
          radius={Math.min(26, 9 + Math.sqrt(m.alerts.length) * 3)}
          pathOptions={{ color: selected ? '#0f62fe' : colour, weight: selected ? 4 : 2, fillColor: colour, fillOpacity: 0.65 }}
          eventHandlers={{ click: (): void => onSelect(m.site.id) }}
        >
          <Popup>
            <strong>{m.site.name}</strong>
            <br />
            {m.alerts.length} open alert{m.alerts.length === 1 ? '' : 's'}, worst: {severityLabel(m.severity)}
            <ul className="osm-map__popup-list">
              {m.alerts.slice(0, MAX_VISIBLE_ALERTS).map(a => (
                <li key={a.id}>{severityLabel(a.severity)}: {a.summary || a.resource}</li>
              ))}
            </ul>
            {m.alerts.length > MAX_VISIBLE_ALERTS && <em>Showing {MAX_VISIBLE_ALERTS} of {m.alerts.length}</em>}
          </Popup>
        </CircleMarker>
      );
    })}
  </MapContainer>
);

export default MapView;
