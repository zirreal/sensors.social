import { computed, toValue } from "vue";
import { useI18n } from "vue-i18n";
import measurements from "../measurements";
import { findZoneForValue, zoneLabelForLocale } from "../measurements/tools";
import { isEncryptedSensorValue } from "@/utils/sensorValueCrypto";
import { resolveSensorType } from "@/composables/sensorDeviceTypes";

const ZONE_SOURCE_ALIAS = { airtemp: "temperature" };

const DISPLAY_ORDER = [
  "pm25",
  "pm10",
  "co2",
  "temperature",
  "airtemp",
  "humidity",
  "noise",
  "noisemax",
  "noiseavg",
  "pressure",
  "gc",
];

const NOISE_KEYS = ["noisemax", "noiseavg", "noise"];

const DEMO_OUTDOOR_ORDER = [
  "temperature",
  "airtemp",
  "humidity",
  "noisemax",
  "noiseavg",
  "noise",
  "pm25",
  "pm10",
];
const DEMO_INDOOR_ORDER = ["co2", "temperature", "airtemp", "humidity"];

const DEMO_ICONS = {
  pm25: "fa-solid fa-leaf",
  pm10: "fa-solid fa-leaf",
  co2: "fa-solid fa-wind",
  temperature: "fa-solid fa-temperature-high",
  airtemp: "fa-solid fa-temperature-high",
  humidity: "fa-solid fa-droplet",
  noise: "fa-solid fa-volume-high",
  noisemax: "fa-solid fa-volume-high",
  noiseavg: "fa-solid fa-volume-high",
};

const DEMO_HINTS = {
  temperature: [
    { en: "Dress warmer", ru: "Оденьтесь теплее" },
    { en: "Stay warm", ru: "Согрейтесь" },
    { en: "A light layer", ru: "Легкая куртка" },
    { en: "All good", ru: "Всё в порядке" },
    { en: "Seek shade", ru: "Ищите тень" },
    { en: "Drink water", ru: "Пейте воду" },
  ],
  humidity: [
    { en: "Add moisture", ru: "Увлажните воздух" },
    { en: "A bit dry", ru: "Суховато" },
    { en: "All good", ru: "Всё в порядке" },
    { en: "Air the room", ru: "Проветрите" },
    { en: "Too muggy", ru: "Душновато" },
  ],
  noise: [
    { en: "Nice and quiet", ru: "Тихо и спокойно" },
    { en: "All good", ru: "Всё в порядке" },
    { en: "A bit noisy", ru: "Шумновато" },
    { en: "Too loud", ru: "Слишком громко" },
    { en: "Protect ears", ru: "Берегите слух" },
  ],
  pm25: [
    { en: "All good", ru: "Всё в порядке" },
    { en: "Limit time outside", ru: "Меньше на улице" },
    { en: "Stay indoors", ru: "Останьтесь внутри" },
    { en: "Close windows", ru: "Закройте окна" },
    { en: "Avoid going out", ru: "Не выходите" },
  ],
  co2: [
    { en: "Fresh air", ru: "Свежий воздух" },
    { en: "All good", ru: "Всё в порядке" },
    { en: "Air the room", ru: "Проветрите" },
    { en: "Open a window", ru: "Откройте окно" },
    { en: "Leave the room", ru: "Выйдите ненадолго" },
  ],
};

DEMO_HINTS.airtemp = DEMO_HINTS.temperature;
DEMO_HINTS.pm10 = DEMO_HINTS.pm25;
DEMO_HINTS.noisemax = DEMO_HINTS.noise;
DEMO_HINTS.noiseavg = DEMO_HINTS.noise;

function hintForLocale(key, zoneIndex, loc) {
  const list = DEMO_HINTS[key];
  if (!list?.length) return "";
  const row = list[Math.min(Math.max(zoneIndex, 0), list.length - 1)];
  return row?.[loc] || row?.en || "";
}

function zoneProgressPercent(measurement, value) {
  const zones = measurement?.zones;
  if (!Array.isArray(zones) || zones.length === 0) return 12;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  const caps = zones.map((z) => (typeof z.valueMax === "number" ? z.valueMax : null));
  let index = caps.findIndex((cap) => cap != null && n <= cap);
  if (index === -1) index = zones.length - 1;

  const prev = index === 0 ? null : caps[index - 1];
  const next = caps[index];
  const following = caps[index + 1];

  let start;
  if (prev != null) {
    start = prev;
  } else if (next != null) {
    const step = following != null ? Math.abs(following - next) : Math.abs(next);
    start = next - (step || Math.abs(next) || 1);
    if (n >= 0 && next >= 0) start = Math.min(0, start);
  } else {
    start = n;
  }

  const end =
    next != null ? next : start + Math.max(Math.abs(start) * 0.5, 12);
  const span = end - start || 1;
  const t = Math.min(1, Math.max(0, (n - start) / span));
  return Math.max(12, Math.round(((index + t) / zones.length) * 100));
}

