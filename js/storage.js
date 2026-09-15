// Customers are stored in the browser's localStorage. Use Export/Import to share between devices.
const STORAGE_KEY = 'salesmap.customers.v1';

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.map(sanitizeCustomer).filter(Boolean) : [];
    } catch (err) {
      console.error('Failed to load customers', err);
      return [];
    }
  },

  save(customers) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
      return true;
    } catch (err) {
      console.error('Failed to save customers', err);
      return false;
    }
  },
};

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// Ensures a customer record has every required field with the right type.
function sanitizeCustomer(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name || '').trim();
  if (!name) return null;
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  return {
    id: c.id ? String(c.id) : generateId(),
    name,
    address: String(c.address || '').trim(),
    status: normalizeStatus(c.status),
    notes: String(c.notes || '').trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    osmId: c.osmId ? String(c.osmId) : null,
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString(),
  };
}

function customersToCsv(customers) {
  const header = ['Name', 'Address', 'Status', 'Notes', 'Latitude', 'Longitude'];
  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = customers.map(c => [
    c.name, c.address, getStatus(c.status).label, c.notes, c.lat ?? '', c.lng ?? '',
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\r\n');
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
