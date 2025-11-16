// server/server.js
// npm i express mongoose axios cors dotenv
// Create .env in /server: MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority&appName=<app>"
// PORT=5000

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ---- MongoDB Atlas ----
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env (Atlas connection string)");
  process.exit(1);
}
mongoose
  .connect(MONGO_URI, { dbName: "weatherdash" })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((e) => {
    console.error("❌ Mongo connect error:", e.message);
    process.exit(1);
  });

const FavSchema = new mongoose.Schema(
  { name: String, lat: Number, lon: Number },
  { timestamps: true }
);
const Favorite = mongoose.model("Favorite", FavSchema);

// ---- Helpers ----
const UA = { "User-Agent": "MERN-Weather-Dashboard/1.0 (edu-demo)" };

// Geocode with OpenStreetMap
app.get("/api/geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q, format: "json", addressdetails: 1, limit: 5 },
      headers: UA,
    });
    res.json(
      data.map((r) => ({ name: r.display_name, lat: +r.lat, lon: +r.lon }))
    );
  } catch (e) {
    res.status(500).json({ error: "Geocoding failed" });
  }
});

// Forecast via Open-Meteo
app.get("/api/forecast", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const tz = req.query.tz || "auto";
    if (Number.isNaN(lat) || Number.isNaN(lon))
      return res.status(400).json({ error: "lat/lon required" });

    const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: lat,
        longitude: lon,
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,precipitation",
        hourly:
          "temperature_2m,precipitation,relative_humidity_2m,wind_speed_10m",
        daily:
          "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,wind_speed_10m_max",
        timezone: tz,
        forecast_days: 7,
      },
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Forecast failed" });
  }
});

// Convenience: one-shot search → first result → forecast
app.get("/api/searchWeather", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const tz = req.query.tz || "auto";
    if (!q) return res.status(400).json({ error: "q required" });

    const g = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q, format: "json", limit: 1 },
      headers: UA,
    });
    if (!g.data?.length) return res.status(404).json({ error: "Place not found" });

    const place = {
      name: g.data[0].display_name,
      lat: +g.data[0].lat,
      lon: +g.data[0].lon,
    };

    const f = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: place.lat,
        longitude: place.lon,
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,precipitation",
        daily:
          "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,wind_speed_10m_max",
        timezone: tz,
        forecast_days: 7,
      },
    });

    res.json({ place, forecast: f.data });
  } catch (e) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Favorites
app.get("/api/favorites", async (_req, res) => {
  const favs = await Favorite.find().sort({ createdAt: -1 }).lean();
  res.json(favs);
});
app.post("/api/favorites", async (req, res) => {
  try {
    const { name, lat, lon } = req.body || {};
    if (!name || typeof lat !== "number" || typeof lon !== "number")
      return res.status(400).json({ error: "name, lat, lon required" });
    const existing = await Favorite.findOne({ lat, lon });
    if (existing) return res.json(existing);
    const fav = await Favorite.create({ name, lat, lon });
    res.json(fav);
  } catch {
    res.status(500).json({ error: "Save failed" });
  }
});
app.delete("/api/favorites/:id", async (req, res) => {
  await Favorite.findByIdAndDelete(req.params.id).catch(() => {});
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 API running at http://localhost:${PORT}`)
);
import path from "path";
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});
