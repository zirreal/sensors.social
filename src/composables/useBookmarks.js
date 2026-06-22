/**
 * Bookmarks — saved map points, not individual sensor devices (except DIY: sensor + geo).
 *
 * IndexedDB: `Sensors` → object store `bookmarks` (keyPath: `id`).
 * Schema: src/config/default/idb-schemas.json
 *
 * Current record:
 *   id       — stable key, `bp_<hash>` of point key (IndexedDB primary key)
 *   name     — user label
 *   owner    — owner address, null for DIY sensors (`donated_by` does not count)
 *   lat      — bookmark latitude (5 decimal places)
 *   lng      — bookmark longitude (5 decimal places)
 *   sensorId — sensor id (required for DIY identity; navigation hint for owned points)
 *
 * Point key:
 *   owned — `{owner}@{lat},{lng}`
 *   DIY   — `{sensorId}@{lat},{lng}`
 *
 * Legacy record (migrated on load when geo can be resolved):
 *   id, name — id was sensor_id; no owner / lat / lng
 */
import { ref, computed, watch, unref } from "vue";
import {
  IDBgettable,
  IDBworkflow,
  IDBdeleteByKey,
  notifyDBChange,
  watchDBChange,
} from "../utils/idb";
import { idbschemas } from "@config";
import {
  getOwnerSensorsWithData,
  hasSensorOwner,
  preloadSensorMeta,
  haversineKm,
  OWNER_GEO_CLUSTER_KM,
} from "@/utils/map/sensors/requests";
import { dayBoundsUnix, dayISO } from "@/utils/date";
import { hasValidCoordinates } from "@/utils/utils";
import { getMapContext } from "@/utils/map/map";

if (!idbschemas?.Sensors) {
  console.warn("Sensors database configuration not found. Bookmarks functionality disabled.");
}

const schema = idbschemas?.Sensors;
const DB_NAME = schema?.dbname;
const STORE = Object.keys(schema?.stores || {}).find((key) => key === "bookmarks") || null;

const GEO_DECIMALS = 5;

const idbBookmarks = ref([]);

function roundBookmarkCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(GEO_DECIMALS));
}

function bookmarkPointKeyFromPoint(point) {
  if (!point?.geo || !hasValidCoordinates(point.geo)) return null;
  const lat = roundBookmarkCoord(point.geo.lat);
  const lng = roundBookmarkCoord(point.geo.lng);
  if (lat == null || lng == null) return null;
  if (hasSensorOwner(point)) {
    return `${String(point.owner).trim()}@${lat},${lng}`;
  }
  const sensorId = String(point.sensor_id || "").trim();
  if (!sensorId) return null;
  return `${sensorId}@${lat},${lng}`;
}

function bookmarkPointKeyFromRecord(bookmark) {
  if (bookmark?.lat == null || bookmark?.lng == null) return null;
  const lat = roundBookmarkCoord(bookmark.lat);
  const lng = roundBookmarkCoord(bookmark.lng);
  if (lat == null || lng == null) return null;
  const owner = bookmark.owner ? String(bookmark.owner).trim() : "";
  if (owner) return `${owner}@${lat},${lng}`;
  const sensorId = String(bookmark.sensorId || "").trim();
  if (!sensorId) return null;
  return `${sensorId}@${lat},${lng}`;
}

