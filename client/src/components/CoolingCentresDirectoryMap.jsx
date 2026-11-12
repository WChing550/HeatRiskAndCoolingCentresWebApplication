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

const centreIcon = new Icon({
  iconUrl: markerUrl,
  iconRetinaUrl: markerRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function DirectoryMapView({ pins, location }) {
  const map = useMap();

  useEffect(() => {
    if (pins.length) {
      map.fitBounds(pins.map(pin => pin.position), {
        padding: [30, 30],
        maxZoom: 14,
        animate: false,
      });
    } else {
      map.setView(KUALA_LUMPUR, 12, { animate: false });
    }
  }, [map, pins]);

  useEffect(() => {
    if (location) {
      map.setView([location.latitude, location.longitude], 14, {
        animate: false,
      });
    }
  }, [map, location]);

  return null;
}

export default function CoolingCentresDirectoryMap({
  centres,
  location,
  onOpen,
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

        <DirectoryMapView pins={pins} location={location} />

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
