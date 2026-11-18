import React, { useEffect, useMemo } from 'react';
import { Icon } from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import markerUrl from 'leaflet/dist/images/marker-icon.png';
import markerRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { status } from '../lib/api.js';

const KUALA_LUMPUR = [3.139, 101.6869];
const MAX_NEARBY_KM = 25; // ignore "nearby" if the user is far from every centre

const centreIcon = new Icon({
  iconUrl: markerUrl,
  iconRetinaUrl: markerRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function DirectoryMapView({ pins, location, nearbyCount }) {
  const map = useMap();

  useEffect(() => {
    // 1. User located and "nearest" is on: show them plus the closest centres
    if (location && nearbyCount > 0) {
      const nearest = pins
        .filter(pin => pin.centre.distance != null && pin.centre.distance <= MAX_NEARBY_KM)
        .sort((a, b) => a.centre.distance - b.centre.distance)
        .slice(0, nearbyCount);

      if (nearest.length) {
        map.fitBounds(
          [[location.latitude, location.longitude], ...nearest.map(pin => pin.position)],
          { padding: [40, 40], maxZoom: 15, animate: false },
        );
        return;
      }
    }

    // 2. User located but nearest sort is off (or no centre nearby): centre on them
    if (location && nearbyCount === 0) {
      map.setView([location.latitude, location.longitude], 14, { animate: false });
      return;
    }

    // 3. No location: show every centre
    if (pins.length) {
      map.fitBounds(pins.map(pin => pin.position), {
        padding: [30, 30],
        maxZoom: 14,
        animate: false,
      });
    } else {
      map.setView(KUALA_LUMPUR, 12, { animate: false });
    }
  }, [map, pins, location, nearbyCount]);

  return null;
}

export default function CoolingCentresDirectoryMap({
  centres,
  location,
  onOpen,
  nearbyCount = 0,
}) {
  const pins = useMemo(
    () => centres.flatMap(centre => {
      const lat = Number(centre.latitude);
      const lon = Number(centre.longitude);

      if (!(lat >= 3 && lat <= 3.3 && lon >= 101.55 && lon <= 101.8)) {
        return [];
      }

      return [{ centre, position: [lat, lon] }];
    }),
    [centres]
  );

  return (
    <div className="map" role="region" aria-label="Cooling centres map">
      <MapContainer
        center={KUALA_LUMPUR}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: 360, width: '100%' }}
      >
        <TileLayer
          attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <DirectoryMapView pins={pins} location={location} nearbyCount={nearbyCount} />

        {pins.map(({ centre, position }) => (
          <Marker
            key={centre.id}
            position={position}
            icon={centreIcon}
            title={centre.name}
            alt={centre.name}
          >
            <Popup>
              <strong>{centre.name}</strong>
              <br />
              {centre.address}
              <br />
              {status(centre.status)} · {centre.operating_hours || 'Hours not provided'}
              <br />
              <button
                type="button"
                className="btn secondary small"
                onClick={() => onOpen(centre)}
              >
                View details
              </button>
            </Popup>
          </Marker>
        ))}

        {location && (
          <CircleMarker
            center={[location.latitude, location.longitude]}
            radius={9}
            pathOptions={{
              color: '#b44822',
              fillColor: '#e8752e',
              fillOpacity: 0.9,
            }}
          >
            <Popup>Your current location</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}