function latestBag(log, point) {
  const logValue = toValue(log);
  if (Array.isArray(logValue)) {
    for (let i = logValue.length - 1; i >= 0; i -= 1) {
      const data = logValue[i]?.data;
      if (data && typeof data === "object") return data;
    }
  }
  const live = toValue(point)?.data;
  if (live && typeof live === "object") return live;
  return null;
}

function bagValue(bag, key) {
  if (!bag || typeof bag !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(bag, key)) return bag[key];
  const found = Object.keys(bag).find((k) => String(k).toLowerCase() === key);
  return found != null ? bag[found] : undefined;
}

function numericValue(raw) {
  if (raw == null || isEncryptedSensorValue(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatDisplayValue(measurement, value) {
  const calculated =
    typeof measurement?.calculate === "function" ? measurement.calculate(value) : value;
  const n = Number(calculated);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : 1;
  return n.toFixed(digits).replace(/\.0$/, "");
}

function sortByOrder(keys, order) {
  const rank = (key) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return [...keys].sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

function pickByOrder(items, order, limit = Infinity) {
  const picked = [];
  for (const key of order) {
    const item = items.find((row) => row.key === key);
    if (!item) continue;
    if (key === "airtemp" && items.some((row) => row.key === "temperature")) continue;
    if (NOISE_KEYS.includes(key) && picked.some((row) => NOISE_KEYS.includes(row.key))) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

function isIndoorContext(items, point, log) {
  const type = resolveSensorType(toValue(point), toValue(log));
  if (type === "insight") return true;
  const hasCo2 = items.some((row) => row.key === "co2");
  const hasPm = items.some((row) => row.key === "pm25" || row.key === "pm10");
  return hasCo2 && !hasPm;
}

function asAirQualityPart(item) {
  return {
    key: item.key,
    name: item.shortName || item.name,
    displayValue: item.displayValue,
    unit: item.unit,
    zoneLabel: item.zoneLabel,
    color: item.color,
    progress: item.progress,
    hint: item.hint,
  };
}

function mergePmAsAirQuality(items, airQualityName) {
  const pm25 = items.find((row) => row.key === "pm25");
  const pm10 = items.find((row) => row.key === "pm10");
  if (!pm25 && !pm10) return items;

  const others = items.filter((row) => row.key !== "pm25" && row.key !== "pm10");
  const sources = [pm25, pm10].filter(Boolean);
  const worst = sources.reduce((a, b) => (b.zoneIndex > a.zoneIndex ? b : a));
  const primary = pm25 || pm10;

  return [
    ...others,
    {
      key: primary.key,
      name: airQualityName,
      icon: DEMO_ICONS.pm25,
      zoneLabel: sources.map((row) => `${row.shortName || row.name} ${row.zoneLabel}`).join(" · "),
      color: worst.color,
      displayValue: primary.displayValue,
      unit: primary.unit,
      progress: worst.progress,
      hint: worst.hint,
      parts: sources.map(asAirQualityPart),
    },
  ];
}

export function useCurrentReadings(log, point) {
  const { t, locale } = useI18n();
  const localeCode = computed(() => localStorage.getItem("locale") || locale.value || "en");

  const items = computed(() => {
    const bag = latestBag(log, point);
    if (!bag) return [];

    const loc = localeCode.value;
    const hasTemperature = numericValue(bagValue(bag, "temperature")) != null;
    const rows = [];
    const uniqueKeys = [...new Set(Object.keys(bag).map((k) => String(k).toLowerCase()))];

    for (const key of sortByOrder(uniqueKeys, DISPLAY_ORDER)) {
      if (key === "airtemp" && hasTemperature) continue;

      const value = numericValue(bagValue(bag, key));
      if (value == null) continue;

      const sourceKey = ZONE_SOURCE_ALIAS[key] || key;
      const measurement = measurements[sourceKey];
      if (!measurement?.zones?.length) continue;

      const asNoise = NOISE_KEYS.includes(key);
      const zone = findZoneForValue(measurement, value);
      const zoneLabel = zoneLabelForLocale(zone, loc);
      if (!zoneLabel) continue;

      const noiseName = measurements.noise?.nameshort?.[loc] || measurements.noise?.label || key;
      const shortName =
        measurement?.nameshort?.[loc] || measurement?.label || key;
      const zoneIndex = Math.max(0, (measurement.zones || []).indexOf(zone));

      rows.push({
        key,
        name: asNoise ? noiseName : shortName,
        shortName,
        zoneLabel,
        zoneIndex,
        color: zone?.color || "var(--measure-nodata)",
        displayValue: formatDisplayValue(measurement, value),
        unit: measurement.unit || "",
        icon: DEMO_ICONS[key] || DEMO_ICONS[sourceKey] || "fa-solid fa-chart-simple",
        progress: zoneProgressPercent(measurement, value),
        hint: hintForLocale(sourceKey, zoneIndex, loc),
      });
    }

    return rows;
  });

  const indoor = computed(() => isIndoorContext(items.value, point, log));

  const demoItems = computed(() =>
    mergePmAsAirQuality(
      pickByOrder(items.value, indoor.value ? DEMO_INDOOR_ORDER : DEMO_OUTDOOR_ORDER),
      t("sensorpopup.air_quality")
    )
  );

  return { items, demoItems, indoor };
}
