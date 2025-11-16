// client/src/App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

let L;
const loadLeaflet = async () => {
  if (L) return L;
  await import("leaflet/dist/leaflet.css");
  const mod = await import("leaflet");
  L = mod.default || mod;
  return L;
};

const API = "http://13.203.102.196:5000";


export default function App() {
  const [query, setQuery] = useState("Kolhapur");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [favs, setFavs] = useState([]);
  const [error, setError] = useState("");

  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // load favorites
  useEffect(() => {
    fetch(`${API}/api/favorites`).then(r => r.json()).then(setFavs).catch(()=>{});
  }, []);

  // suggestions debounce
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!query.trim()) return setSuggestions([]);
      try {
        const r = await fetch(`${API}/api/geocode?q=${encodeURIComponent(query)}`);
        setSuggestions(await r.json());
      } catch { setSuggestions([]); }
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  const fetchForecast = async (place) => {
    if (!place) return;
    setLoading(true); setError("");
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await fetch(`${API}/api/forecast?lat=${place.lat}&lon=${place.lon}&tz=${encodeURIComponent(tz)}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setSelected(place);
      setForecast(data);
      placeMarker(place);
    } catch (e) {
      setError(e.message || "Failed to load forecast");
    } finally { setLoading(false); }
  };

  // One-shot search (button or Enter)
  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError("");
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await fetch(`${API}/api/searchWeather?q=${encodeURIComponent(q)}&tz=${encodeURIComponent(tz)}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setSelected(data.place);
      setForecast(data.forecast);
      placeMarker(data.place);
    } catch (e) {
      setError(e.message || "Search failed");
    } finally { setLoading(false); }
  };

  // init leaflet map
  useEffect(() => {
    (async () => {
      const leaflet = await loadLeaflet();
      if (mapRef.current) return;
      const map = leaflet.map("map", { zoomControl: false, attributionControl: false })
        .setView([16.7049, 74.2433], 6);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      map.on("click", (e) => {
        const p = { name: `Lat ${e.latlng.lat.toFixed(3)}, Lon ${e.latlng.lng.toFixed(3)}`, lat: e.latlng.lat, lon: e.latlng.lng };
        fetchForecast(p);
      });
      mapRef.current = map;
    })();
  }, []);

  const placeMarker = async (place) => {
    const leaflet = await loadLeaflet();
    if (!mapRef.current) return;
    if (!markerRef.current) {
      markerRef.current = leaflet.marker([place.lat, place.lon]).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([place.lat, place.lon]);
    }
    mapRef.current.setView([place.lat, place.lon], 9, { animate: true });
  };

  const current = useMemo(() => forecast?.current, [forecast]);
  const daily = useMemo(() => {
    const d = forecast?.daily;
    if (!d) return [];
    return d.time.map((t, i) => ({
      date: t,
      tmax: d.temperature_2m_max[i],
      tmin: d.temperature_2m_min[i],
      precip: d.precipitation_sum[i],
      uv: d.uv_index_max?.[i],
      windmax: d.wind_speed_10m_max?.[i],
    }));
  }, [forecast]);

  const saveFavorite = async () => {
    if (!selected) return;
    const r = await fetch(`${API}/api/favorites`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selected),
    });
    const data = await r.json();
    if (data?._id) setFavs((p) => p.some(f=>f._id===data._id)?p:[data,...p]);
  };

  const prettyTemp = (t) => `${Math.round(t)}°C`;
  const prettyWind = (w) => `${Math.round(w)} km/h`;

  return (
    <div className="wrap">
      <nav className="nav">
        <div className="brand">Weather<span>OSM</span></div>

        <div className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Enter city/state and press Enter or Search"
          />
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s, i) => (
                <button key={i} className="suggestion" onClick={() => { setQuery(s.name); fetchForecast(s); }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="nav-actions">
          <button className="ghost" onClick={runSearch}>Search</button>
          <button className="ghost" disabled={!selected} onClick={saveFavorite}>★ Save</button>
        </div>
      </nav>

      <main className="grid">
        <section className="panel map">
          <div id="map" className="mapbox" />
          <div className="hint">Tip: Click on map, press Enter, or hit Search.</div>
        </section>

        <section className="panel now">
          <h3>Now</h3>
          {!selected && <div className="muted">Search a place to view weather.</div>}
          {loading && <div className="loader">Loading…</div>}
          {error && <div className="error">{error}</div>}

          {current && !loading && (
            <div className="cards">
              <div className="card kpi">
                <div className="kpi-big">{prettyTemp(current.temperature_2m)}</div>
                <div className="kpi-sub">Feels {prettyTemp(current.apparent_temperature)}</div>
              </div>
              <div className="card mini">
                <div className="label">Humidity</div><div className="value">{current.relative_humidity_2m}%</div>
              </div>
              <div className="card mini">
                <div className="label">Wind</div><div className="value">{prettyWind(current.wind_speed_10m)}</div>
              </div>
              <div className="card mini">
                <div className="label">Precip</div><div className="value">{current.precipitation ?? 0} mm</div>
              </div>
            </div>
          )}

          {daily.length > 0 && (
            <>
              <h4>7-Day Forecast</h4>
              <div className="days">
                {daily.map((d) => (
                  <div key={d.date} className="day">
                    <div className="d-date">
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    <div className="d-temps">
                      <span className="tmax">{prettyTemp(d.tmax)}</span>
                      <span className="tmin">{prettyTemp(d.tmin)}</span>
                    </div>
                    <div className="bar-wrap" title={`Precip ${d.precip} mm`}>
                      <div className="bar" style={{ height: Math.min(100, d.precip * 10) + "%" }} />
                    </div>
                    <div className="d-meta">
                      <span>UV {Math.round(d.uv ?? 0)}</span>
                      <span>Wind {prettyWind(d.windmax ?? 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel favs">
          <h3>Favorites</h3>
          <div className="fav-list">
            {favs.map((f) => (
              <div key={f._id} className="fav">
                <button
                  className="fav-name"
                  onClick={() => { setQuery(f.name); fetchForecast(f); }}>
                  {f.name}
                </button>
                <button
                  className="del"
                  onClick={async () => {
                    await fetch(`${API}/api/favorites/${f._id}`, { method: "DELETE" });
                    setFavs((p) => p.filter((x) => x._id !== f._id));
                  }}
                >✕</button>
              </div>
            ))}
            {favs.length === 0 && <div className="muted">No favorites yet.</div>}
          </div>
        </section>
      </main>

      <footer className="foot">
        Data: OpenStreetMap & Open-Meteo • DB: MongoDB Atlas
      </footer>
    </div>
  );
}
