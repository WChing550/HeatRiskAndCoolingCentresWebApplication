import 'dotenv/config';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';

const invalid = message => Object.assign(new Error(message), { status: 400 });

const normal = value => String(value || '').trim().replace(/\s+/g, ' ');

export const insideKL = (lat, lon) =>
  Number.isFinite(Number(lat)) &&
  Number.isFinite(Number(lon)) &&
  Number(lat) >= 3 &&
  Number(lat) <= 3.30 &&
  Number(lon) >= 101.55 &&
  Number(lon) <= 101.80;

export function walkingDirections(row) {
  if (!insideKL(row?.latitude, row?.longitude)) return null;

  const url = new URL('https://www.google.com/maps/dir/');

  url.searchParams.set('api', '1');
  url.searchParams.set(
    'destination',
    `${Number(row.latitude)},${Number(row.longitude)}`,
  );
  url.searchParams.set('travelmode', 'walking');
  url.searchParams.set('dir_action', 'navigate');

  return url.toString();
}

export function photonMatches(data) {
  const seen = new Set();

  return (Array.isArray(data?.features) ? data.features : []).flatMap(feature => {
    const p = feature.properties || {},
      [lon, lat] = feature.geometry?.coordinates || [];

    if (
      !insideKL(lat, lon) ||
      !p.osm_id ||
      !['N', 'W', 'R'].includes(p.osm_type)
    ) return [];

    if (
      !/kuala lumpur/i.test(
        [p.city, p.state, p.county, p.district].filter(Boolean).join(', '),
      )
    ) return [];

    const street = [p.housenumber, p.street].filter(Boolean).join(' ');

    const address = [
      ...new Set(
        [p.name, street, p.district, p.city, p.postcode, p.state, p.country]
          .map(normal)
          .filter(Boolean),
      ),
    ].join(', ');

    if (address.length < 8) return [];

    const id = `${p.osm_type}${p.osm_id}`,
      key = address + '|' + Number(lat).toFixed(6) + '|' + Number(lon).toFixed(6);

    if (seen.has(key)) return [];
    seen.add(key);

    // A city/country/region centroid alone is not a facility address.
    if (
      p.osm_key === 'place' &&
      ['city', 'state', 'country', 'county', 'region', 'suburb', 'district'].includes(
        p.osm_value,
      )
    ) return [];

    return [
      {
        id,
        address,
        latitude: Number(Number(lat).toFixed(6)),
        longitude: Number(Number(lon).toFixed(6)),
        attribution: '© OpenStreetMap contributors · Photon',
      },
    ];
  });
}

