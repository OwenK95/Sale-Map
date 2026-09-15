// Geocoding (Nominatim) and business search (Overpass), both free OpenStreetMap services.
// Usage policy: at most 1 request per second to Nominatim. We rate-limit accordingly.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

let lastNominatimCall = 0;
async function nominatimThrottle() {
  const wait = 1100 - (Date.now() - lastNominatimCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCall = Date.now();
}

// Returns { lat, lng, displayName } or null if nothing was found.
async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  await nominatimThrottle();
  const url = `${NOMINATIM_URL}/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  const data = await res.json();
  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// Reverse geocode a point to a street address string (used when picking a spot on the map).
async function reverseGeocode(lat, lng) {
  await nominatimThrottle();
  const url = `${NOMINATIM_URL}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.display_name ? data.display_name : null;
}

const SEARCH_TYPE_FILTERS = {
  restaurants: [
    '["amenity"="restaurant"]',
  ],
  food: [
    '["amenity"~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten)$"]',
  ],
  all: [
    '["amenity"~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten)$"]',
    '["shop"~"^(bakery|butcher|deli|supermarket|convenience|seafood|pastry|coffee)$"]',
    '["tourism"~"^(hotel|motel)$"]',
    '["amenity"~"^(school|college|university|hospital|nursing_home|social_facility)$"]',
  ],
};

// Builds a single readable address line from OSM address tags.
function formatOsmAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const cityLine = [tags['addr:city'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', ')
    .replace(/, (\S+)$/, ' $1'); // "City, ST 12345"
  const parts = [street, cityLine].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (tags['addr:full']) return tags['addr:full'];
  return '';
}

// Searches OpenStreetMap for food businesses within radiusMeters of a point.
// Returns [{ osmId, name, address, lat, lng, category, phone, website }]
async function searchBusinesses(lat, lng, radiusMeters, typeKey) {
  const filters = SEARCH_TYPE_FILTERS[typeKey] || SEARCH_TYPE_FILTERS.food;
  const around = `(around:${Math.round(radiusMeters)},${lat},${lng})`;
  const query = `[out:json][timeout:40];(${filters.map(f => `nwr${f}${around};`).join('')});out center tags;`;

  let lastErr = null;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      return (data.elements || [])
        .map(el => {
          const tags = el.tags || {};
          const name = tags.name || tags.brand || tags['name:en'];
          if (!name) return null;
          const center = el.type === 'node' ? { lat: el.lat, lon: el.lon } : el.center;
          if (!center) return null;
          return {
            osmId: `${el.type}/${el.id}`,
            name,
            address: formatOsmAddress(tags),
            lat: center.lat,
            lng: center.lon,
            category: (tags.cuisine || tags.amenity || tags.shop || tags.tourism || '').replace(/_/g, ' '),
            phone: tags.phone || tags['contact:phone'] || '',
            website: tags.website || tags['contact:website'] || '',
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      lastErr = err;
      console.warn(`Overpass endpoint failed: ${endpoint}`, err);
    }
  }
  throw lastErr || new Error('Search failed');
}

const METERS_PER_MILE = 1609.344;