function bookmarkRecordId(pointKey) {
  let h = 2166136261;
  for (let i = 0; i < pointKey.length; i++) {
    h ^= pointKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `bp_${(h >>> 0).toString(16)}`;
}

function bookmarkRecordFromPoint(point, name) {
  const pointKey = bookmarkPointKeyFromPoint(point);
  if (!pointKey) return null;
  const owner = hasSensorOwner(point) ? String(point.owner).trim() : null;
  return {
    id: bookmarkRecordId(pointKey),
    name,
    owner,
    lat: roundBookmarkCoord(point.geo.lat),
    lng: roundBookmarkCoord(point.geo.lng),
    sensorId: String(point.sensor_id || ""),
  };
}

export function isLegacyBookmarkRecord(bookmark) {
  if (!bookmark?.id || bookmark.temp) return false;
  const lat = roundBookmarkCoord(bookmark.lat);
  const lng = roundBookmarkCoord(bookmark.lng);
  return lat == null || lng == null;
}

function bookmarkGeoMatchesPoint(bookmark, point) {
  const fromPoint = bookmarkPointKeyFromPoint(point);
  const fromRecord = bookmarkPointKeyFromRecord(bookmark);
  if (fromPoint && fromRecord && fromPoint === fromRecord) return true;
  if (fromPoint && bookmark.id === bookmarkRecordId(fromPoint)) return true;

  const bookmarkLat = roundBookmarkCoord(bookmark.lat);
  const bookmarkLng = roundBookmarkCoord(bookmark.lng);
  if (bookmarkLat == null || bookmarkLng == null || !point?.geo || !hasValidCoordinates(point.geo)) {
    return false;
  }

  const bookmarkOwner = bookmark.owner ? String(bookmark.owner).trim() : "";
  const pointHasOwner = hasSensorOwner(point);
  const anchor = { lat: bookmarkLat, lng: bookmarkLng };

  if (bookmarkOwner && pointHasOwner) {
    if (bookmarkOwner !== String(point.owner).trim()) return false;
    return haversineKm(point.geo, anchor) <= OWNER_GEO_CLUSTER_KM;
  }

  // DIY: one marker per sensor — exact sensorId + rounded geo, no cluster radius.
  if (!bookmarkOwner && !pointHasOwner) {
    const bookmarkSensorId = String(bookmark.sensorId || "").trim();
    const pointSensorId = String(point.sensor_id || "").trim();
    if (!bookmarkSensorId || bookmarkSensorId !== pointSensorId) return false;
    return (
      roundBookmarkCoord(point.geo.lat) === bookmarkLat &&
      roundBookmarkCoord(point.geo.lng) === bookmarkLng
    );
  }

  return false;
}

function bookmarkMatchesPoint(bookmark, point) {
  if (!bookmark || bookmark.temp) return false;
  if (!isLegacyBookmarkRecord(bookmark)) {
    return bookmarkGeoMatchesPoint(bookmark, point);
  }
  if (point?.sensor_id) {
    return String(bookmark.id) === String(point.sensor_id);
  }
  return false;
}

export function findBookmarkForPoint(point) {
  if (!point) return null;
  return (idbBookmarks.value || []).find((bookmark) => bookmarkMatchesPoint(bookmark, point)) || null;
}

/** Whether the map point (owner + geo) is bookmarked. */
export function isPointBookmarked(point) {
  return Boolean(findBookmarkForPoint(point));
}

/** @deprecated Use isPointBookmarked(point) — kept for sensor_id-only call sites during transition. */
export function isSensorBookmarked(sensorId, point = null) {
  if (point) return isPointBookmarked(point);
  if (!sensorId) return false;
  const sid = String(sensorId);
  return (idbBookmarks.value || []).some(
    (bookmark) => !bookmark?.temp && String(bookmark.id) === sid
  );
}

function applyBookmarkHighlightToMarker(marker) {
  const data = marker?.options?.data;
  if (!data) return;

  const bookmarked = isPointBookmarked(data);
  if (data.isBookmarked !== bookmarked) {
    marker.options.data = { ...data, isBookmarked: bookmarked };
  }

  const icon = marker.getElement?.()?.querySelector?.(".sensor-icon");
  if (icon) {
    icon.classList.toggle("sensor-bookmarked", bookmarked);
  }
}

/** Re-apply bookmark highlight on all sensor markers (owner + geo, incl. owner clusters). */
export function refreshAllMarkerBookmarkHighlights() {
  let ctx;
  try {
    ctx = getMapContext();
  } catch {
    return;
  }

  const layer = ctx?.markersLayer;
  if (!layer) return;

  layer.eachLayer((marker) => {
    applyBookmarkHighlightToMarker(marker);
  });
}

async function refreshBookmarksList() {
  if (!schema || !DB_NAME || !STORE) {
    idbBookmarks.value = [];
    return;
  }

  try {
    idbBookmarks.value = (await IDBgettable(DB_NAME, STORE)).filter(
      (bookmark) => bookmark?.id && bookmark.id !== "init" && !bookmark.temp
    );
    refreshAllMarkerBookmarkHighlights();
  } catch (error) {
    console.error("Error loading bookmarks:", error);
    idbBookmarks.value = [];
  }
}

async function putBookmarkRecord(record) {
  await new Promise((resolve, reject) => {
    IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
      const request = store.put(record);
      request.addEventListener("error", (e) => reject(e));
      request.addEventListener("success", () => resolve());
    });
  });
}

