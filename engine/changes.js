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

  function visible(p) {
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
    vis.forEach(function (p) {
      var tags = '<span class="tag ' + p.cat + '">' + CAT[p.cat].label + '</span>' +
        (p.law ? '<span class="tag law">' + esc(p.law) + '</span>' : '') +
        (p.hamilton ? '<span class="tag ham">Hamilton</span>' : '');
      var meta = esc(p.addr) + (p.kind ? ' &middot; ' + esc(p.kind) : '') + (p.units ? ' &middot; ' + p.units.toLocaleString() + ' homes' : '');
      html += '<div class="item' + (state.sel === p.id ? ' sel' : '') + '" role="listitem" data-id="' + p.id + '" tabindex="0">' +
        '<div class="top"><span class="dot" style="background:' + CAT[p.cat].color + '"></span><div><h3>' + esc(p.name) + '</h3>' +
        '<div class="meta">' + meta + '</div>' + tags + '</div></div>' +
        '<div class="detail">' + (state.sel === p.id ? detailHtml(p) : '') + '</div></div>';
    });
    if (!vis.length) html = '<div class="item" style="cursor:default"><div class="meta">No projects match. Try another word or tap &ldquo;All&rdquo;.</div></div>';
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
      if (!visible(p)) { state.cat = 'all'; state.q = ''; qBox.value = ''; }
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

  render();
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
    'Parcels: Marin County CDA/Assessor (not survey accurate) &middot; Basemap: USGS The National Map.';

  window.__changes = { map: map, select: select, projects: projects, markers: markers };
})();
