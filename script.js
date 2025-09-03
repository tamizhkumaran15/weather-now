const API_WEATHER = "https://api.open-meteo.com/v1/forecast";
const API_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const API_REVERSE = "https://geocoding-api.open-meteo.com/v1/reverse";

// DOM
const $ = (s) => document.querySelector(s);
const cityInput = $("#cityInput");
const searchBtn = $("#searchBtn");
const locateBtn = $("#locateBtn");
const refreshSelect = $("#refreshSelect");
const statusEl = $("#status");
const toastEl = $("#toast");

// Summary
const placeEl = $("#place");
const descrEl = $("#descr");
const tempBadge = $("#tempBadge");
const summaryIcon = $("#summaryIcon");

// Cards
const el = {
  temperature: $("#temperature"),
  pressure: $("#pressure"),
  realFeel: $("#realFeel"),
  humidity: $("#humidity"),
  sunTimes: $("#sunTimes"),
  rainWind: $("#rainWind"),
};

// Weather icon mapping
function iconFor(code) {
  if ([0, 1].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/sun--v1.png";
  if ([2, 3].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/partly-cloudy-day--v1.png";
  if ([45, 48].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/fog-day.png";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 66, 67].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/rain.png";
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/snow.png";
  if ([95, 96, 99].includes(code))
    return "https://img.icons8.com/ios-filled/100/00bfff/storm.png";
  return "https://img.icons8.com/ios-filled/100/00bfff/cloud.png";
}

const wxNames = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  61: "Rain",
  71: "Snow",
  95: "Thunderstorm",
};

// Helpers
function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
function fmtAMPM(iso, tz) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: tz || undefined,
  });
}
function setStatus(msg) {
  statusEl.textContent = msg;
}
function notify(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

let timer = null;
let currentLoc = { lat: null, lon: null, tz: "auto" };
let currentCity = null;

// API calls
async function geocodeCity(name) {
  const r = await fetch(
    `${API_GEOCODE}?name=${encodeURIComponent(name)}&count=1&language=en`
  );
  const d = await r.json();
  if (!d.results?.length) throw new Error("City not found");
  return d.results[0];
}
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(
      `${API_REVERSE}?latitude=${lat}&longitude=${lon}&language=en`
    );
    const d = await r.json();
    return d.results?.[0];
  } catch {
    return null;
  }
}
async function fetchWeather(lat, lon, tz = "auto") {
  const url = `${API_WEATHER}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,precipitation,wind_direction_10m,weather_code&daily=sunrise,sunset&timezone=${tz}`;
  const r = await fetch(url);
  return await r.json();
}

// UI update
function updateUI(data) {
  const { current, daily, timezone } = data;
  const code = current.weather_code;
  const label = wxNames[code] || "Weather";

  placeEl.textContent = currentCity || "Unknown location";
  descrEl.textContent = label;
  summaryIcon.src = iconFor(code);
  tempBadge.textContent = `${Math.round(current.temperature_2m)} °C`;

  el.temperature.textContent = `${Math.round(current.temperature_2m)} °C`;
  el.pressure.textContent = `${Math.round(current.pressure_msl)} hPa`;
  el.realFeel.textContent = `${Math.round(current.apparent_temperature)} °C`;
  el.humidity.textContent = `${Math.round(current.relative_humidity_2m)} %`;

  el.sunTimes.textContent = `${fmtAMPM(daily.sunrise[0], timezone)} / ${fmtAMPM(
    daily.sunset[0],
    timezone
  )}`;
  el.rainWind.textContent = `${(current.precipitation || 0).toFixed(
    1
  )} mm | ${degToCompass(current.wind_direction_10m || 0)}`;

  setStatus("LIVE");
}

// Auto refresh
function scheduleRefresh() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (currentLoc.lat && currentLoc.lon) {
      try {
        const data = await fetchWeather(
          currentLoc.lat,
          currentLoc.lon,
          currentLoc.tz
        );
        updateUI(data);
      } catch {
        setStatus("Error");
      }
    }
  }, parseInt(refreshSelect.value, 10));
}

// Actions
async function searchCity() {
  const name = cityInput.value.trim();
  if (!name) return notify("Enter a city name");
  try {
    setStatus("Loading...");
    const res = await geocodeCity(name);
    currentLoc = { lat: res.latitude, lon: res.longitude, tz: res.timezone };
    currentCity = res.name;
    const data = await fetchWeather(res.latitude, res.longitude, res.timezone);
    updateUI(data);
    scheduleRefresh();
  } catch {
    setStatus("Idle");
    notify("City not found");
  }
}

async function locateMe() {
  if (!navigator.geolocation) return notify("Geolocation not supported");
  setStatus("Locating...");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const place = await reverseGeocode(latitude, longitude);
        currentLoc = {
          lat: latitude,
          lon: longitude,
          tz: place?.timezone || "auto",
        };
        // ✅ Use proper name from reverse geocode
        currentCity =
          place?.name || place?.admin1 || place?.country || "My Location";
        const data = await fetchWeather(latitude, longitude, currentLoc.tz);
        updateUI(data);
        scheduleRefresh();
      } catch {
        setStatus("Idle");
        notify("Failed to locate weather");
      }
    },
    () => {
      setStatus("Idle");
      notify("Location denied");
    }
  );
}

// Bind events
searchBtn.onclick = searchCity;
locateBtn.onclick = locateMe;
refreshSelect.onchange = scheduleRefresh;
document.querySelectorAll(".chip").forEach(
  (btn) =>
    (btn.onclick = () => {
      cityInput.value = btn.dataset.city;
      searchCity();
    })
);
