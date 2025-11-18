// app.js — final top-aligned info panel version
// Expects local JSON files: bus_stops.json, bus_routes.json, bus_trips.json, bus_stop_times.json

const FILE_STOPS = 'bus_stops.json';
const FILE_ROUTES = 'bus_routes.json';
const FILE_TRIPS = 'bus_trips.json';
const FILE_STOP_TIMES = 'bus_stop_times.json';

// data containers
let stops = {};
let stopList = [];
let trips = {};
let stopTimesByTrip = {};
let routes = {};
let tripsByRoute = {};
let tripsPassingStop = {};

// DOM
const sourceInput = document.getElementById('sourceInput');
const destInput = document.getElementById('destInput');
const sourceSuggestions = document.getElementById('sourceSuggestions');
const destSuggestions = document.getElementById('destSuggestions');
const selectedSource = document.getElementById('selectedSource');
const selectedDest = document.getElementById('selectedDest');
const findTripsBtn = document.getElementById('findTripsBtn');
const routesInfo = document.getElementById('routesInfo');
const status = document.getElementById('status');

const simPanel = document.getElementById('simPanel');
const lineView = document.getElementById('lineView');
const routeTitle = document.getElementById('routeTitle');
const tripIdEl = document.getElementById('tripId');
const statusText = document.getElementById('statusText');

const infoRoute = document.getElementById('infoRoute');
const infoPrev = document.getElementById('infoPrev');
const infoNext = document.getElementById('infoNext');
const infoEta = document.getElementById('infoEta');

// simulation state (constant 8x)
let simState = {
  playing: false,
  interval: null,
  speed: 8,
  currentTrip: null,
  realStartDate: null,
  simTimeOffset: 0,
  pts: null,
  svgPositions: null,
  marker: null
};

// load JSONs on page load
window.addEventListener('load', () => {
  statusText.textContent = 'Loading dataset...';
  loadLocalJsonFiles().then(()=>{
    statusText.textContent = `Loaded ${Object.keys(stops).length} stops, ${Object.keys(routes).length} routes.`;
  }).catch(err=>{
    console.error(err);
    statusText.textContent = 'Error loading JSON files.';
  });
});

async function loadLocalJsonFiles(){
  stops = {}; stopList = []; trips = {}; stopTimesByTrip = {}; routes = {}; tripsByRoute = {}; tripsPassingStop = {};
  const results = await Promise.allSettled([
    fetch(FILE_STOPS).then(r => r.ok ? r.json() : Promise.reject(new Error(FILE_STOPS + ' not found'))),
    fetch(FILE_ROUTES).then(r => r.ok ? r.json() : Promise.reject(new Error(FILE_ROUTES + ' not found'))),
    fetch(FILE_TRIPS).then(r => r.ok ? r.json() : Promise.reject(new Error(FILE_TRIPS + ' not found'))),
    fetch(FILE_STOP_TIMES).then(r => r.ok ? r.json() : Promise.reject(new Error(FILE_STOP_TIMES + ' not found')))
  ]);
  for (const r of results) if (r.status === 'rejected') throw r.reason;
  const [stopsArr, routesArr, tripsArr, stopTimesArr] = results.map(r => r.value);

  stopsArr.forEach(s => {
    stops[s.stop_id] = { stop_id: s.stop_id, stop_name: s.stop_name || '', lat: parseFloat(s.stop_lat||0), lon: parseFloat(s.stop_lon||0) };
    stopList.push(stops[s.stop_id]);
    tripsPassingStop[s.stop_id] = { routes: new Set(), trips: new Set() };
  });

  routesArr.forEach(r => {
    routes[r.route_id] = { route_id: r.route_id, route_short_name: r.route_short_name, route_long_name: r.route_long_name };
    tripsByRoute[r.route_id] = [];
  });

  tripsArr.forEach(t => {
    trips[t.trip_id] = { trip_id: t.trip_id, route_id: t.route_id, service_id: t.service_id, trip_headsign: t.trip_headsign };
    if(!tripsByRoute[t.route_id]) tripsByRoute[t.route_id] = [];
    tripsByRoute[t.route_id].push(t.trip_id);
  });

  stopTimesArr.forEach(st => {
    const tid = st.trip_id;
    if(!stopTimesByTrip[tid]) stopTimesByTrip[tid] = [];
    const arr = parseGtfsTimeToSecs(st.arrival_time || st.departure_time);
    const dep = parseGtfsTimeToSecs(st.departure_time || st.arrival_time);
    stopTimesByTrip[tid].push({ stop_id: st.stop_id, arrival_secs: arr, departure_secs: dep, stop_sequence: Number(st.stop_sequence || 0) });
    if(trips[tid]){
      const rid = trips[tid].route_id;
      if(tripsPassingStop[st.stop_id]){
        tripsPassingStop[st.stop_id].routes.add(rid);
        tripsPassingStop[st.stop_id].trips.add(tid);
      }
    }
  });

  for(const tid in stopTimesByTrip) stopTimesByTrip[tid].sort((a,b)=> a.stop_sequence - b.stop_sequence);
  stopList.sort((a,b)=> a.stop_name.localeCompare(b.stop_name));

  wireSuggestions(sourceInput, sourceSuggestions, true);
  wireSuggestions(destInput, destSuggestions, false);
}

