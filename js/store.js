// Data layer. Both stores expose the same interface:
//   store.subscribe(fn)   -> fn(customers[]) is called now and on every change
//   store.put(customer)   -> add or replace one customer (Promise)
//   store.putMany(list)   -> add or replace several (Promise)
//   store.remove(id)      -> delete one (Promise)
//   store.customers       -> current array (read-only snapshot)
//   store.shared          -> true when the list is shared across devices
//   store.onConnection(fn)-> fn(isConnected) for shared stores (optional)

// ---- Browser-only store (localStorage) ----
class LocalStore {
  constructor() {
    this.shared = false;
    this.customers = Storage.load();
    this.listeners = [];
  }
  subscribe(fn) { this.listeners.push(fn); fn(this.customers.slice()); }
  onConnection() {}
  _commit() {
    if (!Storage.save(this.customers)) throw new Error('Could not save to this browser. Storage may be full or disabled.');
    for (const fn of this.listeners) fn(this.customers.slice());
  }
  async put(customer) {
    const c = sanitizeCustomer(customer);
    if (!c) throw new Error('Invalid customer');
    const idx = this.customers.findIndex(x => x.id === c.id);
    if (idx === -1) this.customers.push(c); else this.customers[idx] = c;
    this._commit();
    return c;
  }
  async putMany(list) {
    for (const item of list) {
      const c = sanitizeCustomer(item);
      if (!c) continue;
      const idx = this.customers.findIndex(x => x.id === c.id);
      if (idx === -1) this.customers.push(c); else this.customers[idx] = c;
    }
    this._commit();
  }
  async remove(id) {
    this.customers = this.customers.filter(x => x.id !== id);
    this._commit();
  }
}

// ---- Shared store (Firebase Realtime Database) ----
// Data lives at teams/<teamKey>/customers/<id>. The team key is a long random
// string that acts like a private link: anyone who has it can read and edit.
const TEAM_KEY_STORAGE = 'salesmap.teamKey.v1';
const TEAM_KEY_PATTERN = /^[A-Za-z0-9_-]{24,}$/;

function generateTeamKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(28);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

function isValidTeamKey(key) {
  return typeof key === 'string' && TEAM_KEY_PATTERN.test(key);
}

class FirebaseStore {
  constructor(firebaseConfig, teamKey) {
    if (!isValidTeamKey(teamKey)) throw new Error('Invalid team key');
    if (typeof firebase === 'undefined' || !firebase.database) throw new Error('Firebase library failed to load');
    this.shared = true;
    this.teamKey = teamKey;
    this.customers = [];
    this.listeners = [];
    this.connectionListeners = [];
    this.connected = false;
    this.loaded = false;

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    this.db = firebase.database();
    this.ref = this.db.ref(`teams/${teamKey}/customers`);

    this.ref.on('value', snap => {
      const val = snap.val() || {};
      this.customers = Object.keys(val)
        .map(id => sanitizeCustomer({ ...val[id], id }))
        .filter(Boolean);
      this.loaded = true;
      for (const fn of this.listeners) fn(this.customers.slice());
    }, err => {
      console.error('Firebase read failed', err);
      for (const fn of this.listeners) fn(this.customers.slice(), err);
    });

    this.db.ref('.info/connected').on('value', snap => {
      this.connected = snap.val() === true;
      for (const fn of this.connectionListeners) fn(this.connected);
    });
  }

  subscribe(fn) { this.listeners.push(fn); if (this.loaded) fn(this.customers.slice()); }
  onConnection(fn) { this.connectionListeners.push(fn); fn(this.connected); }

  // Firebase rejects `undefined` and drops `null` values, so strip them.
  _toRecord(c) {
    const out = {};
    for (const [k, v] of Object.entries(c)) if (v !== null && v !== undefined && k !== 'id') out[k] = v;
    return out;
  }

  async put(customer) {
    const c = sanitizeCustomer(customer);
    if (!c) throw new Error('Invalid customer');
    await this.ref.child(c.id).set(this._toRecord(c));
    return c;
  }
  async putMany(list) {
    const updates = {};
    for (const item of list) {
      const c = sanitizeCustomer(item);
      if (c) updates[c.id] = this._toRecord(c);
    }
    if (Object.keys(updates).length) await this.ref.update(updates);
  }
  async remove(id) {
    await this.ref.child(id).remove();
  }
}
