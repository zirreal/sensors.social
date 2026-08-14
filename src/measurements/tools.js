import measurements from "./index";

/** Not offered as a map colour layer (computed in popup, legacy, or unused on map). */
const MAP_LAYER_EXCLUDE = new Set([
  "aqi",
  "noise",
  "airtemp",
  "airtempavg",
  "airtempmax",
  "airtempmin",
  "pm1",
  "rainfall",
  "sat10",
  "sat5",
  "soiltemp",
  "windang",
  "windspeed",
  "windspeedmax",
]);

/** All measurement ids that can be a map layer — keys from `measurements/`, one place. */
export function mapLayerUnitIds() {
  return Object.keys(measurements).filter((id) => !MAP_LAYER_EXCLUDE.has(id));
}

/** PM10 / PM25 first, then the rest in stable catalog order. */
export function sortMapLayerUnits(units) {
  const list = Array.isArray(units) ? units.map((u) => String(u).toLowerCase()) : [];
  const head = ["pm10", "pm25"].filter((u) => list.includes(u));
  const tail = list.filter((u) => !head.includes(u));
  return [...head, ...tail];
}

export function toFixed(num, dec = 4) {
  if (typeof num === "string" && num.startsWith("e.")) return num;
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return +n.toFixed(dec);
}
export function converterPpmToMgm3(v, molecularWeight) {
  return toFixed((v * molecularWeight) / 24.05526);
}
export const states = ["good", "attention", "danger", "neutral"];
export function getMeasurementByName(name) {
  return measurements[name] || measurements["pm10"];
}

/** Zone from the measurements table whose range contains `value`. */
export function findZoneForValue(measurement, value) {
  const zones = measurement?.zones;
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return (
    zones.find((z) => typeof z.valueMax === "number" && n <= z.valueMax) ||
    zones[zones.length - 1] ||
    null
  );
}

export function zoneLabelForLocale(zone, locale = "en") {
  if (!zone?.label) return "";
  if (typeof zone.label === "string") return zone.label;
  return zone.label[locale] || zone.label.en || "";
}