/* =============================================================================
 * LEGACY MIGRATION — remove this block when all users migrated
 * ============================================================================= */

function geoFromIdbSensorEntry(entry, sensorId) {
  if (!entry?.data || typeof entry.data !== "object") return null;
  const sid = String(sensorId);
  const ownPoints = entry.data[sid];
  if (Array.isArray(ownPoints)) {
    for (let i = ownPoints.length - 1; i >= 0; i--) {
      const geo = ownPoints[i]?.geo;
      if (hasValidCoordinates(geo)) return geo;
    }
  }
  for (const day of Object.values(entry.data)) {
    if (!Array.isArray(day)) continue;
    for (const p of day) {
      if (hasValidCoordinates(p?.geo)) return p.geo;
    }
  }
  return null;
}

async function readSensorDataEntry(sensorId) {
  return new Promise((resolve) => {
    IDBworkflow("Sensors", "sensorData", "readonly", (store) => {
      const req = store.get(String(sensorId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });
}

/** Resolve owner + geo for a sensor_id bookmark (IDB cache, then today's API meta). */
async function resolveLegacyBookmarkPoint(sensorId) {
  const sid = String(sensorId || "");
  if (!sid) return null;

  const entry = await readSensorDataEntry(sid);
  let owner = String(entry?.owner || "").trim() || null;
  let geo = geoFromIdbSensorEntry(entry, sid);

  if (!hasValidCoordinates(geo)) {
    try {
      const bounds = dayBoundsUnix(dayISO());
      await preloadSensorMeta(sid, bounds.start, bounds.end);
    } catch {
      // keep trying IDB / bundle below
    }
    const fresh = await readSensorDataEntry(sid);
    if (!owner) owner = String(fresh?.owner || "").trim() || null;
    geo = geoFromIdbSensorEntry(fresh, sid) || geo;
  }

  if (!hasValidCoordinates(geo)) {
    const bundle = getOwnerSensorsWithData(sid);
    const self = bundle?.find((o) => String(o?.id || "") === sid);
    if (self?.geo && hasValidCoordinates(self.geo)) {
      geo = self.geo;
    }
  }

  if (!hasValidCoordinates(geo)) return null;
  return { sensor_id: sid, geo, owner };
}

/** Upgrade legacy sensor_id bookmarks to owner+geo point keys when geo can be resolved. */
async function migrateLegacyBookmarks() {
  if (!DB_NAME || !STORE) return;

  const list = (await IDBgettable(DB_NAME, STORE)).filter(
    (bookmark) => bookmark?.id && bookmark.id !== "init" && !bookmark.temp
  );
  const legacy = list.filter(isLegacyBookmarkRecord);
  if (!legacy.length) return;

  let changed = false;

  for (const bookmark of legacy) {
    const point = await resolveLegacyBookmarkPoint(bookmark.id);
    if (!point) continue;

    const record = bookmarkRecordFromPoint(point, bookmark.name || "");
    if (!record) continue;

    const duplicate = list.find((item) => item.id !== bookmark.id && item.id === record.id);

    await IDBdeleteByKey(DB_NAME, STORE, bookmark.id);
    changed = true;

    if (duplicate) {
      if (!duplicate.name?.trim() && bookmark.name?.trim()) {
        await putBookmarkRecord({ ...duplicate, name: bookmark.name.trim() });
      }
      continue;
    }

    await putBookmarkRecord(record);
    list.push(record);
  }

  if (changed) {
    notifyDBChange(DB_NAME, STORE);
  }
}

function bookmarkPointFromRecord(bookmark) {
  if (bookmark?.lat == null || bookmark?.lng == null) return null;
  return {
    sensor_id: bookmark.sensorId || "",
    geo: { lat: bookmark.lat, lng: bookmark.lng },
    owner: bookmark.owner || null,
  };
}

/** Re-key bookmarks when point key rules change (e.g. DIY `_@geo` → `sensorId@geo`). */
async function migrateBookmarkKeys() {
  if (!DB_NAME || !STORE) return;

  const list = (await IDBgettable(DB_NAME, STORE)).filter(
    (bookmark) => bookmark?.id && bookmark.id !== "init" && !bookmark.temp
  );
  let changed = false;

  for (const bookmark of list) {
    if (isLegacyBookmarkRecord(bookmark)) continue;

    const point = bookmarkPointFromRecord(bookmark);
    if (!point) continue;

    const record = bookmarkRecordFromPoint(point, bookmark.name || "");
    if (!record || record.id === bookmark.id) continue;

    const duplicate = list.find((item) => item.id !== bookmark.id && item.id === record.id);

    await IDBdeleteByKey(DB_NAME, STORE, bookmark.id);
    changed = true;

    if (duplicate) {
      if (!duplicate.name?.trim() && bookmark.name?.trim()) {
        await putBookmarkRecord({ ...duplicate, name: bookmark.name.trim() });
      }
      continue;
    }

    await putBookmarkRecord(record);
    const idx = list.findIndex((item) => item.id === bookmark.id);
    if (idx >= 0) list.splice(idx, 1);
    list.push(record);
  }

  if (changed) {
    notifyDBChange(DB_NAME, STORE);
  }
}

async function runBookmarkLegacyMigrations() {
  if (!DB_NAME || !STORE) return;
  await migrateLegacyBookmarks();
  await migrateBookmarkKeys();
}

/* ============================================================================= */

async function upsertPointBookmark(point, name) {
  if (!point || !DB_NAME || !STORE) return;

  const record = bookmarkRecordFromPoint(point, name);
  if (!record) return;

  const legacy = (idbBookmarks.value || []).find(
    (bookmark) =>
      isLegacyBookmarkRecord(bookmark) &&
      point?.sensor_id &&
      String(bookmark.id) === String(point.sensor_id)
  );
  if (legacy) {
    await IDBdeleteByKey(DB_NAME, STORE, legacy.id);
  }

  await new Promise((resolve, reject) => {
    IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
      const request = store.put(record);

      request.addEventListener("error", (e) => reject(e));
      request.addEventListener("success", () => resolve());
    });
  });

  notifyDBChange(DB_NAME, STORE);
  await refreshBookmarksList();
}

export async function removeBookmarkById(bookmarkId) {
  const id = bookmarkId ? String(bookmarkId) : null;
  if (!id || !DB_NAME || !STORE) return;

  await IDBdeleteByKey(DB_NAME, STORE, id);
  notifyDBChange(DB_NAME, STORE);
  await refreshBookmarksList();
}

export async function removePointBookmark(point) {
  const bookmark = findBookmarkForPoint(point);
  if (!bookmark) return;
  await removeBookmarkById(bookmark.id);
}

/** @deprecated alias */
export async function removeSensorBookmark(sensorIdOrBookmarkId) {
  await removeBookmarkById(sensorIdOrBookmarkId);
}

export function useBookmarks() {
  const idbBookmarkGet = async () => {
    if (!schema || !DB_NAME || !STORE) {
      return;
    }

    try {
      IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
        const initRecord = { id: "init", temp: true };
        store.put(initRecord);
        store.delete("init");
      });

      await runBookmarkLegacyMigrations();
      await refreshBookmarksList();
    } catch (error) {
      console.error("Error in idbBookmarkGet:", error);
      await refreshBookmarksList();
    }
  };

  const watchBookmarks = () => {
    if (!schema || !DB_NAME || !STORE) {
      return;
    }
    return watchDBChange(DB_NAME, STORE, () => idbBookmarkGet());
  };

  return {
    idbBookmarks,
    idbBookmarkGet,
    watchBookmarks,
  };
}