export function createAddressVerifier({
  secret = process.env.LOCATION_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString('hex'),
  now = Date.now,
  fetchImpl = fetch,
  baseUrl = process.env.GEOCODER_BASE_URL || 'https://photon.komoot.io',
  minInterval = 1100,
} = {}) {
  const cache = new Map();

  let queue = Promise.resolve(),
    lastRequest = 0,
    pending = 0;

  const issueToken = (match, userId) => {
    const payload = Buffer.from(
      JSON.stringify({
        uid: String(userId),
        address: normal(match.address),
        lat: Number(match.latitude),
        lon: Number(match.longitude),
        anchorLat: Number(match.anchorLat ?? match.latitude),
        anchorLon: Number(match.anchorLon ?? match.longitude),
        exp: now() + 30 * 60 * 1000,
      }),
    ).toString('base64url');

    return (
      payload +
      '.' +
      crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    );
  };

  const readToken = (token, address, userId) => {
    try {
      const [payload, signature, ...extra] = String(token || '').split('.');

      if (!payload || !signature || extra.length) throw new Error();

      const expected = crypto.createHmac('sha256', secret).update(payload).digest();
      const supplied = Buffer.from(signature, 'base64url');

      if (
        supplied.length !== expected.length ||
        !crypto.timingSafeEqual(expected, supplied)
      ) throw new Error();

      const match = JSON.parse(Buffer.from(payload, 'base64url').toString());

      if (
        !Number.isFinite(match.exp) ||
        match.exp <= now() ||
        match.uid !== String(userId) ||
        normal(address) !== match.address ||
        !insideKL(match.lat, match.lon)
      ) throw new Error();

      return match;
    } catch {
      throw invalid(
        'Verify the address again and select a matching Kuala Lumpur location before saving.',
      );
    }
  };

  const verifyForSave = (body, previous, userId) => {
    if (!insideKL(body.latitude, body.longitude)) {
      throw invalid('Select a matching location inside Kuala Lumpur.');
    }

    const unchanged =
      previous &&
      normal(previous.address) === normal(body.address) &&
      Math.abs(Number(previous.latitude) - Number(body.latitude)) < .0000005 &&
      Math.abs(Number(previous.longitude) - Number(body.longitude)) < .0000005;

    if (unchanged) return;

    if (body.addressConfirmed !== 'true') {
      throw invalid('Confirm the matched address and centre entrance before saving.');
    }

    const match = readToken(body.locationToken, body.address, userId);

    if (
      Math.abs(Number(body.latitude) - match.lat) > .0000005 ||
      Math.abs(Number(body.longitude) - match.lon) > .0000005
    ) {
      throw invalid('Confirm the entrance pin again before saving.');
    }
  };

  const confirmPin = (body, userId) => {
    const match = readToken(body.locationToken, body.address, userId);

    const latitude = Number(body.latitude),
      longitude = Number(body.longitude);

    if (!insideKL(latitude, longitude)) {
      throw invalid('The entrance pin must be inside Kuala Lumpur.');
    }

    const anchorLat = Number(match.anchorLat ?? match.lat),
      anchorLon = Number(match.anchorLon ?? match.lon);

    const radians = value => value * Math.PI / 180;

    const distance =
      2 *
      6371000 *
      Math.asin(
        Math.min(
          1,
          Math.sqrt(
            Math.sin(radians(latitude - anchorLat) / 2) ** 2 +
              Math.cos(radians(anchorLat)) *
                Math.cos(radians(latitude)) *
                Math.sin(radians(longitude - anchorLon) / 2) ** 2,
          ),
        ),
      );

    if (distance > 1000) {
      throw invalid(
        'This pin is more than 1 km from the address match. Verify a more specific address or building name first.',
      );
    }

    const result = {
      id: 'entrance-pin',
      address: match.address,
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      anchorLat,
      anchorLon,
      attribution: '© OpenStreetMap contributors · entrance confirmed by administrator',
    };

    return { ...result, locationToken: issueToken(result, userId) };
  };

  async function search(query) {
    const q = normal(query);

    if (q.length < 5 || q.length > 300) {
      throw invalid(
        'Enter a specific centre name and street address (5–300 characters).',
      );
    }

    const key = q.toLowerCase(),
      stored = cache.get(key);

    if (stored && stored.until > now()) return stored.matches;

    if (pending >= 5) {
      throw Object.assign(
        new Error('Address search is busy. Please try again shortly.'),
        { status: 429 },
      );
    }

    pending++;

    const task = queue.then(async () => {
      const cached = cache.get(key);

      if (cached && cached.until > now()) return cached.matches;

      const wait = Math.max(0, minInterval - (now() - lastRequest));

      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastRequest = now();

      const url = new URL('/api/', baseUrl);

      url.searchParams.set('q', q);
      url.searchParams.set('limit', '6');
      url.searchParams.set('lang', 'en');
      url.searchParams.set('bbox', '101.55,3.00,101.80,3.30');

      let response;

      try {
        response = await fetchImpl(url, {
          signal: AbortSignal.timeout(10000),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'HeatSafeKL/1.0 (cooling-centre address confirmation)',
          },
        });
      } catch {
        throw Object.assign(
          new Error(
            'Address verification is temporarily unavailable. Your form has been kept; please try again.',
          ),
          { status: 503 },
        );
      }

      if (!response.ok) {
        throw Object.assign(
          new Error('Address verification is temporarily unavailable. Please try again.'),
          { status: 503 },
        );
      }

      let data;

      try {
        data = await response.json();
      } catch {
        throw Object.assign(
          new Error('Address search returned an unreadable response. Please try again.'),
          { status: 503 },
        );
      }

      const matches = photonMatches(data);

      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { matches, until: now() + 3600000 });

      return matches;
    });

    queue = task.catch(() => { });

    try {
      return await task;
    } finally {
      pending--;
    }
  }

  return { issueToken, verifyForSave, search, confirmPin };
}

export const addressVerifier = createAddressVerifier();

export function registerCentreLocationRoutes(
  app,
  { auth, admin, ar, verifier = addressVerifier },
) {
  app.get(
    '/api/admin/centre-locations/search',
    auth,
    admin,
    rateLimit({
      windowMs: 60000,
      limit: 15,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    ar(async (q, s) => {
      const matches = await verifier.search(q.query.q);

      s.set('Cache-Control', 'no-store').json({
        matches: matches.map(match => ({
          ...match,
          locationToken: verifier.issueToken(match, q.session.user.id),
        })),
      });
    }),
  );

  app.post(
    '/api/admin/centre-locations/confirm-pin',
    auth,
    admin,
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    ar(async (q, s) => {
      s.set('Cache-Control', 'no-store').json(
        verifier.confirmPin(q.body, q.session.user.id),
      );
    }),
  );
}