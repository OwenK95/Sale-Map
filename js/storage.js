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

// Follow-up dates are plain calendar dates stored as YYYY-MM-DD, the format an
// <input type="date"> produces. They are compared as strings against today's local date,
// which avoids the timezone bug you get from `new Date('2026-10-15')`: that parses as UTC
// midnight and reads as the previous day in every US timezone.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// 'overdue' | 'today' | 'upcoming', or null when there is no date.
function dueState(iso) {
  if (!isValidIsoDate(iso)) return null;
  const today = todayIso();
  if (iso < today) return 'overdue';
  if (iso === today) return 'today';
  return 'upcoming';
}

// Builds the date locally so it does not shift across timezones.
function formatDateLabel(iso) {
  if (!isValidIsoDate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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
  const status = normalizeStatus(c.status);
  // A follow-up date only means something for the statuses that use one. Dropping it
  // otherwise stops a stale date from riding along on a customer who has since signed.
  const followUpDate = statusNeedsDate(status) && isValidIsoDate(c.followUpDate) ? c.followUpDate : null;
  return {
    id: c.id ? String(c.id) : generateId(),
    name,
    address: String(c.address || '').trim(),
    status,
    followUpDate,
    notes: String(c.notes || '').trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    osmId: c.osmId ? String(c.osmId) : null,
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString(),
  };
}

function customersToCsv(customers) {
  const header = ['Name', 'Address', 'Status', 'Follow-Up Date', 'Notes', 'Latitude', 'Longitude'];
  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = customers.map(c => [
    c.name, c.address, getStatus(c.status).label, c.followUpDate ?? '', c.notes, c.lat ?? '', c.lng ?? '',
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