function parseGtfsTimeToSecs(ts){ if(!ts) return 0; const p = ts.split(':').map(x=>Number(x)); if(p.length<3) return 0; return p[0]*3600 + p[1]*60 + p[2]; }
function secsToHHMM(s){ const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

/* suggestions kept exactly (functionality unchanged) */
function wireSuggestions(inputEl, containerEl, isSource){
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    if(!q){ containerEl.classList.add('hidden'); return; }

    const matchedStops = stopList.filter(s => s.stop_name.toLowerCase().includes(q)).slice(0,60);

    const routeOrder = [];
    const routeSeen = new Set();
    for(const s of matchedStops){
      const info = tripsPassingStop[s.stop_id];
      if(!info) continue;
      for(const rid of info.routes){
        if(!routeSeen.has(rid)){
          routeSeen.add(rid);
          routeOrder.push({ route_id: rid, exampleStop: s.stop_id });
          if(routeOrder.length>=8) break;
        }
      }
      if(routeOrder.length>=8) break;
    }

    if(routeOrder.length===0){
      for(const rid in routes){
        const r = routes[rid];
        if((r.route_short_name && r.route_short_name.toLowerCase().includes(q)) || (r.route_long_name && r.route_long_name.toLowerCase().includes(q))){
          routeOrder.push({ route_id: rid, exampleStop: null });
          if(routeOrder.length>=6) break;
        }
      }
    }

    const frags = [];
    if(routeOrder.length){
      frags.push(`<div style="padding:6px;font-size:0.85rem;color:#cfeff0"><strong>Routes</strong></div>`);
      for(const rinfo of routeOrder){
        const rid = rinfo.route_id; const r = routes[rid]||{};
        const title = r.route_short_name || r.route_long_name || rid;
        const meta = rinfo.exampleStop ? `passes ${stops[rinfo.exampleStop].stop_name}` : 'route';
        frags.push(`<div class="suggestion" data-type="route" data-value="${rid}" data-example-stop="${rinfo.exampleStop||''}"><span class="type">[route]</span><span class="title">${title}</span><span class="meta">${meta}</span></div>`);
      }
    }

    if(matchedStops.length){
      frags.push(`<div style="padding:6px;font-size:0.85rem;color:#cfeff0"><strong>Stops</strong></div>`);
      matchedStops.slice(0,40).forEach(s=>{
        frags.push(`<div class="suggestion" data-type="stop" data-value="${s.stop_id}"><span class="type">[stop]</span><span class="title">${s.stop_name}</span><span class="meta">stop id ${s.stop_id}</span></div>`);
      });
    }

    if(frags.length===0){ containerEl.classList.add('hidden'); return; }
    containerEl.innerHTML = frags.join('');
    containerEl.classList.remove('hidden');

    Array.from(containerEl.getElementsByClassName('suggestion')).forEach(el=>{
      el.addEventListener('click', ()=>{
        const typ = el.dataset.type, val = el.dataset.value;
        if(typ === 'route'){
          const routeId = val; const r = routes[routeId]; const routeName = r.route_short_name || r.route_long_name || routeId;
          const exampleStop = el.dataset.exampleStop || null;
          inputEl.value = routeName;
          if(isSource){
            selectedSource.innerHTML = `<strong>Selected route:</strong> ${routeName}`;
            selectedSource.dataset.routeId = routeId;
            if(exampleStop){ selectedSource.dataset.stopId = exampleStop; selectedSource.innerHTML += `<div style="font-size:0.9rem;color:#cfeff0">Using stop: ${stops[exampleStop].stop_name}</div>`; } else delete selectedSource.dataset.stopId;
          } else {
            selectedDest.innerHTML = `<strong>Selected route:</strong> ${routeName}`;
            selectedDest.dataset.routeId = routeId;
            if(exampleStop){ selectedDest.dataset.stopId = exampleStop; selectedDest.innerHTML += `<div style="font-size:0.9rem;color:#cfeff0">Using stop: ${stops[exampleStop].stop_name}</div>`; } else delete selectedDest.dataset.stopId;
          }
          containerEl.classList.add('hidden');
          performSearch({ autoStart:true });
        } else {
          inputEl.value = stops[val].stop_name;
          if(isSource){ selectedSource.innerHTML = `<strong>Selected stop:</strong> ${stops[val].stop_name}`; selectedSource.dataset.stopId = val; } 
          else { selectedDest.innerHTML = `<strong>Selected stop:</strong> ${stops[val].stop_name}`; selectedDest.dataset.stopId = val; }
          containerEl.classList.add('hidden');
        }
      });
    });
  });

  document.addEventListener('click', e=>{
    if(!inputEl.contains(e.target) && !containerEl.contains(e.target)) containerEl.classList.add('hidden');
  });
}

