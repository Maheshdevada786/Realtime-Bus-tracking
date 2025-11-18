// assets/home.js
// Complete upgraded JS with: OSM, geocoding fix, routing, custom bus icon, animation, GPS support

/* ------------------ YEAR ------------------ */
const yearSpan = document.getElementById("year");
if (yearSpan) yearSpan.textContent = new Date().getFullYear();

/* ------------------ PROFILE LOAD ------------------ */
const profileNameEl = document.getElementById("profileName");
const profilePicEl = document.getElementById("profilePic");
const storedName = localStorage.getItem("mb_username") || "Guest User";
profileNameEl.textContent = storedName;

const storedPic = localStorage.getItem("mb_userpic");
if (storedPic) profilePicEl.src = storedPic;

/* ------------------ MAP INIT (OSM TILE IMPORT) ------------------ */
const map = L.map("map", { zoomControl: true }).setView([22.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

/* ------------------ CUSTOM BUS MARKER ------------------ */
const busIcon = L.icon({
  iconUrl: "../assets/images/bus-stop.png", // <-- Ensure you add this icon
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/* ------------------ VARIABLES ------------------ */
let routeLine = null;
let movingMarker = null;
let routeCoords = [];

/* ------------------ GEOCODING (FIXED URL!) ------------------ */
async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });

  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data || data.length === 0) return null;

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: data[0].display_name,
  };
}

/* ------------------ ROUTING USING OSRM (REAL ROADS) ------------------ */
async function getRoute(lat1, lon1, lat2, lon2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.code !== "Ok") return null;

  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
}

/* ------------------ SMOOTH BUS ANIMATION ------------------ */
function animateRoute(coords) {
  if (!coords || coords.length < 2) return;

  if (movingMarker) map.removeLayer(movingMarker);

  movingMarker = L.marker(coords[0], { icon: busIcon }).addTo(map);

  let i = 0;

  function move() {
    if (i >= coords.length - 1) {
      i = 0; // loop forever
    }

    const start = coords[i];
    const end = coords[i + 1];

    const steps = 80;
    let step = 0;

    const latStep = (end[0] - start[0]) / steps;
    const lonStep = (end[1] - start[1]) / steps;

    const interval = setInterval(() => {
      step++;
      movingMarker.setLatLng([
        start[0] + latStep * step,
        start[1] + lonStep * step,
      ]);

      if (step >= steps) {
        clearInterval(interval);
        i++;
        move();
      }
    }, 50);
  }

  move();
}

/* ------------------ SEARCH ACTION ------------------ */
document.getElementById("searchBtn").addEventListener("click", async () => {
  const startQ = document.getElementById("startInput").value.trim();
  const destQ = document.getElementById("destInput").value.trim();

  if (!startQ || !destQ) {
    alert("Enter starting place and destination.");
    return;
  }

  try {
    document.getElementById("searchBtn").textContent = "Searching...";

    const [sres, dres] = await Promise.all([geocode(startQ), geocode(destQ)]);
    if (!sres || !dres) {
      alert("Could not find one or both places.");
      return;
    }

    // Fit map area
    map.fitBounds([[sres.lat, sres.lon], [dres.lat, dres.lon]], { padding: [50, 50] });

    L.marker([sres.lat, sres.lon]).addTo(map)
      .bindPopup("<b>Start</b><br>" + sres.display_name)
      .openPopup();

    L.marker([dres.lat, dres.lon]).addTo(map)
      .bindPopup("<b>Destination</b><br>" + dres.display_name);

    // Get real road route
    const coords = await getRoute(sres.lat, sres.lon, dres.lat, dres.lon);

    if (!coords) {
      alert("No road route found.");
      return;
    }

    if (routeLine) map.removeLayer(routeLine);

    routeLine = L.polyline(coords, {
      color: "#00a3ff",
      weight: 5,
      opacity: 0.9,
    }).addTo(map);

    animateRoute(coords);

  } catch (err) {
    alert("Search error: " + err.message);
  } finally {
    document.getElementById("searchBtn").textContent = "Search";
  }
});

/* ------------------ CLEAR BUTTON ------------------ */
document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("startInput").value = "";
  document.getElementById("destInput").value = "";

  if (routeLine) map.removeLayer(routeLine);
  if (movingMarker) map.removeLayer(movingMarker);

  map.setView([22.5937, 78.9629], 5);
});

/* ------------------ USER GPS LOCATION (NEW) ------------------ */
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
        radius: 8,
        color: "red",
        fillColor: "red",
        fillOpacity: 1,
      }).addTo(map).bindPopup("You are here");
    },
    () => console.log("Location not allowed")
  );
}

/* ------------------ SLIDESHOW ------------------ */
const slides = document.querySelectorAll("#slideshow img");
let idx = 0;

function showSlide(i) {
  slides.forEach((s, n) => s.classList.toggle("active", n === i));
}

showSlide(0);
setInterval(() => {
  idx = (idx + 1) % slides.length;
  showSlide(idx);
}, 3700);

/* ------------------ PAGE NAVIGATION BUTTONS ------------------ */
document.getElementById("getStarted").addEventListener("click", () => {
  window.scrollTo({
    top: document.querySelector(".explore").offsetTop - 20,
    behavior: "smooth",
  });
});

/* ------------------ EDIT PROFILE ------------------ */
document.getElementById("profilePic").addEventListener("click", () => {
  const name = prompt("Enter display name:", profileNameEl.textContent);
  if (name) {
    localStorage.setItem("mb_username", name);
    profileNameEl.textContent = name;
  }

  const pic = prompt("Enter profile picture URL:");
  if (pic) {
    localStorage.setItem("mb_userpic", pic);
    profilePicEl.src = pic;
  }
});
