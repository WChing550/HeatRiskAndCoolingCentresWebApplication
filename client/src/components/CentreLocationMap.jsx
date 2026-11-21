import React from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import { directionsAddress, walkingDirections } from '../lib/directions.js';
import WalkingDirectionsLink from './WalkingDirectionsLink.jsx';

export default function CentreLocationMap({ centre }) {
  const link = walkingDirections(centre);

  if (!link) {
    return <p className="muted">A valid centre location has not been provided.</p>;
  }

  const position = [Number(centre.latitude), Number(centre.longitude)];
  const name = centre.name || 'Cooling centre';
  const address = directionsAddress(centre.address, centre.name) || centre.address;

  return (
    <section className="panel centre-location-detail">
      <header className="panelhead">
        <div>
          <h3><MapPin size={18} />Find this cooling centre</h3>
          <p>{address}</p>
        </div>
      </header>

      <div className="centre-detail-map" role="region" aria-label="Cooling centre location">
        <MapContainer
          key={position.join(',')}
          center={position}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: 310, width: '100%' }}
        >
          <TileLayer
            attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker
            center={position}
            radius={10}
            pathOptions={{ color: '#536e86', fillColor: '#8eabbc', fillOpacity: 0.9 }}
          >
            <Popup><b>{name}</b><br />{centre.address}</Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      <WalkingDirectionsLink key={link} link={link} />
      <p className="directions-note">
        Starts from your current location and opens a walking route to this cooling
        centre’s map pin in Google Maps. Allow location access when prompted.
      </p>
    </section>
  );
}