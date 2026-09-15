// Customer status definitions. Order here is the order shown in dropdowns and the legend.
const STATUSES = [
  { id: 'not_customer',        label: 'Not a Customer',                    color: '#6b7280' },
  { id: 'talked_to',           label: 'Talked To',                         color: '#3b82f6' },
  { id: 'grease_no_contract',  label: 'Service Grease Trap (No Contract)', color: '#f59e0b' },
  { id: 'oil_no_contract',     label: 'Service Oil (No Contract)',         color: '#f97316' },
  { id: 'grease_contract',     label: 'Service Grease Trap (Contract)',    color: '#22c55e' },
  { id: 'oil_contract',        label: 'Service Oil (Contract)',            color: '#14b8a6' },
  { id: 'both',                label: 'Service Both Oil and Grease',       color: '#8b5cf6' },
];

const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));
const DEFAULT_STATUS = 'not_customer';

function getStatus(id) {
  return STATUS_BY_ID[id] || STATUS_BY_ID[DEFAULT_STATUS];
}

// Accepts a status id or a label (used when importing files) and returns a valid id.
function normalizeStatus(value) {
  if (!value) return DEFAULT_STATUS;
  if (STATUS_BY_ID[value]) return value;
  const needle = String(value).trim().toLowerCase();
  const match = STATUSES.find(s => s.label.toLowerCase() === needle);
  return match ? match.id : DEFAULT_STATUS;
}
