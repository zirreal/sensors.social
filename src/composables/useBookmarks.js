import { ref, computed, watch, unref } from "vue";
import {
  IDBgettable,
  IDBworkflow,
  IDBdeleteByKey,
  notifyDBChange,
  watchDBChange,
  migrateDB,
} from "../utils/idb";
import { idbschemas } from "@config";

// Проверяем наличие конфигурации для новой базы данных
if (!idbschemas?.Sensors) {
  console.warn("Sensors database configuration not found. Bookmarks functionality disabled.");
}

const schema = idbschemas?.Sensors;
const DB_NAME = schema?.dbname;
const STORE = Object.keys(schema?.stores || {}).find((key) => key === "bookmarks") || null;

// Конфигурация для старой базы данных (может отсутствовать)
const oldSchema = idbschemas?.SensorsDBBookmarks;
const OLD_DB_NAME = oldSchema?.dbname;
const OLD_STORE = oldSchema
  ? Object.keys(oldSchema.stores || {}).find((key) => key === "bookmarks") || null
  : null;

// Глобальное состояние для закладок
const idbBookmarks = ref([]);

/** Есть ли сенсор в закладках (единый источник для маркеров и UI). */
export function isSensorBookmarked(sensorId) {
  if (!sensorId) return false;
  const sid = String(sensorId);
  return (idbBookmarks.value || []).some(
    (bookmark) => bookmark?.id === sid && !bookmark?.temp
  );
}

/** Класс sensor-bookmarked на маркере карты. */
function syncMarkerBookmarkClass(sensorId, isBookmarked) {
  if (!sensorId) return;
  const sensorElement = document.querySelector(`[data-id="${sensorId}"]`);
  if (!sensorElement) return;
  sensorElement.classList.toggle("sensor-bookmarked", Boolean(isBookmarked));
}

/** Перечитывает список закладок в idbBookmarks. */
async function refreshBookmarksList() {
  if (!schema || !DB_NAME || !STORE) {
    idbBookmarks.value = [];
    return;
  }

  try {
    idbBookmarks.value = (await IDBgettable(DB_NAME, STORE)).filter(
      (bookmark) => bookmark?.id && bookmark.id !== "init" && !bookmark.temp
    );
  } catch (error) {
    console.error("Error loading bookmarks:", error);
    idbBookmarks.value = [];
  }
}

/** Закладка по sensor_id: сначала кэш, иначе IndexedDB. */
async function findBookmarkBySensorId(sensorId) {
  const sid = sensorId ? String(sensorId) : null;
  if (!sid || !DB_NAME || !STORE) return null;

  const fromCache = idbBookmarks.value.find((bookmark) => bookmark.id === sid);
  if (fromCache) return fromCache;

  const bookmarks = await IDBgettable(DB_NAME, STORE);
  return bookmarks.find((bookmark) => bookmark.id === sid) || null;
}

/** Создаёт или обновляет закладку сенсора. */
async function upsertSensorBookmark(sensorId, name) {
  if (!sensorId || !DB_NAME || !STORE) return;

  const sid = String(sensorId);
  const existing = await findBookmarkBySensorId(sid);

  if (existing) {
    await new Promise((resolve, reject) => {
      IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
        const request = store.get(sid);

        request.addEventListener("error", (e) => reject(e));
        request.addEventListener("success", (e) => {
          const data = e.target.result;
          data.name = name;
          const requestUpdate = store.put(data);

          requestUpdate.addEventListener("error", (e) => reject(e));
          requestUpdate.addEventListener("success", () => resolve());
        });
      });
    });
  } else {
    await new Promise((resolve, reject) => {
      IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
        const request = store.add({ name, id: sid });

        request.addEventListener("error", (e) => reject(e));
        request.addEventListener("success", () => resolve());
      });
    });
  }

  notifyDBChange(DB_NAME, STORE);
  await refreshBookmarksList();
  syncMarkerBookmarkClass(sid, true);
}

/** Удаляет закладку сенсора. */
export async function removeSensorBookmark(sensorId) {
  const sid = sensorId ? String(sensorId) : null;
  if (!sid || !DB_NAME || !STORE) return;

  await IDBdeleteByKey(DB_NAME, STORE, sid);
  syncMarkerBookmarkClass(sid, false);
  notifyDBChange(DB_NAME, STORE);
  await refreshBookmarksList();
}

// Автоматическая миграция при запуске приложения
const autoMigrate = async () => {
  // Если нет конфигурации для старой базы, пропускаем миграцию
  if (!oldSchema || !OLD_DB_NAME || !OLD_STORE) {
    return;
  }

  try {
    // Сначала проверим, есть ли данные в старой базе
    let oldBookmarks = [];
    try {
      oldBookmarks = await IDBgettable(OLD_DB_NAME, OLD_STORE);
    } catch (error) {
      // Старая база не существует, это нормально
    }

    // Если в старой базе нет данных, пропускаем миграцию
    if (!oldBookmarks || oldBookmarks.length === 0) {
      return;
    }

    const { forceMigration } = useBookmarks();
    const success = await forceMigration();
    if (success) {
      // После успешной миграции удаляем старую базу
      try {
        const deleteReq = indexedDB.deleteDatabase(OLD_DB_NAME);
        await new Promise((resolve, reject) => {
          deleteReq.onsuccess = () => resolve();
          deleteReq.onerror = () => reject(deleteReq.error);
          deleteReq.onblocked = () => reject(new Error("Database deletion blocked"));
        });
      } catch (error) {
        console.warn("Could not delete old database automatically:", error);
      }
    }
  } catch (error) {
    console.error("Auto-migration failed:", error);
  }
};

