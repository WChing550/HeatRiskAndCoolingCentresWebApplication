import React from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import { MapPin } from 'lucide-react';

import {
  walkingDirections,
  directionsAddress,
} from '../lib/directions.js';
import WalkingDirectionsLink from './WalkingDirectionsLink.jsx';

export default function CentreLocationMap({ centre }) {
  const link = walkingDirections(centre);

  if (!link) {
    return (
      <p className="muted">
        A valid centre location has not been provided.
      </p>
    );
  }

  const position = [
    Number(centre.latitude),
    Number(centre.longitude),
  ];

  return (
    <section className="panel centre-location-detail">
      <header className="panelhead">
        <div>
          <h3>
            <MapPin size={18} />
            Find this cooling centre
          </h3>

          <p>
            {directionsAddress(centre.address, centre.name) ||
              centre.address}
          </p>
        </div>
      </header>

      <div className="centre-detail-map">
        <MapContainer
          key={position.join(',')}
          center={position}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: 310, width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <CircleMarker
            center={position}
            radius={10}
            pathOptions={{
              color: '#536e86',
              fillColor: '#8eabbc',
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <b>{centre.name}</b>
              <br />
              {centre.address}
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      <WalkingDirectionsLink key={link} link={link} />
    </section>
  );
}