/* Sales Map – main application logic */
(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $ = id => document.getElementById(id);
  const el = {
    sidebar: $('sidebar'), toggleSidebar: $('toggleSidebar'),
    customerCount: $('customerCount'), connection: $('connectionStatus'),
    shareBtn: $('shareBtn'), modeBadge: $('modeBadge'),
    customerList: $('customerList'), customerEmpty: $('customerEmpty'),
    filterText: $('customerFilterText'), filterStatus: $('customerFilterStatus'),
    legend: $('legend'),
    searchForm: $('searchForm'), searchLocation: $('searchLocation'), searchRadius: $('searchRadius'),
    searchTypes: $('searchTypes'), searchBtn: $('searchBtn'), searchStatus: $('searchStatus'),
    searchActions: $('searchActions'), searchResults: $('searchResults'),
    addAllBtn: $('addAllBtn'), clearResultsBtn: $('clearResultsBtn'),
    customerForm: $('customerForm'), formTitle: $('formTitle'), customerId: $('customerId'),
    customerName: $('customerName'), customerAddress: $('customerAddress'),
    customerStatus: $('customerStatus'), customerNotes: $('customerNotes'),
    customerLat: $('customerLat'), customerLng: $('customerLng'),
    geocodeBtn: $('geocodeBtn'), pickOnMapBtn: $('pickOnMapBtn'), locationStatus: $('locationStatus'),
    cancelEditBtn: $('cancelEditBtn'),
    mapHint: $('mapHint'), cancelPickBtn: $('cancelPickBtn'),
    exportJsonBtn: $('exportJsonBtn'), exportCsvBtn: $('exportCsvBtn'), importFile: $('importFile'),
    toast: $('toast'),
    landing: $('landing'), createTeamBtn: $('createTeamBtn'), joinForm: $('joinForm'), joinLink: $('joinLink'),
    shareDialog: $('shareDialog'), shareLink: $('shareLink'), copyLinkBtn: $('copyLinkBtn'), closeShareBtn: $('closeShareBtn'),
    localBanner: $('localBanner'), localBannerText: $('localBannerText'), uploadLocalBtn: $('uploadLocalBtn'), dismissLocalBtn: $('dismissLocalBtn'),
  };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let toastTimer = null;
  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', !!isError);
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }

  // ---------- Store selection (shared vs. browser-only) ----------
  const config = window.SALES_MAP_CONFIG || {};
  const sharedEnabled = !!(config.firebase && config.firebase.databaseURL);
  let store = null;
  let customers = [];

  function teamKeyFromUrl() {
    const key = new URLSearchParams(location.search).get('team');
    return isValidTeamKey(key) ? key : null;
  }

  function teamUrl(key) {
    const url = new URL(location.href);
    url.search = '?team=' + key;
    url.hash = '';
    return url.toString();
  }

  function chooseStore() {
    if (!sharedEnabled) {
      el.modeBadge.textContent = 'This device only';
      el.modeBadge.title = 'Customers are saved in this browser. See README to set up a shared team map.';
      return new LocalStore();
    }
    let key = teamKeyFromUrl();
    if (!key) {
      let saved = null;
      try { saved = localStorage.getItem(TEAM_KEY_STORAGE); } catch (_) {}
      if (isValidTeamKey(saved)) { location.replace(teamUrl(saved)); return null; }
      showLanding();
      return null;
    }
    try { localStorage.setItem(TEAM_KEY_STORAGE, key); } catch (_) {}
    el.modeBadge.textContent = 'Shared team map';
    el.modeBadge.title = 'Everyone with the link sees and edits the same list.';
    el.shareBtn.classList.remove('hidden');
    try {
      return new FirebaseStore(config.firebase, key);
    } catch (err) {
      console.error(err);
      alert('Could not connect to the shared database: ' + err.message + '\n\nFalling back to this device only.');
      el.modeBadge.textContent = 'This device only';
      return new LocalStore();
    }
  }

  function showLanding() {
    el.landing.classList.remove('hidden');
    el.createTeamBtn.addEventListener('click', () => {
      location.href = teamUrl(generateTeamKey());
    });
    el.joinForm.addEventListener('submit', e => {
      e.preventDefault();
      const text = el.joinLink.value.trim();
      let key = null;
      try { key = new URL(text).searchParams.get('team'); } catch (_) { key = text; }
      if (!isValidTeamKey(key)) { alert('That does not look like a Sales Map link. Paste the full link you were given.'); return; }
      location.href = teamUrl(key);
    });
  }

  // ---------- Share dialog ----------
  el.shareBtn.addEventListener('click', () => {
    el.shareLink.value = location.href;
    el.shareDialog.classList.remove('hidden');
    el.shareLink.select();
  });
  el.closeShareBtn.addEventListener('click', () => el.shareDialog.classList.add('hidden'));
  el.copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.shareLink.value);
      toast('Link copied');
    } catch (_) {
      el.shareLink.select();
      document.execCommand && document.execCommand('copy');
      toast('Link selected. Press Ctrl+C / Cmd+C to copy.');
    }
  });

  // ---------- Map ----------
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const customerLayer = L.layerGroup().addTo(map);
  const resultLayer = L.layerGroup().addTo(map);
  const customerMarkers = new Map(); // customer id -> Leaflet marker
  const resultMarkers = new Map();   // osmId -> Leaflet marker
  const MAP_VIEW_KEY = 'salesmap.view.v1';
  let initialViewSet = false;

  function restoreView() {
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_VIEW_KEY));
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Number.isFinite(saved.zoom)) {
        map.setView([saved.lat, saved.lng], saved.zoom);
        initialViewSet = true;
        return;
      }
    } catch (_) { /* ignore */ }
    map.setView([39.8283, -98.5795], 4); // continental US until we know better
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        if (!initialViewSet) { map.setView([pos.coords.latitude, pos.coords.longitude], 13); initialViewSet = true; }
      }, () => {}, { timeout: 5000 });
    }
  }
  restoreView();
  map.on('moveend', () => {
    const c = map.getCenter();
    try { localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })); } catch (_) {}
  });

  function markerIcon(color, isResult) {
    return L.divIcon({
      className: 'pin-icon',
      html: `<span class="pin ${isResult ? 'pin-result' : ''}" style="--pin-color:${color}"></span>`,
      iconSize: [24, 32],
      iconAnchor: [12, 32],
      popupAnchor: [0, -30],
    });
  }

  function statusOptionsHtml(selected) {
    return STATUSES.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('');
  }

  function customerPopupHtml(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return '<div class="popup">This customer was removed.</div>';
    const s = getStatus(c.status);
    return `
      <div class="popup" data-id="${escapeHtml(c.id)}">
        <div class="popup-title">${escapeHtml(c.name)}</div>
        <div class="popup-address">${escapeHtml(c.address || 'No address')}</div>
        ${c.notes ? `<div class="popup-notes">${escapeHtml(c.notes)}</div>` : ''}
        <label class="popup-label">Status
          <select class="popup-status" style="border-left: 6px solid ${s.color}">${statusOptionsHtml(c.status)}</select>
        </label>
        <div class="popup-actions">
          <button class="btn btn-sm popup-edit">Edit</button>
          <button class="btn btn-sm btn-danger popup-delete">Delete</button>
        </div>
      </div>`;
  }

  // Incremental update so live changes from teammates don't disturb the map.
  function renderCustomerMarkers() {
    const seen = new Set();
    for (const c of customers) {
      if (c.lat == null || c.lng == null) continue;
      seen.add(c.id);
      const color = getStatus(c.status).color;
      let marker = customerMarkers.get(c.id);
      if (!marker) {
        marker = L.marker([c.lat, c.lng], { icon: markerIcon(color, false), title: c.name });
        marker.bindPopup(() => customerPopupHtml(c.id), { minWidth: 220 });
        marker.addTo(customerLayer);
        customerMarkers.set(c.id, marker);
        marker._salesColor = color;
      } else {
        const pos = marker.getLatLng();
        if (pos.lat !== c.lat || pos.lng !== c.lng) marker.setLatLng([c.lat, c.lng]);
        if (marker._salesColor !== color) { marker.setIcon(markerIcon(color, false)); marker._salesColor = color; }
      }
    }
    for (const [id, marker] of customerMarkers) {
      if (!seen.has(id)) { customerLayer.removeLayer(marker); customerMarkers.delete(id); }
    }
  }

  // Popup interactions
  map.on('popupopen', e => {
    const root = e.popup.getElement();
    if (!root) return;
    const box = root.querySelector('.popup[data-id]');
    if (!box) return;
    const id = box.dataset.id;
    const select = box.querySelector('.popup-status');
    if (select) {
      select.addEventListener('change', async () => {
        select.style.borderLeftColor = getStatus(select.value).color;
        await updateCustomer(id, { status: select.value }, 'Status updated');
      });
    }
    box.querySelector('.popup-edit').addEventListener('click', () => { map.closePopup(); startEdit(id); });
    box.querySelector('.popup-delete').addEventListener('click', () => { map.closePopup(); deleteCustomer(id); });
  });

  // ---------- Customer CRUD (through the store) ----------
  async function withErrors(promise, successMsg) {
    try {
      const result = await promise;
      if (successMsg) toast(successMsg);
      return result;
    } catch (err) {
      console.error(err);
      toast('Save failed: ' + (err.message || 'unknown error'), true);
      return null;
    }
  }

  function addCustomer(data, successMsg) {
    return withErrors(store.put({ ...data, id: generateId() }), successMsg);
  }

  function updateCustomer(id, changes, successMsg) {
    const existing = customers.find(c => c.id === id);
    if (!existing) return Promise.resolve(null);
    return withErrors(store.put({ ...existing, ...changes, updatedAt: new Date().toISOString() }), successMsg);
  }

  function deleteCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}" from the customer list?`)) return;
    withErrors(store.remove(id), 'Customer deleted');
  }

  function findByOsmId(osmId) {
    return osmId ? customers.find(c => c.osmId === osmId) : null;
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderCustomerMarkers();
    renderCustomerList();
    renderSearchResults();
    el.customerCount.textContent = `${customers.length} customer${customers.length === 1 ? '' : 's'}`;
  }

  function renderLegend() {
    const counts = {};
    for (const c of customers) counts[c.status] = (counts[c.status] || 0) + 1;
    el.legend.innerHTML = STATUSES.map(s => `
      <button class="legend-item ${el.filterStatus.value === s.id ? 'active' : ''}" data-status="${s.id}" title="Filter by ${escapeHtml(s.label)}">
        <span class="legend-dot" style="background:${s.color}"></span>
        <span class="legend-label">${escapeHtml(s.label)}</span>
        <span class="legend-count">${counts[s.id] || 0}</span>
      </button>`).join('');
  }

  function renderCustomerList() {
    renderLegend();
    const text = el.filterText.value.trim().toLowerCase();
    const status = el.filterStatus.value;
    const filtered = customers
      .filter(c => !status || c.status === status)
      .filter(c => !text || c.name.toLowerCase().includes(text) || c.address.toLowerCase().includes(text) || c.notes.toLowerCase().includes(text))
      .sort((a, b) => a.name.localeCompare(b.name));

    el.customerEmpty.classList.toggle('hidden', customers.length > 0);
    el.customerList.innerHTML = filtered.map(c => {
      const s = getStatus(c.status);
      return `
        <li class="list-item" data-id="${escapeHtml(c.id)}">
          <span class="legend-dot" style="background:${s.color}" title="${escapeHtml(s.label)}"></span>
          <div class="list-body">
            <div class="list-title">${escapeHtml(c.name)}</div>
            <div class="list-sub">${escapeHtml(c.address || 'No address')}</div>
            <div class="list-status" style="color:${s.color}">${escapeHtml(s.label)}${c.lat == null ? ' &middot; <em>not on map</em>' : ''}</div>
          </div>
          <div class="list-actions">
            <button class="icon-btn small edit-btn" title="Edit">&#9998;</button>
            <button class="icon-btn small delete-btn" title="Delete">&times;</button>
          </div>
        </li>`;
    }).join('');
    if (customers.length && !filtered.length) {
      el.customerList.innerHTML = '<li class="empty-msg">No customers match this filter.</li>';
    }
  }

  el.customerList.addEventListener('click', e => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest('.edit-btn')) return startEdit(id);
    if (e.target.closest('.delete-btn')) return deleteCustomer(id);
    focusCustomer(id);
  });

  function focusCustomer(id) {
    const marker = customerMarkers.get(id);
    if (!marker) { toast('This customer has no map location yet. Edit it to set one.', true); return; }
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
    marker.openPopup();
    if (window.innerWidth < 800) el.sidebar.classList.add('collapsed');
  }

  el.filterText.addEventListener('input', renderCustomerList);
  el.filterStatus.addEventListener('change', renderCustomerList);
  el.legend.addEventListener('click', e => {
    const item = e.target.closest('.legend-item');
    if (!item) return;
    el.filterStatus.value = el.filterStatus.value === item.dataset.status ? '' : item.dataset.status;
    renderCustomerList();
  });

  // ---------- Search (Overpass) ----------
  let searchResults = [];

  function setSearchStatus(msg, isError) {
    el.searchStatus.textContent = msg || '';
    el.searchStatus.classList.toggle('error', !!isError);
  }

  el.searchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const radiusMiles = parseFloat(el.searchRadius.value);
    const typeKey = el.searchTypes.value;
    const location = el.searchLocation.value.trim();
    el.searchBtn.disabled = true;
    try {
      let center;
      if (location) {
        setSearchStatus('Looking up location...');
        const geo = await geocodeAddress(location);
        if (!geo) { setSearchStatus(`Could not find "${location}". Try a city and state or a ZIP code.`, true); return; }
        center = { lat: geo.lat, lng: geo.lng };
        map.setView([geo.lat, geo.lng], radiusMiles <= 2 ? 14 : radiusMiles <= 5 ? 12 : 11);
      } else {
        const c = map.getCenter();
        center = { lat: c.lat, lng: c.lng };
      }
      setSearchStatus('Searching OpenStreetMap for businesses...');
      searchResults = await searchBusinesses(center.lat, center.lng, radiusMiles * METERS_PER_MILE, typeKey);
      const newCount = searchResults.filter(r => !findByOsmId(r.osmId)).length;
      setSearchStatus(searchResults.length
        ? `Found ${searchResults.length} businesses (${newCount} not yet in your list).`
        : 'No businesses found in this area. Try a larger radius or a different type.');
      renderSearchResults();
      if (searchResults.length) {
        map.fitBounds(searchResults.map(r => [r.lat, r.lng]), { padding: [30, 30], maxZoom: 15 });
      }
    } catch (err) {
      console.error(err);
      setSearchStatus('Search failed: ' + (err.message || 'network error') + '. The free OpenStreetMap search service may be busy; please try again in a moment.', true);
    } finally {
      el.searchBtn.disabled = false;
    }
  });

  function resultPopupHtml(r) {
    return `
      <div class="popup" data-osm="${escapeHtml(r.osmId)}">
        <div class="popup-title">${escapeHtml(r.name)}</div>
        <div class="popup-address">${escapeHtml(r.address || 'Address not listed')}</div>
        ${r.category ? `<div class="popup-notes">${escapeHtml(r.category)}</div>` : ''}
        ${r.phone ? `<div class="popup-notes">${escapeHtml(r.phone)}</div>` : ''}
        <label class="popup-label">Add as
          <select class="popup-status result-status">${statusOptionsHtml(DEFAULT_STATUS)}</select>
        </label>
        <div class="popup-actions">
          <button class="btn btn-sm btn-primary result-add">Add to customers</button>
        </div>
      </div>`;
  }

  function renderSearchResults() {
    el.searchActions.classList.toggle('hidden', searchResults.length === 0);

    el.searchResults.innerHTML = searchResults.map(r => {
      const existing = findByOsmId(r.osmId);
      const s = existing ? getStatus(existing.status) : null;
      return `
        <li class="list-item ${existing ? 'is-customer' : ''}" data-osm="${escapeHtml(r.osmId)}">
          <span class="legend-dot ${existing ? '' : 'legend-dot-outline'}" style="background:${existing ? s.color : 'transparent'}"></span>
          <div class="list-body">
            <div class="list-title">${escapeHtml(r.name)}</div>
            <div class="list-sub">${escapeHtml(r.address || 'Address not listed')}${r.category ? ` &middot; ${escapeHtml(r.category)}` : ''}</div>
            ${existing ? `<div class="list-status" style="color:${s.color}">In list: ${escapeHtml(s.label)}</div>` : ''}
          </div>
          <div class="list-actions">
            ${existing ? '' : `<button class="btn btn-sm add-result-btn">Add</button>`}
          </div>
        </li>`;
    }).join('');

    // Result pins only for businesses not yet in the list (those show as customer pins).
    const seen = new Set();
    for (const r of searchResults) {
      if (findByOsmId(r.osmId)) continue;
      seen.add(r.osmId);
      if (resultMarkers.has(r.osmId)) continue;
      const marker = L.marker([r.lat, r.lng], { icon: markerIcon('#ffffff', true), title: r.name });
      marker.bindPopup(() => resultPopupHtml(r), { minWidth: 220 });
      marker.addTo(resultLayer);
      resultMarkers.set(r.osmId, marker);
    }
    for (const [osmId, marker] of resultMarkers) {
      if (!seen.has(osmId)) { resultLayer.removeLayer(marker); resultMarkers.delete(osmId); }
    }
  }

  map.on('popupopen', e => {
    const root = e.popup.getElement();
    const box = root && root.querySelector('.popup[data-osm]');
    if (!box) return;
    const osmId = box.dataset.osm;
    box.querySelector('.result-add').addEventListener('click', () => {
      const status = box.querySelector('.result-status').value;
      map.closePopup();
      addResultAsCustomer(osmId, status);
    });
  });

  el.searchResults.addEventListener('click', e => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    const osmId = item.dataset.osm;
    if (e.target.closest('.add-result-btn')) return addResultAsCustomer(osmId, DEFAULT_STATUS);
    const existing = findByOsmId(osmId);
    if (existing) return focusCustomer(existing.id);
    const marker = resultMarkers.get(osmId);
    if (marker) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
      marker.openPopup();
    }
  });

  function resultToCustomer(r, status) {
    return {
      id: generateId(), name: r.name, address: r.address, status,
      notes: [r.phone, r.website].filter(Boolean).join(' · '),
      lat: r.lat, lng: r.lng, osmId: r.osmId,
    };
  }

  function addResultAsCustomer(osmId, status) {
    const r = searchResults.find(x => x.osmId === osmId);
    if (!r || findByOsmId(osmId)) return;
    withErrors(store.put(resultToCustomer(r, status)), `Added "${r.name}"`);
  }

  el.addAllBtn.addEventListener('click', () => {
    const fresh = searchResults.filter(r => !findByOsmId(r.osmId));
    if (!fresh.length) { toast('All results are already in your list.'); return; }
    if (!confirm(`Add ${fresh.length} businesses to the customer list as "Not a Customer"?`)) return;
    withErrors(store.putMany(fresh.map(r => resultToCustomer(r, DEFAULT_STATUS))), `Added ${fresh.length} businesses`);
  });

  el.clearResultsBtn.addEventListener('click', () => {
    searchResults = [];
    setSearchStatus('');
    renderSearchResults();
  });

  // ---------- Add / Edit form ----------
  function setLocationStatus(msg, isError) {
    el.locationStatus.textContent = msg;
    el.locationStatus.classList.toggle('error', !!isError);
  }

  function resetForm() {
    el.customerForm.reset();
    el.customerId.value = '';
    el.customerLat.value = '';
    el.customerLng.value = '';
    el.customerStatus.value = DEFAULT_STATUS;
    el.formTitle.textContent = 'Add Customer';
    el.cancelEditBtn.classList.add('hidden');
    setLocationStatus('Location will be looked up automatically from the address when you save.');
    stopPicking();
  }

  function startEdit(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    resetForm();
    el.customerId.value = c.id;
    el.customerName.value = c.name;
    el.customerAddress.value = c.address;
    el.customerStatus.value = c.status;
    el.customerNotes.value = c.notes;
    el.customerLat.value = c.lat ?? '';
    el.customerLng.value = c.lng ?? '';
    el.formTitle.textContent = 'Edit Customer';
    el.cancelEditBtn.classList.remove('hidden');
    setLocationStatus(c.lat != null ? 'Location is set. Change the address and click "Find address on map" to update it.' : 'No location yet. It will be looked up from the address when you save.');
    switchTab('add');
    el.customerName.focus();
  }

  el.cancelEditBtn.addEventListener('click', () => { clearPreviewMarker(); resetForm(); switchTab('customers'); });

  el.geocodeBtn.addEventListener('click', async () => {
    const address = el.customerAddress.value.trim();
    if (!address) { setLocationStatus('Enter an address first.', true); return; }
    el.geocodeBtn.disabled = true;
    setLocationStatus('Looking up address...');
    try {
      const geo = await geocodeAddress(address);
      if (!geo) { setLocationStatus('Address not found. Check the spelling or pick the location on the map instead.', true); return; }
      el.customerLat.value = geo.lat;
      el.customerLng.value = geo.lng;
      setLocationStatus(`Found: ${geo.displayName}`);
      map.setView([geo.lat, geo.lng], 16);
      showPreviewMarker(geo.lat, geo.lng);
    } catch (err) {
      setLocationStatus('Lookup failed: ' + err.message, true);
    } finally {
      el.geocodeBtn.disabled = false;
    }
  });

  let previewMarker = null;
  let pickingLocation = false;
  function showPreviewMarker(lat, lng) {
    if (previewMarker) previewMarker.remove();
    previewMarker = L.marker([lat, lng], { icon: markerIcon('#ef4444', false), zIndexOffset: 1000 }).addTo(map);
  }
  function clearPreviewMarker() {
    if (previewMarker) { previewMarker.remove(); previewMarker = null; }
  }

  function startPicking() {
    pickingLocation = true;
    el.mapHint.classList.remove('hidden');
    map.getContainer().classList.add('picking');
    if (window.innerWidth < 800) el.sidebar.classList.add('collapsed');
  }
  function stopPicking() {
    pickingLocation = false;
    el.mapHint.classList.add('hidden');
    map.getContainer().classList.remove('picking');
  }
  el.pickOnMapBtn.addEventListener('click', startPicking);
  el.cancelPickBtn.addEventListener('click', stopPicking);

  map.on('click', async e => {
    if (!pickingLocation) return;
    stopPicking();
    el.customerLat.value = e.latlng.lat;
    el.customerLng.value = e.latlng.lng;
    showPreviewMarker(e.latlng.lat, e.latlng.lng);
    el.sidebar.classList.remove('collapsed');
    setLocationStatus('Location set from the map.');
    if (!el.customerAddress.value.trim()) {
      setLocationStatus('Location set. Looking up the address...');
      try {
        const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        if (addr) { el.customerAddress.value = addr; setLocationStatus('Location set. Address filled in from the map; edit it if needed.'); }
        else setLocationStatus('Location set. Please type the address.');
      } catch (_) {
        setLocationStatus('Location set. Please type the address.');
      }
    }
  });

  el.customerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = el.customerId.value;
    const data = {
      name: el.customerName.value.trim(),
      address: el.customerAddress.value.trim(),
      status: el.customerStatus.value,
      notes: el.customerNotes.value.trim(),
      lat: el.customerLat.value === '' ? null : parseFloat(el.customerLat.value),
      lng: el.customerLng.value === '' ? null : parseFloat(el.customerLng.value),
    };
    if (!data.name || !data.address) { toast('Name and address are required.', true); return; }

    const existing = id ? customers.find(c => c.id === id) : null;
    const addressChanged = existing && existing.address !== data.address;
    const needsLookup = data.lat == null || data.lng == null || (addressChanged && data.lat === existing.lat && data.lng === existing.lng);

    if (needsLookup) {
      setLocationStatus('Looking up address...');
      try {
        const geo = await geocodeAddress(data.address);
        if (geo) { data.lat = geo.lat; data.lng = geo.lng; }
        else if (data.lat == null) {
          toast('Address not found. Saved without a map location; edit it and use "Pick location on map".', true);
        }
      } catch (err) {
        toast('Address lookup failed. Saved without a map location.', true);
      }
    }

    const saved = existing
      ? await updateCustomer(id, data, `Updated "${data.name}"`)
      : await addCustomer(data, `Added "${data.name}"`);
    if (!saved) return; // error already shown; keep the form so nothing is lost
    clearPreviewMarker();
    resetForm();
    switchTab('customers');
    if (saved.lat != null) setTimeout(() => focusCustomer(saved.id), 50);
  });

  // ---------- Import / Export ----------
  el.exportJsonBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`sales-map-${stamp}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), customers }, null, 2), 'application/json');
  });

  el.exportCsvBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`sales-map-${stamp}.csv`, customersToCsv(customers), 'text/csv');
  });

  function mergeIncoming(incoming) {
    const toWrite = [];
    let added = 0, updated = 0;
    for (const c of incoming) {
      const match = customers.find(x => x.id === c.id || (c.osmId && x.osmId === c.osmId));
      if (!match) { toWrite.push(c); added++; }
      else if (new Date(c.updatedAt) >= new Date(match.updatedAt)) { toWrite.push({ ...match, ...c, id: match.id }); updated++; }
    }
    return { toWrite, added, updated };
  }

  el.importFile.addEventListener('change', async () => {
    const file = el.importFile.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.customers;
      if (!Array.isArray(list)) throw new Error('File does not contain a customer list');
      const { toWrite, added, updated } = mergeIncoming(list.map(sanitizeCustomer).filter(Boolean));
      await store.putMany(toWrite);
      toast(`Imported ${added} new and ${updated} updated customers`);
    } catch (err) {
      toast('Import failed: ' + err.message, true);
    } finally {
      el.importFile.value = '';
    }
  });

  // Offer to move customers saved on this device (before sharing was set up) into the shared list.
  function offerLocalUpload() {
    if (!store.shared) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem('salesmap.localUploadDismissed.v1') === '1'; } catch (_) {}
    const local = Storage.load();
    if (dismissed || !local.length) return;
    el.localBannerText.textContent = `${local.length} customer${local.length === 1 ? '' : 's'} saved on this device before sharing was set up.`;
    el.localBanner.classList.remove('hidden');
    el.uploadLocalBtn.addEventListener('click', async () => {
      const { toWrite, added, updated } = mergeIncoming(local);
      const ok = await withErrors(store.putMany(toWrite).then(() => true), `Uploaded ${added} new and ${updated} updated customers to the shared map`);
      if (ok) { Storage.save([]); el.localBanner.classList.add('hidden'); }
    });
    el.dismissLocalBtn.addEventListener('click', () => {
      try { localStorage.setItem('salesmap.localUploadDismissed.v1', '1'); } catch (_) {}
      el.localBanner.classList.add('hidden');
    });
  }

  // ---------- Tabs & sidebar ----------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
    el.sidebar.classList.remove('collapsed');
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  el.toggleSidebar.addEventListener('click', () => {
    el.sidebar.classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 250);
  });

  // ---------- Init ----------
  el.customerStatus.innerHTML = statusOptionsHtml(DEFAULT_STATUS);
  el.filterStatus.innerHTML = '<option value="">All statuses</option>' + STATUSES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');

  store = chooseStore();
  if (!store) return; // landing screen shown or redirecting

  let firstLoad = true;
  store.subscribe((list, err) => {
    customers = list;
    renderAll();
    if (err) { toast('Could not read the shared list: ' + (err.message || err.code || 'permission denied'), true); return; }
    if (firstLoad) {
      firstLoad = false;
      const located = customers.filter(c => c.lat != null && c.lng != null);
      if (!initialViewSet && located.length) {
        map.fitBounds(located.map(c => [c.lat, c.lng]), { padding: [40, 40], maxZoom: 14 });
        initialViewSet = true;
      }
      if (window.innerWidth < 800 && customers.length) el.sidebar.classList.add('collapsed');
      offerLocalUpload();
    }
  });

  store.onConnection(connected => {
    el.connection.classList.remove('hidden');
    el.connection.textContent = connected ? 'Live' : 'Offline';
    el.connection.title = connected ? 'Connected. Changes are shared instantly.' : 'No connection. Changes will sync when you are back online.';
    el.connection.classList.toggle('offline', !connected);
  });
})();
