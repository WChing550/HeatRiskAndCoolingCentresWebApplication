const coordinatePair = (point) => {
  if (point?.latitude == null || point?.longitude == null || String(point.latitude).trim() === '' || String(point.longitude).trim() === '') return '';
  const lat = Number(point.latitude), lon = Number(point.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? `${lat},${lon}` : '';
};

export function directionsAddress(address, centreName = '') {
  const parts = String(address || '').split(',').map(part => part.trim()).filter(Boolean);
  const nameParts = String(centreName || '').split(',').map(part => part.trim()).filter(Boolean);
  const normal = value => value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').replace(/[.]+$/g, '');
  // Remove only the known centre-name prefix, preserving house/unit numbers.
  if (nameParts.length && nameParts.every((part, i) => parts[i] && normal(part) === normal(parts[i]))) {
    parts.splice(0, nameParts.length);
  }
  return parts.join(', ');
}

export function walkingDirections(centre, origin) {
  const destination = coordinatePair(centre);
  const lat = Number(centre?.latitude), lon = Number(centre?.longitude);
  if (!destination || lat < 3 || lat > 3.3 || lon < 101.55 || lon > 101.8) return '';
  // The same saved point drives both the centre marker and Google Maps.
  // Address labels from another provider must not be re-geocoded by Google.
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', destination);
  url.searchParams.set('travelmode', 'walking');
  url.searchParams.set('dir_action', 'navigate');
  const start = coordinatePair(origin);
  if (start) url.searchParams.set('origin', start);
  return url.toString();
}

const cancelled = () => Object.assign(new Error('Location request cancelled.'), {name: 'AbortError'});
const timedOut = () => new Error('Finding your location took too long. Check that device location is enabled, allow location access for HeatSafe, then try again.');

export function currentPosition(geolocation = globalThis.navigator?.geolocation, {timeoutMs = 12000, signal} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    if (!geolocation) return reject(new Error('Current location is unavailable. Use a browser with location support on localhost or HTTPS, then try again.'));
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, cancelled());
    // This timer also bounds time waiting for a permission answer.
    const timer = setTimeout(() => finish(reject, timedOut()), timeoutMs);
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      geolocation.getCurrentPosition(
        ({coords}) => coordinatePair(coords)
          ? finish(resolve, {latitude: Number(coords.latitude), longitude: Number(coords.longitude)})
          : finish(reject, new Error('Your device did not return a valid location. Check your device location settings and try again.')),
        (error) => finish(reject, error.code === 1
          ? new Error('Location access was blocked. Allow location access for HeatSafe in your browser settings and try again.')
          : error.code === 3 ? timedOut()
            : new Error('Your current location could not be found. Check your device location settings and try again.')),
        {enableHighAccuracy: false, timeout: 8000, maximumAge: 0},
      );
    } catch (error) { finish(reject, error); }
  });
}

export async function openCurrentLocationDirections(link, {
  geolocation = globalThis.navigator?.geolocation,
  openWindow = globalThis.window?.open?.bind(globalThis.window),
  signal,
  timeoutMs,
} = {}) {
  const url = new URL(link);
  // Keep HeatSafe visible during permission lookup. Open only a ready Maps URL.
  const origin = await currentPosition(geolocation, {signal, timeoutMs});
  if (signal?.aborted) throw cancelled();
  url.searchParams.set('origin', coordinatePair(origin));
  let opened = false;
  try {
    const tab = openWindow?.(url.toString(), '_blank');
    opened = Boolean(tab);
    try { if (tab) tab.opener = null; } catch { /* Maps may already be on another origin. */ }
  } catch { /* Show a normal clickable route link if popups are blocked. */ }
  return {url: url.toString(), opened};
}