// search
findTripsBtn.addEventListener('click', ()=> performSearch({}));

function performSearch(options = {}){
  const srcStopId = options.srcStopId || selectedSource.dataset.stopId || findStopIdByName(sourceInput.value);
  const srcRouteId = options.srcRouteId || selectedSource.dataset.routeId || null;
  const destStopId = options.destStopId || selectedDest.dataset.stopId || findStopIdByName(destInput.value);
  const destRouteId = options.destRouteId || selectedDest.dataset.routeId || null;
  const autoStart = options.autoStart || false;

  if(!srcStopId && !srcRouteId){ routesInfo.innerHTML = '<div>Please choose a valid source stop or route.</div>'; return; }

  let candidateTrips = [];
  if(srcStopId) candidateTrips = tripsPassingStop[srcStopId] ? Array.from(tripsPassingStop[srcStopId].trips) : [];
  else if(srcRouteId) candidateTrips = tripsByRoute[srcRouteId] ? Array.from(tripsByRoute[srcRouteId]) : [];

  if(srcRouteId) candidateTrips = candidateTrips.filter(tid => trips[tid] && trips[tid].route_id === srcRouteId);
  else if(destRouteId) candidateTrips = candidateTrips.filter(tid => trips[tid] && trips[tid].route_id === destRouteId);

  const matches = [];
  for(const tid of candidateTrips){
    const sts = stopTimesByTrip[tid];
    if(!sts) continue;
    let sIdx = -1, dIdx = -1;
    if(srcStopId){
      for(let i=0;i<sts.length;i++){ if(sts[i].stop_id === srcStopId) sIdx = i; if(destStopId && sts[i].stop_id === destStopId) dIdx = i; }
      if(sIdx >= 0 && (!destStopId || dIdx > sIdx)) matches.push({ trip_id: tid, route_id: trips[tid].route_id, srcIdx: sIdx, dstIdx: dIdx });
    } else {
      if(destStopId){ for(let i=0;i<sts.length;i++) if(sts[i].stop_id === destStopId) dIdx = i; if(dIdx >= 0) matches.push({ trip_id: tid, route_id: trips[tid].route_id, srcIdx: null, dstIdx: dIdx }); }
      else matches.push({ trip_id: tid, route_id: trips[tid].route_id });
    }
  }

  if(matches.length === 0){ routesInfo.innerHTML = '<div>No scheduled trips found.</div>'; return; }

  matches.sort((a,b)=>{
    const aIdx = a.srcIdx ?? 0; const bIdx = b.srcIdx ?? 0;
    const aDep = stopTimesByTrip[a.trip_id][aIdx].departure_secs;
    const bDep = stopTimesByTrip[b.trip_id][bIdx].departure_secs;
    return aDep - bDep;
  });

  const html = [`<div><strong>${matches.length}</strong> matching trips:</div>`];
  matches.slice(0,12).forEach(m=>{
    const r = routes[m.route_id] || {};
    const label = r.route_short_name || r.route_long_name || m.route_id;
    const idx = m.srcIdx ?? 0;
    const depSecs = stopTimesByTrip[m.trip_id][idx].departure_secs;
    html.push(`<div class="trip-row"><button class="selectTripBtn" data-trip="${m.trip_id}">Route ${label} — dep ${secsToHHMM(depSecs)}</button></div>`);
  });

  routesInfo.innerHTML = html.join('');
  Array.from(routesInfo.getElementsByClassName('selectTripBtn')).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      startTripSimulation(btn.dataset.trip);
      simState.playing = true;
      runSimulationLoop();
    });
  });

  if(autoStart){ const first = routesInfo.querySelector('.selectTripBtn'); if(first) setTimeout(()=> first.click(),150); }
}

