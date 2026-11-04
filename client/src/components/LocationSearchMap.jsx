import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, Search, LoaderCircle, Crosshair } from 'lucide-react';

const DEFAULT_CENTER = [3.139, 101.6869];
const NOMINATIM = 'https://nominatim.openstreetmap.org';

function MapViewport({ position, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    if (position && Number.isFinite(position[0]) && Number.isFinite(position[1])) {
      map.setView(position, zoom, { animate: true });
    }
  }, [map, position, zoom]);
  return null;
}

function ClickToSelect({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function LocationSearchMap({ latitude, longitude, address, onSelect }) {
  const [query, setQuery] = useState(address || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const lat = Number(latitude);
  const lon = Number(longitude);
  const hasCoords = latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lon);
  const position = useMemo(() => hasCoords ? [lat, lon] : DEFAULT_CENTER, [hasCoords, lat, lon]);

  useEffect(() => setQuery(address || ''), [address]);

  async function searchLocation(event) {
    event?.preventDefault();
    const searchText = query.trim();
    if (!searchText) {
      setMessage('Enter a place name or address to search.');
      return;
    }
    setLoading(true);
    setMessage('');
    setResults([]);
    try {
      const url = new URL(`${NOMINATIM}/search`);
      url.searchParams.set('q', searchText);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '6');
      url.searchParams.set('countrycodes', 'my');
      // Prefer English place names in Nominatim search results.
      url.searchParams.set('accept-language', 'en');
      const response = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'en' } });
      if (!response.ok) throw new Error('Location search is temporarily unavailable.');
      const data = await response.json();
      if (!data.length) {
        setMessage('No matching places found. Try a fuller address or nearby landmark.');
      } else if (data.length === 1) {
        chooseResult(data[0]);
      } else {
        setResults(data);
      }
    } catch (error) {
      setMessage(error.message || 'Could not search for this location. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function chooseResult(result) {
    const nextLat = Number(result.lat);
    const nextLon = Number(result.lon);
    onSelect({
      latitude: nextLat.toFixed(6),
      longitude: nextLon.toFixed(6),
      address: result.display_name || address || '',
    });
    setQuery(result.display_name || '');
    setResults([]);
    setMessage('Location selected. Please verify the address and pin before saving.');
  }

  async function reverseGeocode(nextLat, nextLon) {
    onSelect({
      latitude: nextLat.toFixed(6),
      longitude: nextLon.toFixed(6),
      address: address || '',
    });
    setMessage('Finding the address for this pin…');
    try {
      const url = new URL(`${NOMINATIM}/reverse`);
      url.searchParams.set('lat', String(nextLat));
      url.searchParams.set('lon', String(nextLon));
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      // Prefer English address labels when resolving a map pin.
      url.searchParams.set('accept-language', 'en');
      const response = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'en' } });
      if (!response.ok) throw new Error('Address lookup failed.');
      const result = await response.json();
      const foundAddress = result.display_name || '';
      onSelect({
        latitude: nextLat.toFixed(6),
        longitude: nextLon.toFixed(6),
        address: foundAddress,
      });
      setQuery(foundAddress);
      setMessage(foundAddress
        ? 'Address found. Please verify it before saving.'
        : 'Pin selected, but no address was returned. You can enter the address manually.');
    } catch {
      setMessage('Pin selected. Address lookup failed, so please enter the address manually.');
    }
  }

  return (
    <section className="location-search-panel" aria-label="Search and select cooling centre location">
      <form className="location-search-form" onSubmit={searchLocation}>
        <label className="location-search-label" htmlFor="centre-location-search">Search place or address</label>
        <div className="location-search-row">
          <div className="location-search-input-wrap">
            <Search size={18} aria-hidden="true" />
            <input
              id="centre-location-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="e.g. Kuala Lumpur City Centre, street address…"
              autoComplete="off"
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {results.length > 0 && (
        <div className="location-search-results" role="listbox" aria-label="Search results">
          {results.map((result, index) => (
            <button type="button" role="option" aria-selected="false" key={`${result.place_id}-${index}`} onClick={() => chooseResult(result)}>
              <MapPin size={17} />
              <span>{result.display_name}</span>
            </button>
          ))}
        </div>
      )}
      {message && <p className="location-search-message" role="status">{message}</p>}

      <div className="map map-picker location-search-map">
        <MapContainer center={position} zoom={hasCoords ? 16 : 12} scrollWheelZoom style={{ height: 350, width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewport position={position} />
          <ClickToSelect onPick={reverseGeocode} />
          <Marker position={position}>
            <Popup>
              <strong>Selected cooling centre</strong><br />
              {hasCoords ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : 'Search for a place or click the map'}
            </Popup>
          </Marker>
        </MapContainer>
      </div>
      <div className="location-coordinates">
        <span><Crosshair size={15} /> Latitude: <strong>{hasCoords ? lat.toFixed(6) : '—'}</strong></span>
        <span>Longitude: <strong>{hasCoords ? lon.toFixed(6) : '—'}</strong></span>
      </div>
      <p className="location-search-footnote">Search results and addresses come from OpenStreetMap contributors. Map data may not identify a building entrance or postal address precisely; check the pin and edit the address if needed.</p>
    </section>
  );
}