/**
 * UI state and CRUD for one map point bookmark (popup header, Bookmark widget).
 */
export function useSensorBookmark(pointSource, { defaultName = () => "" } = {}) {
  const isBookmarked = ref(false);
  const bookmarkName = ref("");
  const savedBookmarkName = ref("");
  const isEditing = ref(false);
  const isAdding = ref(false);

  const showBookmarkForm = computed(() => isAdding.value || isEditing.value);

  const resolvePoint = () => unref(pointSource);

  const resolveDefaultName = () => {
    const name = typeof defaultName === "function" ? defaultName() : defaultName;
    return name != null ? String(name).trim() : "";
  };

  function applyBookmarkState({ resetForm = false } = {}) {
    const point = resolvePoint();

    if (resetForm) {
      isEditing.value = false;
      isAdding.value = false;
    }

    if (!point?.sensor_id) {
      isBookmarked.value = false;
      bookmarkName.value = "";
      savedBookmarkName.value = "";
      isEditing.value = false;
      isAdding.value = false;
      return;
    }

    const bookmark = findBookmarkForPoint(point);
    if (bookmark) {
      isBookmarked.value = true;
      if (!isAdding.value && !isEditing.value) {
        bookmarkName.value = bookmark.name || "";
        savedBookmarkName.value = bookmark.name || "";
      }
      return;
    }

    isBookmarked.value = false;
    if (!isAdding.value && !isEditing.value) {
      bookmarkName.value = "";
      savedBookmarkName.value = "";
    }
  }

  function openAddForm() {
    if (isBookmarked.value) return;
    isAdding.value = true;
    bookmarkName.value = "";
  }

  function startEditing() {
    if (!isBookmarked.value) return;
    savedBookmarkName.value = bookmarkName.value;
    isEditing.value = true;
  }

  function cancelForm() {
    if (isEditing.value) {
      bookmarkName.value = savedBookmarkName.value;
      isEditing.value = false;
      return;
    }
    isAdding.value = false;
    bookmarkName.value = "";
  }

  async function saveBookmark() {
    const point = resolvePoint();
    if (!point?.sensor_id) return;

    if (!bookmarkName.value.trim()) {
      bookmarkName.value = resolveDefaultName() || String(point.sensor_id);
    }

    await upsertPointBookmark(point, bookmarkName.value.trim());

    isBookmarked.value = true;
    isEditing.value = false;
    isAdding.value = false;
    savedBookmarkName.value = bookmarkName.value;
  }

  async function deleteBookmark() {
    const point = resolvePoint();
    if (!point) return;

    try {
      await removePointBookmark(point);
      applyBookmarkState({ resetForm: true });
    } catch (error) {
      console.error("Error deleting bookmark:", error);
    }
  }

  watch(pointSource, () => applyBookmarkState({ resetForm: true }), { deep: true, immediate: true });
  watch(idbBookmarks, () => applyBookmarkState(), { deep: true });

  return {
    isBookmarked,
    bookmarkName,
    savedBookmarkName,
    showBookmarkForm,
    isEditing,
    openAddForm,
    startEditing,
    cancelForm,
    saveBookmark,
    deleteBookmark,
  };
}
