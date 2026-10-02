// Customer status definitions. Order here is the order shown in dropdowns and the legend.
//
// `color`     is used for the map pin and the legend dot.
// `textColor` is used where the label is drawn as text on a white background. Light pins
//             such as yellow are unreadable as text, so they get a darker shade. Every
//             textColor below meets WCAG AA contrast (4.5:1) on white.
//
// To add, rename, or recolor a status, edit this list. Everything else follows from it.
const STATUSES = [
  { id: 'not_customer',        label: 'Not a Customer',                   color: '#6b7280', textColor: '#6b7280' }, // gray
  { id: 'prospected',          label: 'Prospected',                       color: '#dc2626', textColor: '#dc2626' }, // red
  { id: 'follow_up',           label: 'Follow-Up Needed',                 color: '#f97316', textColor: '#c2410c' }, // orange
  { id: 'dm_unavailable',      label: 'Decision Maker Unavailable',       color: '#facc15', textColor: '#a16207' }, // yellow
  { id: 'grease_contract',     label: 'Grease Trap Service Contract',     color: '#2563eb', textColor: '#2563eb' }, // blue
  { id: 'uco_contract',        label: 'Used Cooking Oil (UCO) Contract',  color: '#16a34a', textColor: '#15803d' }, // green
  { id: 'grease_uco_contract', label: 'Grease Trap and UCO Contracts',    color: '#7c3aed', textColor: '#7c3aed' }, // purple
];

const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));
const DEFAULT_STATUS = 'not_customer';

// Statuses used by earlier versions of the app, mapped to their closest current status.
// Without this, any customer saved under an old status would silently become
// "Not a Customer" the next time the list loaded. Keys are old status ids and old
// labels in lower case, so both saved records and older JSON/CSV backups still import.
//
// Note: records that still hold an old id are translated when they are read, so nothing
// is rewritten in the database until that customer is next saved. Nothing is lost either
// way.
const STATUS_MIGRATIONS = {
  // old id -> new id
  'talked_to': 'prospected',
  'grease_no_contract': 'follow_up',   // serviced without a contract: a conversion target
  'oil_no_contract': 'follow_up',      // same
  'oil_contract': 'uco_contract',
  'both': 'grease_uco_contract',
  // 'not_customer' and 'grease_contract' kept their ids, so they need no mapping.

  // old label (lower case) -> new id, for importing older backups
  'talked to': 'prospected',
  'service grease trap (no contract)': 'follow_up',
  'service oil (no contract)': 'follow_up',
  'service grease trap (contract)': 'grease_contract',
  'service oil (contract)': 'uco_contract',
  'service both oil and grease': 'grease_uco_contract',
};

function getStatus(id) {
  return STATUS_BY_ID[id] || STATUS_BY_ID[DEFAULT_STATUS];
}

// Accepts a status id or a label, including ones from older versions, and returns a
// valid current id.
function normalizeStatus(value) {
  if (!value) return DEFAULT_STATUS;
  if (STATUS_BY_ID[value]) return value;
  if (STATUS_MIGRATIONS[value]) return STATUS_MIGRATIONS[value];

  const needle = String(value).trim().toLowerCase();
  const byLabel = STATUSES.find(s => s.label.toLowerCase() === needle);
  if (byLabel) return byLabel.id;
  if (STATUS_MIGRATIONS[needle]) return STATUS_MIGRATIONS[needle];
  return DEFAULT_STATUS;
}