function findStopIdByName(name){ if(!name) return null; name = name.trim().toLowerCase(); for(const id in stops) if(stops[id].stop_name.toLowerCase() === name) return id; for(const id in stops) if(stops[id].stop_name.toLowerCase().includes(name)) return id; return null; }

// start trip
function startTripSimulation(tripId){
  const trip = trips[tripId]; if(!trip){ alert('Trip not found'); return; }
  const sts = stopTimesByTrip[tripId]; if(!sts || sts.length < 2){ alert('Insufficient stop times for this trip'); return; }

  const pts = sts.map(s => ({ stop_id: s.stop_id, stop_name: stops[s.stop_id]?.stop_name || s.stop_id, arrival_secs: s.arrival_secs, departure_secs: s.departure_secs }));

  const now = new Date(); const nowSecs = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  simState.simTimeOffset = pts[0].departure_secs - nowSecs;
  simState.realStartDate = new Date();
  simState.pts = pts;
  simState.currentTrip = tripId;

  renderLinearTrack(pts);

  const r = routes[trip.route_id] || {};
  routeTitle.textContent = `${r.route_short_name || r.route_long_name || trip.route_id}`;
  tripIdEl.textContent = tripId;
  statusText.textContent = `Selected trip ${tripId} (${pts.length} stops).`;
  simPanel.classList.remove('hidden');

  // auto-start at constant speed
  simState.playing = true;
  runSimulationLoop();
}

// Render vertical track (left labels visible)
function renderLinearTrack(pts) {
  // clear
  lineView.innerHTML = "";

  // create holder and svg
  const holder = document.createElement("div");
  holder.className = "line-scroll-holder";
  lineView.appendChild(holder);

  const svgNS = "http://www.w3.org/2000/svg";
  const pxPerStop = 60;
  const paddingTop = 40;
  const paddingBottom = 40;

  const n = pts.length;
  const totalHeight = paddingTop + paddingBottom + (n - 1) * pxPerStop;

  const svgWidth = 260;
  const centerX = svgWidth - 60;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "track-vertical");
  svg.setAttribute("width", svgWidth);
  // explicitly set height attribute AND style.height so browser counts it
  svg.setAttribute("height", totalHeight);
  svg.style.height = totalHeight + "px";

  // main line
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", centerX);
  line.setAttribute("y1", paddingTop);
  line.setAttribute("x2", centerX);
  line.setAttribute("y2", totalHeight - paddingBottom);
  line.setAttribute("stroke", "#cfeff6");
  line.setAttribute("stroke-width", 8);
  svg.appendChild(line);

  const positions = [];
  for (let i = 0; i < n; i++) {
    const y = paddingTop + i * pxPerStop;
    positions.push(y);

    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", centerX);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", 6);
    dot.setAttribute("class", "tick-dot");
    svg.appendChild(dot);

    const txt = document.createElementNS(svgNS, "text");
    txt.setAttribute("x", centerX - 18);
    txt.setAttribute("y", y + 4);
    txt.setAttribute("class", "stop-label");
    // set text & title so long names are visible on hover
    const fullName = pts[i].stop_name || pts[i].stop_id || ("Stop " + i);
    txt.textContent = fullName;
    txt.setAttribute("title", fullName);
    svg.appendChild(txt);
  }

  const marker = document.createElementNS(svgNS, "circle");
  marker.setAttribute("cx", centerX);
  marker.setAttribute("cy", positions[0]);
  marker.setAttribute("r", 12);
  marker.setAttribute("class", "bus-marker");
  svg.appendChild(marker);

  holder.appendChild(svg);

  // Force layout so scrollHeight is computed now
  svg.getBoundingClientRect();
  holder.getBoundingClientRect();

  // store state references (use DOM query in sim loop, but keep refs too)
  simState.svg = svg;
  simState.marker = marker;
  simState.svgPositions = positions;

  // initial scroll — center first stop
  // use direct assignment to avoid smooth animation interfering with measurements
  setTimeout(() => {
    const desired = Math.max(0, positions[0] - holder.clientHeight / 2);
    const maxScroll = Math.max(0, holder.scrollHeight - holder.clientHeight);
    holder.scrollTop = Math.max(0, Math.min(desired, maxScroll));
  }, 30);

  // also expose holder for backward compatibility
  lineView._scrollHolder = holder;
}