// Запускаем автоматическую миграцию при загрузке модуля
autoMigrate();

export function useBookmarks() {
  const idbBookmarkGet = async () => {
    // Если нет конфигурации, возвращаем пустой массив
    if (!schema || !DB_NAME || !STORE) {
      return;
    }

    try {
      // Сначала инициализируем новую базу данных, создав пустую запись
      IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
        // Создаем пустую запись для инициализации базы
        const initRecord = { id: "init", temp: true };
        store.put(initRecord);
        // Сразу удаляем инициализационную запись
        store.delete("init");
      });

      // Проверяем, есть ли данные в старой базе перед миграцией (только если есть конфигурация)
      if (oldSchema && OLD_DB_NAME && OLD_STORE) {
        let oldBookmarks = [];
        try {
          oldBookmarks = await IDBgettable(OLD_DB_NAME, OLD_STORE);
        } catch (error) {
          // Старая база не существует, пропускаем миграцию
        }

        // Выполняем миграцию только если есть данные для миграции
        if (oldBookmarks && oldBookmarks.length > 0) {
          await migrateDB({
            fromDB: OLD_DB_NAME,
            fromStore: OLD_STORE,
            toDB: DB_NAME,
            toStore: STORE,
            transform: (oldBookmark) => ({
              id: oldBookmark.id,
              name: oldBookmark.customName || oldBookmark.id, // Используем customName или id как fallback
            }),
            clearSource: true,
          });
        }
      }

      await refreshBookmarksList();
    } catch (error) {
      console.error("Error in idbBookmarkGet:", error);
      // Fallback: пытаемся получить данные напрямую
      await refreshBookmarksList();
    }
  };

  const watchBookmarks = () => {
    // Если нет конфигурации, возвращаем пустую функцию
    if (!schema || !DB_NAME || !STORE) {
      return;
    }
    return watchDBChange(DB_NAME, STORE, () => idbBookmarkGet());
  };

  // Функция для принудительной миграции
  const forceMigration = async () => {
    // Если нет конфигурации для старой базы, возвращаем false
    if (!oldSchema || !OLD_DB_NAME || !OLD_STORE) {
      return false;
    }

    try {
      // Инициализируем базу данных
      IDBworkflow(DB_NAME, STORE, "readwrite", (store) => {
        const initRecord = { id: "init", temp: true };
        store.put(initRecord);
        store.delete("init");
      });

      // Выполняем миграцию с преобразованием структуры
      const success = await migrateDB({
        fromDB: OLD_DB_NAME,
        fromStore: OLD_STORE,
        toDB: DB_NAME,
        toStore: STORE,
        transform: (oldBookmark) => ({
          id: oldBookmark.id,
          name: oldBookmark.customName || oldBookmark.id,
        }),
        clearSource: true,
      });

      if (success) {
        // Обновляем данные
        await refreshBookmarksList();
      }

      return success;
    } catch (error) {
      console.error("Force migration error:", error);
      return false;
    }
  };

  return {
    idbBookmarks,
    idbBookmarkGet,
    watchBookmarks,
    forceMigration,
  };
}

/**
 * UI-состояние и CRUD закладки одного сенсора (шапка попапа, виджет Bookmark).
 */
export function useSensorBookmark(sensorIdSource, { defaultName = () => "" } = {}) {
  const isBookmarked = ref(false);
  const bookmarkName = ref("");
  const savedBookmarkName = ref("");
  const isEditing = ref(false);
  const isAdding = ref(false);

  const showBookmarkForm = computed(() => isAdding.value || isEditing.value);

  const resolveSensorId = () => {
    const id = unref(sensorIdSource);
    return id ? String(id) : null;
  };

  const resolveDefaultName = () => {
    const name = typeof defaultName === "function" ? defaultName() : defaultName;
    return name != null ? String(name).trim() : "";
  };

  function applyBookmarkState({ resetForm = false } = {}) {
    // Синхронизируем локальное UI-состояние с idbBookmarks, не сбрасывая открытую форму.
    const sid = resolveSensorId();

    if (resetForm) {
      isEditing.value = false;
      isAdding.value = false;
    }

    if (!sid) {
      isBookmarked.value = false;
      bookmarkName.value = "";
      savedBookmarkName.value = "";
      isEditing.value = false;
      isAdding.value = false;
      return;
    }

    const bookmark = idbBookmarks.value.find((item) => item.id === sid);
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
    const sid = resolveSensorId();
    if (!sid) return;

    if (!bookmarkName.value.trim()) {
      bookmarkName.value = resolveDefaultName() || sid;
    }

    await upsertSensorBookmark(sid, bookmarkName.value.trim());

    isBookmarked.value = true;
    isEditing.value = false;
    isAdding.value = false;
    savedBookmarkName.value = bookmarkName.value;
  }

  async function deleteBookmark() {
    const sid = resolveSensorId();
    if (!sid) return;

    try {
      await removeSensorBookmark(sid);
      applyBookmarkState({ resetForm: true });
    } catch (error) {
      console.error("Error deleting bookmark:", error);
    }
  }

  watch(sensorIdSource, () => applyBookmarkState({ resetForm: true }), { immediate: true });
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
