const base = "https://roseman.robonomics.network/";
const TZ = 7;
const center = { lat: 9.7159, lng: 100.0176 };

function dayBounds(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return {
    start: Math.floor(Date.UTC(y, m - 1, d, -TZ, 0, 0) / 1000),
    end: Math.floor(Date.UTC(y, m - 1, d, 23 - TZ, 59, 59) / 1000),
  };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geoKey(geo) {
  if (!geo) return null;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

const days = [];
for (let d = 1; d <= 18; d++) days.push(`2026-06-${String(d).padStart(2, "0")}`);

async function fetchMarkers(iso) {
  const { start, end } = dayBounds(iso);
  const r = await fetch(`${base}api/v2/sensor/markers/${start}/${end}`);
  const d = await r.json();
  return Array.isArray(d.result) ? d.result : [];
}

async function fetchV2(sensorId, start, end) {
  const r = await fetch(`${base}api/v2/sensor/${sensorId}/${start}/${end}`);
  if (!r.ok) return null;
  return (await r.json()).sensor || null;
}

function deviceTypeFromMarker(s) {
  return s.device_model || (s.model === 2 ? "urban" : s.model === 1 ? "diy" : String(s.model ?? ""));
}

function deviceTypeFromV2(sen, sensorId) {
  const entry = (sen?.sensors || []).find(
    (x) => String(x?.sensor_id || x?.id || x) === sensorId
  );
  if (entry?.device_model) return entry.device_model;
  return null;
}

// 1) discover all sensor ids in area across June 1-18 via markers
const discovered = new Set();
for (const iso of days) {
  const markers = await fetchMarkers(iso);
  for (const s of markers) {
    const lat = Number(s.geo?.lat ?? s.lat);
    const lng = Number(s.geo?.lng ?? s.lng);
    if (!Number.isFinite(lat) || haversine(center.lat, center.lng, lat, lng) > 20) continue;
    discovered.add(String(s.sensor_id));
  }
}

const report = [];

for (const sensorId of [...discovered].sort()) {
  const daily = [];
  for (const iso of days) {
    const { start, end } = dayBounds(iso);
    const markers = await fetchMarkers(iso);
    const marker = markers.find((s) => String(s.sensor_id) === sensorId);
    const sen = await fetchV2(sensorId, start, end);

    const markerGeo = marker?.geo || null;
    const pts = sen?.data?.[sensorId];
    let logGeo = null;
    if (Array.isArray(pts) && pts.length) {
      const last = pts[pts.length - 1];
      if (last?.geo) logGeo = last.geo;
      else if (Number.isFinite(last?.lat) && Number.isFinite(last?.lng)) {
        logGeo = { lat: last.lat, lng: last.lng };
      }
    }

    const geo = markerGeo || logGeo;
    daily.push({
      iso,
      onMap: Boolean(marker),
      owner: sen?.owner ?? marker?.owner ?? null,
      device_type: deviceTypeFromV2(sen, sensorId) || deviceTypeFromMarker(marker || {}) || null,
      geo,
      geoKey: geoKey(geo),
      logPts: Array.isArray(pts) ? pts.length : 0,
    });
  }

  const activeDays = daily.filter((d) => d.onMap || d.logPts > 0);
  if (activeDays.length === 0) continue;

  const owners = [...new Set(activeDays.map((d) => d.owner || "(null)"))];
  const types = [...new Set(activeDays.map((d) => d.device_type || "(null)"))];
  const geos = [...new Set(activeDays.map((d) => d.geoKey).filter(Boolean))];

  const ownerChanges = [];
  let prevOwner = undefined;
  for (const d of activeDays) {
    const o = d.owner || "(null)";
    if (prevOwner !== undefined && o !== prevOwner) ownerChanges.push({ date: d.iso, from: prevOwner, to: o });
    prevOwner = o;
  }

  const typeChanges = [];
  let prevType = undefined;
  for (const d of activeDays) {
    const t = d.device_type || "(null)";
    if (prevType !== undefined && t !== prevType) typeChanges.push({ date: d.iso, from: prevType, to: t });
    prevType = t;
  }

  const geoChanges = [];
  let prevGeo = undefined;
  for (const d of activeDays) {
    const g = d.geoKey || "(null)";
    if (prevGeo !== undefined && g !== prevGeo) geoChanges.push({ date: d.iso, from: prevGeo, to: g });
    prevGeo = g;
  }

  report.push({
    sensor_id: sensorId,
    first_seen: activeDays[0].iso,
    last_seen: activeDays[activeDays.length - 1].iso,
    active_days: activeDays.length,
    owner: owners.length === 1 ? owners[0] : owners,
    owner_changed: ownerChanges.length > 0,
    owner_changes: ownerChanges,
    device_type: types.length === 1 ? types[0] : types,
    device_type_changed: typeChanges.length > 0,
    device_type_changes: typeChanges,
    geo: geos.length === 1 ? geos[0] : geos,
    geo_changed: geoChanges.length > 0,
    geo_changes: geoChanges,
    on_map_days: daily.filter((d) => d.onMap).map((d) => d.iso),
    has_logs_days: daily.filter((d) => d.logPts > 0).map((d) => d.iso),
  });
}

console.log(JSON.stringify({ period: "2026-06-01..2026-06-18", sensors: report }, null, 2));
