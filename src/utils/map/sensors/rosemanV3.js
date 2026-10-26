import { settings } from "@config";
import { decodeSignedEnvelopeBatchToPoints } from "@/utils/proto/decodeEnvelope";
import { canonicalSensorId, sensorIdToHex, sensorIdToSs58 } from "@/utils/sensorId";
import { hasValidCoordinates } from "../../utils";

export function rosemanApiBase(url = settings.REMOTE_PROVIDER) {
  return String(url || "").replace(/\/?$/, "/");
}

export function unixToMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n < 1e12 ? Math.trunc(n * 1000) : Math.trunc(n);
}

/** v3 ranges are `[start, end)` in milliseconds. */
export function unixToExclusiveEndMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n < 1e12 ? Math.trunc(n + 1) * 1000 : Math.trunc(n) + 1;
}

export function v3SensorQueryId(sensorId) {
  return (
    sensorIdToSs58(sensorId) ||
    sensorIdToHex(sensorId) ||
    String(sensorId || "").trim()
  );
}

let rosemanV3MessagesSupported = true;
const ROSEMAN_V3_LATEST_MAX_MS = 24 * 60 * 60 * 1000;

export function rosemanV3Url(path, params, base = settings.REMOTE_PROVIDER) {
  const qs = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  return `${rosemanApiBase(base)}${path}?${qs}`;
}

/**
 * Binary `SignedEnvelopeBatch` from RoSeMAN.
 * @returns {{ points: object[], cursor: string }|null} null if aborted
 */
export async function fetchRosemanV3ProtobufPoints(path, params, signal = null, base) {
  if (!rosemanV3MessagesSupported) return { points: [], cursor: "" };
  try {
    if (signal?.aborted) return null;
    const res = await fetch(rosemanV3Url(path, params, base), {
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    if (res.status === 404) {
      rosemanV3MessagesSupported = false;
      return { points: [], cursor: "" };
    }
    if (!res.ok) return { points: [], cursor: "" };
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      points:
        buf.byteLength > 0
          ? decodeSignedEnvelopeBatchToPoints(buf, { requireGeo: false, verbose: false })
          : [],
      cursor: res.headers.get("X-Next-Cursor") || "",
    };
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) return null;
    return { points: [], cursor: "" };
  }
}

export async function fetchRosemanV3LatestPoints(start, end, signal = null, base) {
  const startMs = unixToMs(start);
  const endMs = unixToExclusiveEndMs(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return [];
  }

  const points = [];
  for (let chunkStart = startMs; chunkStart < endMs; chunkStart += ROSEMAN_V3_LATEST_MAX_MS) {
    const chunkEnd = Math.min(chunkStart + ROSEMAN_V3_LATEST_MAX_MS, endMs);
    if (chunkEnd <= chunkStart) break;
    const page = await fetchRosemanV3ProtobufPoints(
      "api/v3/messages/latest",
      { start: String(chunkStart), end: String(chunkEnd) },
      signal,
      base
    );
    if (page === null) return null;
    points.push(...page.points);
    if (!rosemanV3MessagesSupported) break;
  }
  return points;
}

export async function fetchRosemanV3SensorPoints(
  sensorId,
  start,
  end,
  signal = null,
  base
) {
  const sid = v3SensorQueryId(sensorId);
  if (!sid) return [];
  const startMs = unixToMs(start);
  const endMs = unixToExclusiveEndMs(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return [];

  const points = [];
  let cursor = "";
  for (let page = 0; page < 32; page++) {
    const params = new URLSearchParams({
      start: String(startMs),
      end: String(endMs),
      limit: "1000",
      sensor_id: sid,
    });
    if (cursor) params.set("cursor", cursor);
    const pageResult = await fetchRosemanV3ProtobufPoints(
      "api/v3/messages",
      params,
      signal,
      base
    );
    if (pageResult === null) return null;
    points.push(...pageResult.points);
    cursor = pageResult.cursor;
    if (!cursor) break;
  }
  return points;
}

export async function fetchRosemanV3MaxPoints(type, start, end, signal = null, base) {
  const unit = String(type || "").toLowerCase();
  if (!unit) return [];
  const startMs = unixToMs(start);
  const endMs = unixToExclusiveEndMs(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return [];

  const page = await fetchRosemanV3ProtobufPoints(
    "api/v3/messages/max",
    { type: unit, start: String(startMs), end: String(endMs) },
    signal,
    base
  );
  if (page === null) return null;
  return page.points;
}

export function protoPointsToHistory(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points
    .map((point) => {
      const ts = Number(point?.timestamp);
      if (!Number.isFinite(ts) || !point?.data || typeof point.data !== "object") return null;
      const entry = { timestamp: ts, data: point.data, proto: true };
      if (point.device_model) entry.device_model = point.device_model;
      if (point.owner) entry.owner = point.owner;
      if (
        point.geo &&
        Number.isFinite(Number(point.geo.lat)) &&
        Number.isFinite(Number(point.geo.lng))
      ) {
        entry.geo = point.geo;
      }
      if (Array.isArray(point.protoPrivate) && point.protoPrivate.length > 0) {
        entry.protoPrivate = point.protoPrivate;
      }
      return entry;
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function protoPointsToMaxValues(points, type) {
  const unit = String(type || "").toLowerCase();
  const values = {};
  if (!unit || !Array.isArray(points)) return values;

  for (const point of points) {
    const n = Number(point?.data?.[unit]);
    if (!Number.isFinite(n)) continue;
    const entry = {
      model: point.model || 2,
      geo: point.geo || null,
      timestamp: point.timestamp || null,
      value: n,
    };
    const sid = canonicalSensorId(point.sensor_id);
    const hex = sensorIdToHex(point.sensor_id);
    if (sid) values[sid] = entry;
    if (hex) values[hex] = entry;
  }
  return values;
}

function geoGroupKey(geo) {
  return `${Number(geo.lat).toFixed(6)},${Number(geo.lng).toFixed(6)}`;
}

/**
 * Latest proto envelopes are one row per device. Urban+Insight kits share GPS,
 * so group exact coordinates and keep an Urban representative (same as v2 markers).
 */
export function markerRecordsFromLatestPoints(points) {
  const groups = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    if (!point?.sensor_id || !hasValidCoordinates(point.geo)) continue;
    const key = geoGroupKey(point.geo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }

  const rows = [];
  for (const group of groups.values()) {
    const ranked = group.map((point) => ({
      point,
      isInsight: String(point.device_model || "").toLowerCase() === "insight",
      ts: Number(point.timestamp || 0),
    }));
    const urban = ranked.filter((row) => !row.isInsight);
    const pool = urban.length > 0 ? urban : ranked;
    pool.sort((a, b) => b.ts - a.ts);
    const best = pool[0]?.point;
    if (!best) continue;
    const bestId = canonicalSensorId(best.sensor_id);
    const siblings = group
      .map((point) => ({
        sensor_id: canonicalSensorId(point.sensor_id),
        device_model: point.device_model || null,
      }))
      .filter((entry) => entry.sensor_id && entry.sensor_id !== bestId);

    rows.push({
      sensor_id: bestId,
      model: best.model || 2,
      geo: { lat: Number(best.geo.lat), lng: Number(best.geo.lng) },
      donated_by: "",
      owner: String(best.owner || "").trim() || null,
      device_model: best.device_model || null,
      timestamp: best.timestamp || null,
      proto: true,
      sensors: siblings.length > 0 ? siblings : null,
    });
  }
  return rows;
}
