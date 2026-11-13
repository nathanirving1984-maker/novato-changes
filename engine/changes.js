/* "What's changing in Novato": map + list of City of Novato planning projects.
   Data: window.NOVATO_PROJECTS (areas/novato/projects.js), window.NOVATO_PARCELS (areas/novato/parcels.js).
   Config: window.CHANGES_CONFIG = { hamiltonLink, form: { endpoint, subject, consent } } */
(function () {
  'use strict';
  var D = window.NOVATO_PROJECTS, PARCELS = window.NOVATO_PARCELS || {}, CFG = window.CHANGES_CONFIG || {};
  var CAT = {
    review:   { label: 'Under review', color: '#C26A00', order: 0 },
    approved: { label: 'Approved',     color: '#012169', order: 1 },
    wireless: { label: 'Cell sites',   color: '#6b7280', order: 2 }
  };
  // Hamilton 3D explorer coverage (matches areas/hamilton aerial extent)
  var HAM = { s: 38.0459, n: 38.0680, w: -122.5420, e: -122.5060 };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { if (!iso) return ''; var p = iso.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }

  // ---------- prepare projects ----------
  var projects = D.list.map(function (p) {
    var q = Object.assign({}, p);
    var cs = (p.apns || []).map(function (a) { return PARCELS[a] && PARCELS[a].c; }).filter(Boolean);
    if (p.pt) q.loc = p.pt;
    else if (cs.length) q.loc = [cs.reduce(function (s, c) { return s + c[0]; }, 0) / cs.length, cs.reduce(function (s, c) { return s + c[1]; }, 0) / cs.length];
    q.rings = [];
    (p.apns || []).forEach(function (a) { if (PARCELS[a]) q.rings = q.rings.concat(PARCELS[a].r); });
    q.hamilton = !!q.loc && q.loc[0] > HAM.s && q.loc[0] < HAM.n && q.loc[1] > HAM.w && q.loc[1] < HAM.e;
    q.search = [p.name, p.addr, p.kind, p.law, p.app, (p.facts || []).join(' '), p.summary, CAT[p.cat].label].join(' ').toLowerCase();
    return q;
  });
  projects.sort(function (a, b) {
    return CAT[a.cat].order - CAT[b.cat].order || (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name);
  });
  var byId = {}; projects.forEach(function (p) { byId[p.id] = p; });

  var homeLink = document.getElementById('home-link');
  if (homeLink && CFG.hubLink) { homeLink.href = CFG.hubLink; homeLink.hidden = false; }

  // ---------- stats ----------
  function sumUnits(cat) { return projects.filter(function (p) { return p.cat === cat; }).reduce(function (s, p) { return s + (p.units || 0); }, 0); }
  var nonWireless = projects.filter(function (p) { return p.cat !== 'wireless'; }).length;
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + nonWireless + '</b><span>building &amp; land-use projects</span></div>' +
    '<div class="stat"><b>' + sumUnits('review').toLocaleString() + '</b><span>homes proposed (under review)</span></div>' +
    '<div class="stat"><b>' + sumUnits('approved').toLocaleString() + '</b><span>homes in approved projects</span></div>';

  // ---------- map ----------
  var map = L.map('map', { zoomControl: true, scrollWheelZoom: true, maxZoom: 19 }).setView([38.095, -122.56], 13);
  L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 16, maxZoom: 19,
    attribution: 'Basemap: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>'
  }).addTo(map);

  var markers = {}, outlineLayer = L.layerGroup().addTo(map), selLayer = L.layerGroup().addTo(map);
  function radius(p) { return p.cat === 'wireless' ? 5 : Math.min(15, 7 + (p.units ? Math.sqrt(p.units) / 3 : 0)); }
  projects.forEach(function (p) {
    if (!p.loc) return;
    var m = L.circleMarker(p.loc, { radius: radius(p), color: '#fff', weight: 2, fillColor: CAT[p.cat].color, fillOpacity: .95 });
    m.bindTooltip(esc(p.name), { className: 'lbl', direction: 'top', offset: [0, -6] });
    m.on('click', function () { select(p.id, { fromMap: true }); });
    m.addTo(map); markers[p.id] = m;
    if (p.cat !== 'wireless') p.rings.forEach(function (r) {
      L.polygon(r, { color: CAT[p.cat].color, weight: 1.5, opacity: .7, fillOpacity: .08, interactive: false }).addTo(outlineLayer);
    });
  });
  function toggleOutlines() { if (map.getZoom() >= 15) { if (!map.hasLayer(outlineLayer)) map.addLayer(outlineLayer); } else map.removeLayer(outlineLayer); }
  map.on('zoomend', toggleOutlines); toggleOutlines();
  var all = projects.filter(function (p) { return p.loc; }).map(function (p) { return p.loc; });
  if (all.length) map.fitBounds(all, { padding: [30, 30] });

  var legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    var d = L.DomUtil.create('div', 'legend');
    d.innerHTML = Object.keys(CAT).map(function (k) { return '<div><i style="background:' + CAT[k].color + '"></i>' + CAT[k].label + '</div>'; }).join('') +
      '<div style="color:#5b6474">Bigger dot = more homes</div>';
    return d;
  };
  legend.addTo(map);
  if (CFG.hamiltonLink) {
    var ham = L.control({ position: 'topright' });
    ham.onAdd = function () {
      var d = L.DomUtil.create('div');
      d.innerHTML = '<a class="ham-link" href="' + esc(CFG.hamiltonLink) + '">Explore Hamilton in 3D <span>&rarr;</span></a>';
      L.DomEvent.disableClickPropagation(d);
      return d;
    };
    ham.addTo(map);
  }

  // ---------- filters + list ----------
  var state = { cat: 'all', q: '', sel: null };
  var chips = document.getElementById('chips'), qBox = document.getElementById('q');
  var chipDefs = [{ k: 'all', label: 'All' }].concat(Object.keys(CAT).map(function (k) { return { k: k, label: CAT[k].label, color: CAT[k].color }; }));
  chipDefs.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'chip' + (c.k === 'all' ? ' on' : ''); b.dataset.k = c.k; b.type = 'button';
    var n = c.k === 'all' ? projects.length : projects.filter(function (p) { return p.cat === c.k; }).length;
    b.innerHTML = (c.color ? '<span class="dot" style="background:' + c.color + '"></span>' : '') + esc(c.label) + ' <span class="n">' + n + '</span>';
    b.addEventListener('click', function () { state.cat = c.k; render(); });
    chips.insertBefore(b, qBox);
  });
  qBox.addEventListener('input', function () { state.q = qBox.value.trim().toLowerCase(); render(); });

  function miles(a, b) {
    var R = 3958.8, toR = Math.PI / 180, dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtMi(d) { return d < 0.1 ? 'under 0.1 mi' : d.toFixed(1) + ' mi'; }

  function visible(p) {
    if (state.near && (p.dist == null || p.dist > state.near.r)) return false;
    if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (state.q && state.q.split(/\s+/).some(function (w) { return p.search.indexOf(w) < 0; })) return false;
    return true;
  }

  function detailHtml(p) {
    var h = '';
    if (p.cat === 'wireless') {
      h += '<p>An application for a wireless (cell) facility. The city&rsquo;s page has the application, plans, photo simulations and any decisions.</p>';
    } else {
      if (p.summary) h += '<p>' + esc(p.summary) + '</p>';
      if (p.facts && p.facts.length) h += '<ul>' + p.facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
    }
    h += '<div class="status"><b>Status:</b> ' + (p.status ? esc(p.status) + (p.date ? ' <span style="color:#5b6474">(city update ' + fmtDate(p.date) + ')</span>' : '') : 'See the city page for the latest status.') + '</div>';
    var fine = [];
    if (p.app) fine.push('City application ' + esc(p.app));
    if (p.apns && p.apns.length) fine.push('APN ' + p.apns.map(esc).join(', '));
    if (p.approx) fine.push('Map location approximate');
    if (fine.length) h += '<div class="fine">' + fine.join(' &middot; ') + '</div>';
    h += '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener">City project page &amp; email alerts</a>';
    if (p.hamilton && CFG.hamiltonLink) h += '<a class="btn alt" href="' + esc(CFG.hamiltonLink) + '">See Hamilton in 3D</a>';
    h += '<a class="btn alt" href="#signup" data-go="signup">Monthly update</a>';
    return h;
  }

  var listEl = document.getElementById('list');
  function render() {
    chips.querySelectorAll('.chip').forEach(function (b) { b.classList.toggle('on', b.dataset.k === state.cat); });
    var vis = projects.filter(visible), html = '';
    if (state.near) vis.sort(function (a, b) { return a.dist - b.dist; });
    vis.forEach(function (p) {
      var tags = '<span class="tag ' + p.cat + '">' + CAT[p.cat].label + '</span>' +
        (p.law ? '<span class="tag law">' + esc(p.law) + '</span>' : '') +
        (p.hamilton ? '<span class="tag ham">Hamilton</span>' : '');
      var meta = (state.near ? '<span class="dist">' + fmtMi(p.dist) + ' away</span> &middot; ' : '') + esc(p.addr) + (p.kind ? ' &middot; ' + esc(p.kind) : '') + (p.units ? ' &middot; ' + p.units.toLocaleString() + ' homes' : '');
      html += '<div class="item' + (state.sel === p.id ? ' sel' : '') + '" role="listitem" data-id="' + p.id + '" tabindex="0">' +
        '<div class="top"><span class="dot" style="background:' + CAT[p.cat].color + '"></span><div><h3>' + esc(p.name) + '</h3>' +
        '<div class="meta">' + meta + '</div>' + tags + '</div></div>' +
        '<div class="detail">' + (state.sel === p.id ? detailHtml(p) : '') + '</div></div>';
    });
    if (!vis.length) html = '<div class="item" style="cursor:default"><div class="meta">' + (state.near ? 'Nothing on the city&rsquo;s list within ' + radiusLabel(state.near.r) + '. Try a bigger distance or tap &ldquo;All&rdquo;.' : 'No projects match. Try another word or tap &ldquo;All&rdquo;.') + '</div></div>';
    if (state.near) nearSummary();
    listEl.innerHTML = html;
    projects.forEach(function (p) {
      var m = markers[p.id]; if (!m) return;
      var show = visible(p);
      if (show && !map.hasLayer(m)) m.addTo(map); else if (!show && map.hasLayer(m)) map.removeLayer(m);
    });
  }

  listEl.addEventListener('click', function (ev) {
    var go = ev.target.closest('[data-go="signup"]');
    if (go) { ev.preventDefault(); document.getElementById('signup').scrollIntoView({ behavior: 'smooth' }); document.getElementById('s-email').focus({ preventScroll: true }); return; }
    if (ev.target.closest('a')) return;
    var it = ev.target.closest('.item[data-id]'); if (!it) return;
    select(state.sel === it.dataset.id ? null : it.dataset.id);
  });
  listEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var it = ev.target.closest('.item[data-id]'); if (!it || ev.target !== it) return;
    ev.preventDefault(); select(state.sel === it.dataset.id ? null : it.dataset.id);
  });

  function select(id, opt) {
    opt = opt || {};
    state.sel = id; selLayer.clearLayers();
    Object.keys(markers).forEach(function (k) { markers[k].setStyle({ color: '#fff', weight: 2 }); });
    if (id) {
      var p = byId[id];
      if (!visible(p)) {
        state.cat = 'all'; state.q = ''; qBox.value = '';
        if (state.near && !(p.dist <= state.near.r)) { state.near = null; nearLayer.clearLayers(); nearRes.hidden = true; }
      }
      if (markers[id]) { markers[id].setStyle({ color: '#B08D57', weight: 4 }); markers[id].bringToFront(); }
      p.rings.forEach(function (r) { L.polygon(r, { color: '#B08D57', weight: 3, fillColor: '#B08D57', fillOpacity: .18, interactive: false }).addTo(selLayer); });
      if (p.rings.length) map.flyToBounds(L.latLngBounds([].concat.apply([], p.rings)), { padding: [60, 60], maxZoom: 17, duration: .8 });
      else if (p.loc) map.flyTo(p.loc, 16, { duration: .8 });
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
    } else {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
    render();
    if (id) {
      var el = listEl.querySelector('.item[data-id="' + id + '"]');
      if (el && opt.fromMap) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ---------- "What's changing near you?" ----------
  // Address search: OpenStreetMap Nominatim, limited to the Novato area, run only when the visitor presses the button.
  // The address stays in this browser; it is not saved or sent to Nathan unless the visitor signs up (it pre-fills the neighborhood box).
  var nearForm = document.getElementById('near-form'), nearQ = document.getElementById('near-q'), nearMsg = document.getElementById('near-msg');
  var nearRes = document.getElementById('near-res'), nearSum = document.getElementById('near-sum'), nearLayer = L.layerGroup().addTo(map);
  var VIEWBOX = '-122.66,38.17,-122.47,38.02';
  function radiusLabel(r) { return r === 0.5 ? 'half a mile' : r + (r === 1 ? ' mile' : ' miles'); }
  function msg(t, bad) { nearMsg.textContent = t || ''; nearMsg.className = bad ? 'bad' : ''; }

  function nearSummary() {
    var inR = projects.filter(function (p) { return p.dist != null && p.dist <= state.near.r; });
    var b = inR.filter(function (p) { return p.cat !== 'wireless'; }), w = inR.length - b.length;
    var homes = b.reduce(function (s, p) { return s + (p.units || 0); }, 0);
    var nearest = b.slice().sort(function (x, y) { return x.dist - y.dist; })[0];
    var s = 'Within ' + radiusLabel(state.near.r) + ' of <b>' + esc(state.near.label) + '</b>: ';
    if (!inR.length) s += 'nothing on the city&rsquo;s current list.';
    else {
      s += '<b>' + b.length + '</b> building project' + (b.length === 1 ? '' : 's');
      if (homes) s += ' (' + homes.toLocaleString() + ' homes)';
      if (w) s += ' and <b>' + w + '</b> cell site' + (w === 1 ? '' : 's');
      s += '.';
      if (nearest) s += ' Closest: <a href="#' + nearest.id + '" data-near-go="' + nearest.id + '">' + esc(nearest.name) + '</a>, ' + fmtMi(nearest.dist) + '.';
    }
    nearSum.innerHTML = s;
  }

  function drawNear() {
    nearLayer.clearLayers();
    if (!state.near) return;
    var rm = state.near.r * 1609.34;
    L.circle(state.near.pt, { radius: rm, color: '#fff', weight: 6, opacity: .85, fill: false, interactive: false }).addTo(nearLayer);
    L.circle(state.near.pt, { radius: rm, color: '#B08D57', weight: 3, opacity: 1, dashArray: '10 7', fillColor: '#ffffff', fillOpacity: .12, interactive: false }).addTo(nearLayer);
    L.marker(state.near.pt, { icon: L.divIcon({ className: '', html: '<div class="home-pin">&#8962;</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), title: 'Your spot', keyboard: false }).addTo(nearLayer);
    map.flyToBounds(L.latLng(state.near.pt).toBounds(rm * 2), { padding: [12, 12], duration: .8 });
  }

  function setNear(pt, label) {
    projects.forEach(function (p) { p.dist = p.loc ? miles(pt, p.loc) : null; });
    state.near = { pt: pt, label: label, r: state.near ? state.near.r : 1 };
    state.cat = 'all'; state.q = ''; qBox.value = ''; state.sel = null; selLayer.clearLayers();
    nearRes.hidden = false; msg('');
    var hood = document.getElementById('s-hood'); if (hood && !hood.value) hood.value = label;
    drawNear(); render();
  }
  function clearNear() {
    state.near = null; nearLayer.clearLayers(); nearRes.hidden = true; msg(''); nearQ.value = '';
    projects.forEach(function (p) { p.dist = null; });
    render();
    var all = projects.filter(function (p) { return p.loc; }).map(function (p) { return p.loc; });
    map.flyToBounds(all, { padding: [30, 30], duration: .8 });
  }

  nearForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = nearQ.value.trim();
    if (q.length < 4) { msg('Type your street address, e.g. 1200 Grant Ave.', true); nearQ.focus(); return; }
    if (!/novato|9494[579]/i.test(q)) q += ', Novato, CA';
    msg('Finding your address…');
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&bounded=1&viewbox=' + VIEWBOX + '&q=' + encodeURIComponent(q);
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (res) {
      if (!res.length) { msg('Couldn’t find that address in Novato. Try just the number and street, or use your location.', true); return; }
      var a = res[0], parts = (a.display_name || '').split(', ');
      var label = /^\d/.test(parts[0]) && parts[1] ? parts[0] + ' ' + parts[1] : parts[0] || nearQ.value.trim();
      setNear([+a.lat, +a.lon], label);
    }).catch(function () { msg('Address search isn’t responding right now. Try again, or use your location.', true); });
  });

  document.getElementById('near-me').addEventListener('click', function () {
    if (!navigator.geolocation) { msg('Your browser can’t share location. Type your address instead.', true); return; }
    msg('Getting your location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var pt = [pos.coords.latitude, pos.coords.longitude];
      if (miles(pt, [38.095, -122.56]) > 8) { msg('You look to be outside Novato. Type a Novato address instead.', true); return; }
      setNear(pt, 'your location');
    }, function () { msg('Location wasn’t shared. Type your address instead.', true); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  document.getElementById('radius').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-r]'); if (!b || !state.near) return;
    state.near.r = +b.dataset.r;
    this.querySelectorAll('[data-r]').forEach(function (x) { x.classList.toggle('on', x === b); });
    drawNear(); render();
  });
  document.getElementById('near-clear').addEventListener('click', clearNear);
  nearSum.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-near-go]'); if (!a) return;
    ev.preventDefault(); select(a.dataset.nearGo, { fromMap: true });
  });

  render();
  // Address handed over from the hub page (same tab, sessionStorage only)
  try {
    var handed = sessionStorage.getItem('novatoNearQuery');
    if (handed) { sessionStorage.removeItem('novatoNearQuery'); nearQ.value = handed; setTimeout(function () { if (nearForm.requestSubmit) nearForm.requestSubmit(); else nearForm.dispatchEvent(new Event('submit', { cancelable: true })); }, 200); }
  } catch (e) {}
  var hash = decodeURIComponent((location.hash || '').slice(1));
  if (hash && byId[hash]) setTimeout(function () { select(hash, { fromMap: true }); }, 300);

  // ---------- monthly update signup ----------
  var F = CFG.form || {}, form = document.getElementById('signup-form'), err = document.getElementById('s-err'), btn = document.getElementById('s-btn');
  document.getElementById('s-consent').textContent = F.consent || '';
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); err.textContent = '';
    var name = form.name.value.trim(), email = form.email.value.trim(), hood = form.neighborhood.value.trim();
    if (!email) { err.textContent = 'Please enter your email.'; form.email.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'That email doesn’t look right.'; form.email.focus(); return; }
    if (!F.endpoint) { err.textContent = 'Signup is not set up yet.'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    var data = new FormData();
    data.append('name', name); data.append('email', email); data.append('neighborhood', hood);
    data.append('_subject', F.subject || 'Novato changes update signup');
    data.append('source', 'whats-changing-in-novato'); data.append('_gotcha', form._gotcha.value);
    fetch(F.endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      form.innerHTML = '<p class="ok">Thanks' + (name ? ', ' + esc(name.split(' ')[0]) : '') + '! You’re on the list for the monthly update.</p>';
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Sign me up';
      err.textContent = 'Something went wrong. Please try again, or email nathan.irving@cbrealty.com.';
    });
  });

  // ---------- footer ----------
  document.getElementById('foot').innerHTML =
    'Nathan Irving, REALTOR&reg; &middot; DRE# 02414117 &middot; Coldwell Banker Realty &middot; Equal Housing Opportunity &middot; ' +
    'Project information summarized from the <a href="' + esc(D.source) + '" target="_blank" rel="noopener">City of Novato Planning Division&rsquo;s Planning Projects pages</a>, last checked ' + fmtDate(D.checked) + '. ' +
    'Not affiliated with the City of Novato; the city&rsquo;s pages are the official source. Information deemed reliable but not guaranteed. ' +
    'Parcels: Marin County CDA/Assessor (not survey accurate) &middot; Basemap: USGS The National Map &middot; ' +
    'Address search: Nominatim, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (your address isn&rsquo;t saved).';

  window.__changes = { map: map, select: select, projects: projects, markers: markers };
})();