// run sim loop (8x constant)
function runSimulationLoop() {
  if (simState.interval) clearInterval(simState.interval);

  const freqMs = 700;
  simState.interval = setInterval(() => {
    if (!simState.playing) return;
    if (!simState.pts || simState.pts.length === 0) return;

    const now = new Date();
    const nowSecsOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const elapsed = (now - simState.realStartDate) / 1000;
    const simulatedSecs = nowSecsOfDay + (simState.simTimeOffset || 0) + elapsed * simState.speed;

    const pts = simState.pts;
    let idx = 0;
    while (idx < pts.length - 1 && simulatedSecs >= (pts[idx + 1].arrival_secs || pts[idx + 1].departure_secs)) idx++;

    const t0 = pts[idx].departure_secs || pts[idx].arrival_secs || simulatedSecs;
    const t1 = (pts[idx + 1] && (pts[idx + 1].arrival_secs || pts[idx + 1].departure_secs)) || t0;
    const frac = (t1 > t0) ? Math.max(0, Math.min(1, (simulatedSecs - t0) / (t1 - t0))) : 0;

    const nextIdx = Math.min(idx + 1, pts.length - 1);
    const y0 = simState.svgPositions[idx];
    const y1 = simState.svgPositions[nextIdx];
    const y = y0 + (y1 - y0) * frac;

    // update marker position
    if (simState.marker) simState.marker.setAttribute("cy", y);

    // reliable DOM lookup of holder + svg each tick
    const holder = document.querySelector("#lineView .line-scroll-holder");
    const svg = simState.svg || document.querySelector("#lineView svg.track-vertical");

    if (holder && svg) {
      // ensure svg height equals totalHeight to keep scrollHeight valid
      // compute total height from positions if necessary
      if (simState.svgPositions && simState.svgPositions.length) {
        const lastPos = simState.svgPositions[simState.svgPositions.length - 1];
        const totalHeight = lastPos + 40 + 40; // paddingTop + paddingBottom used in render
        // only set if differs to avoid layout thrash
        if (!svg.style.height || svg.style.height !== (totalHeight + "px")) {
          svg.style.height = totalHeight + "px";
        }
      }

      // force layout read to ensure scrollHeight is up-to-date
      const _ = svg.getBoundingClientRect();

      const desired = y - holder.clientHeight / 2;
      const maxScroll = Math.max(0, holder.scrollHeight - holder.clientHeight);
      const clamped = Math.max(0, Math.min(desired, maxScroll));

      // use direct assignment (fast and reliable)
      holder.scrollTop = clamped;
    }

    // update info display
    updateEtaDisplay(simulatedSecs, idx);

    // detect end-of-trip
    const lastStopSecs = (pts[pts.length - 1].arrival_secs || pts[pts.length - 1].departure_secs) || simulatedSecs;
    if (simulatedSecs >= lastStopSecs + 30) {
      simState.playing = false;
      clearInterval(simState.interval);
      simState.interval = null;
      statusText.textContent = "Trip simulation finished.";
    }
  }, freqMs);
}


// update info panel (top-aligned)
function updateEtaDisplay(simSecs = null, idx = null){
  const pts = simState.pts; if(!pts || !pts.length) return;
  if(simSecs === null){ const now = new Date(); simSecs = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds() + (simState.simTimeOffset||0); }
  if(idx === null){
    idx = 0; while(idx < pts.length - 1 && simSecs >= (pts[idx+1].arrival_secs || pts[idx+1].departure_secs)) idx++;
  }

  const prevIdx = Math.max(0, idx);
  const nextIdx = Math.min(idx+1, pts.length-1);

  const prevStop = pts[prevIdx] ? pts[prevIdx].stop_name : '—';
  const nextStop = pts[nextIdx] ? pts[nextIdx].stop_name : '—';

  infoRoute.textContent = routeTitle.textContent || '—';
  infoPrev.textContent = prevStop;
  infoNext.textContent = nextStop;

  const tArr = (pts[nextIdx] && (pts[nextIdx].arrival_secs || pts[nextIdx].departure_secs)) || simSecs;
  const etaSecs = Math.max(0, tArr - simSecs);

  if(etaSecs <= 0) infoEta.textContent = 'Arriving';
  else { const m = Math.floor(etaSecs/60); const s = Math.floor(etaSecs%60); infoEta.textContent = `${m}m ${s}s`; }
}

function pad(n){ return String(n).padStart(2,'0'); }
