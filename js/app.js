/* Sales Map – main application logic */
(function () {
  'use strict';

  // ---------- State ----------
  let customers = Storage.load();
  let searchResults = [];
  let pickingLocation = false;
  const customerMarkers = new Map(); // customer id -> Leaflet marker
  const resultMarkers = new Map();   // osmId -> Leaflet marker
  const MAP_VIEW_KEY = 'salesmap.view.v1';

  // ---------- DOM helpers ----------
  const $ = id => document.getElementById(id);
  const el = {
    sidebar: $('sidebar'), toggleSidebar: $('toggleSidebar'),
    customerCount: $('customerCount'),
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

  // ---------- Map ----------
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const customerLayer = L.layerGroup().addTo(map);
  const resultLayer = L.layerGroup().addTo(map);

  function restoreView() {
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_VIEW_KEY));
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Number.isFinite(saved.zoom)) {
        map.setView([saved.lat, saved.lng], saved.zoom);
        return;
      }
    } catch (_) { /* ignore */ }
    const located = customers.filter(c => c.lat != null && c.lng != null);
    if (located.length) {
      map.fitBounds(located.map(c => [c.lat, c.lng]), { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView([39.8283, -98.5795], 4); // continental US
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
          () => {}, { timeout: 5000 }
        );
      }
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

  function customerPopupHtml(c) {
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

  function renderCustomerMarkers() {
    customerLayer.clearLayers();
    customerMarkers.clear();
    for (const c of customers) {
      if (c.lat == null || c.lng == null) continue;
      const marker = L.marker([c.lat, c.lng], { icon: markerIcon(getStatus(c.status).color, false), title: c.name });
      marker.bindPopup(() => customerPopupHtml(c), { minWidth: 220 });
      marker.addTo(customerLayer);
      customerMarkers.set(c.id, marker);
    }
  }

  // Popup interactions (event delegation on the map container)
  map.on('popupopen', e => {
    const root = e.popup.getElement();
    if (!root) return;
    const box = root.querySelector('.popup');
    if (!box) return;
    const id = box.dataset.id;
    const select = box.querySelector('.popup-status');
    if (select) {
      select.addEventListener('change', () => {
        updateCustomer(id, { status: select.value });
        select.style.borderLeftColor = getStatus(select.value).color;
        toast('Status updated');
      });
    }
    const editBtn = box.querySelector('.popup-edit');
    if (editBtn) editBtn.addEventListener('click', () => { map.closePopup(); startEdit(id); });
    const delBtn = box.querySelector('.popup-delete');
    if (delBtn) delBtn.addEventListener('click', () => { map.closePopup(); deleteCustomer(id); });
  });

  // ---------- Customer CRUD ----------
  function persist() {
    if (!Storage.save(customers)) toast('Could not save to this browser. Storage may be full or disabled.', true);
    renderAll();
  }

  function addCustomer(data) {
    const c = sanitizeCustomer({ ...data, id: generateId() });
    if (!c) return null;
    customers.push(c);
    persist();
    return c;
  }

  function updateCustomer(id, changes) {
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) return;
    customers[idx] = sanitizeCustomer({ ...customers[idx], ...changes, updatedAt: new Date().toISOString() });
    persist();
  }

  function deleteCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}" from your customer list?`)) return;
    customers = customers.filter(x => x.id !== id);
    persist();
    toast('Customer deleted');
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
    resultLayer.clearLayers();
    resultMarkers.clear();
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

    for (const r of searchResults) {
      if (findByOsmId(r.osmId)) continue; // already shown as a customer marker
      const marker = L.marker([r.lat, r.lng], { icon: markerIcon('#ffffff', true), title: r.name });
      marker.bindPopup(() => resultPopupHtml(r), { minWidth: 220 });
      marker.addTo(resultLayer);
      resultMarkers.set(r.osmId, marker);
    }
  }

  // Result popup interactions
  map.on('popupopen', e => {
    const root = e.popup.getElement();
    const box = root && root.querySelector('.popup[data-osm]');
    if (!box) return;
    const osmId = box.dataset.osm;
    const addBtn = box.querySelector('.result-add');
    if (addBtn) addBtn.addEventListener('click', () => {
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

  function addResultAsCustomer(osmId, status) {
    const r = searchResults.find(x => x.osmId === osmId);
    if (!r || findByOsmId(osmId)) return;
    const notes = [r.phone, r.website].filter(Boolean).join(' · ');
    const c = addCustomer({ name: r.name, address: r.address, status, notes, lat: r.lat, lng: r.lng, osmId });
    if (c) toast(`Added "${c.name}"`);
  }

  el.addAllBtn.addEventListener('click', () => {
    const fresh = searchResults.filter(r => !findByOsmId(r.osmId));
    if (!fresh.length) { toast('All results are already in your list.'); return; }
    if (!confirm(`Add ${fresh.length} businesses to your customer list as "Not a Customer"?`)) return;
    for (const r of fresh) {
      const notes = [r.phone, r.website].filter(Boolean).join(' · ');
      customers.push(sanitizeCustomer({ id: generateId(), name: r.name, address: r.address, status: DEFAULT_STATUS, notes, lat: r.lat, lng: r.lng, osmId: r.osmId }));
    }
    persist();
    toast(`Added ${fresh.length} businesses`);
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

  el.cancelEditBtn.addEventListener('click', () => { resetForm(); switchTab('customers'); });

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
          setLocationStatus('Address not found. Saved without a map location; use "Pick location on map" to place it.', true);
          toast('Address not found. Saved without a map location.', true);
        }
      } catch (err) {
        setLocationStatus('Address lookup failed. Saved without a map location.', true);
      }
    }

    let saved;
    if (existing) {
      updateCustomer(id, data);
      saved = customers.find(c => c.id === id);
      toast(`Updated "${saved.name}"`);
    } else {
      saved = addCustomer(data);
      toast(`Added "${saved.name}"`);
    }
    clearPreviewMarker();
    resetForm();
    switchTab('customers');
    if (saved && saved.lat != null) focusCustomer(saved.id);
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

  el.importFile.addEventListener('change', async () => {
    const file = el.importFile.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.customers;
      if (!Array.isArray(list)) throw new Error('File does not contain a customer list');
      const incoming = list.map(sanitizeCustomer).filter(Boolean);
      let added = 0, updated = 0;
      for (const c of incoming) {
        const idx = customers.findIndex(x => x.id === c.id || (c.osmId && x.osmId === c.osmId));
        if (idx === -1) { customers.push(c); added++; }
        else if (new Date(c.updatedAt) >= new Date(customers[idx].updatedAt)) { customers[idx] = { ...customers[idx], ...c, id: customers[idx].id }; updated++; }
      }
      persist();
      toast(`Imported ${added} new and ${updated} updated customers`);
    } catch (err) {
      toast('Import failed: ' + err.message, true);
    } finally {
      el.importFile.value = '';
    }
  });

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
  renderAll();
  if (window.innerWidth < 800 && customers.length) el.sidebar.classList.add('collapsed');
})();
