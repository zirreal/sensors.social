import { idbschemas } from "@config";

/*
    Все функции используют схему из idbschemas.
    Для добавления новых БД/objectStore достаточно расширить json.
*/

/*
    getDBConfig(dbname)
    Возвращает конфиг выбранной БД из idbschemas.
*/
function getDBConfig(dbname) {
  const db = idbschemas[dbname];
  if (!db) throw new Error(`No config for db: ${dbname}`);
  return db;
}

/*
    getStoreConfig(dbname, dbtable)
    Возвращает схему objectStore выбранной БД.
*/
function getStoreConfig(dbname, dbtable) {
  const db = getDBConfig(dbname);
  const store = db.stores[dbtable];
  if (!store) throw new Error(`No schema for objectStore: ${dbtable} in ${dbname}`);
  return store;
}

/*
    IDBworkflow(dbname, dbtable, mode, onsuccess)
    Открывает БД и инициирует транзакцию для objectStore.
    - dbname: имя БД
    - dbtable: имя objectStore
    - mode: 'readonly' | 'readwrite'
    - onsuccess: функция(store), где store — экземпляр objectStore
    Используй для операций записи/изменения одной или нескольких записей.
    Пример:
        IDBworkflow('Sensors', 'bookmarks', 'readwrite', store => { store.put({...}) })
*/
export function IDBworkflow(dbname, dbtable, mode, onsuccess) {
  const dbconf = getDBConfig(dbname);
  const { dbversion } = dbconf;
  const { keyPath, autoIncrement } = getStoreConfig(dbname, dbtable);

  const IDB = window.indexedDB || window.webkitIndexedDB;
  if (!IDB) {
    return;
  }

  let db = null;
  const DBOpenReq = IDB.open(dbname, dbversion);

  DBOpenReq.addEventListener("error", (err) => {
    console.warn(err);
  });

  DBOpenReq.addEventListener("success", (e) => {
    db = e.target.result;
    if (db.objectStoreNames.contains(dbtable)) {
      let tx = db.transaction(dbtable, mode);
      tx.addEventListener("error", (err) => {
        console.warn(err);
      });
      const store = tx.objectStore(dbtable);
      onsuccess(store);
    } else {
      console.warn(
        `[idb] object store "${dbtable}" is missing in "${dbname}". Bump dbversion in idb-schemas or fix the schema.`
      );
    }
  });

  DBOpenReq.addEventListener("upgradeneeded", (e) => {
    db = e.target.result;
    const configuredStores = new Set(Object.keys(dbconf.stores));
    // Удаляем objectStore, которых больше нет в схеме (например переименование стора)
    Array.from(db.objectStoreNames).forEach((name) => {
      if (!configuredStores.has(name)) {
        db.deleteObjectStore(name);
      }
    });
    // создаёт или пересоздаёт все objectStore согласно конфигу для выбранной БД
    Object.entries(dbconf.stores).forEach(([storeName, { keyPath, autoIncrement }]) => {
      if (db.objectStoreNames.contains(storeName)) {
        db.deleteObjectStore(storeName);
      }
      db.createObjectStore(storeName, { keyPath, autoIncrement });
    });
  });
}

/*
    IDBgettable(dbname, dbtable)
    Возвращает Promise со всеми записями objectStore из выбранной БД в виде массива.
    Пример:
        IDBgettable('Sensors', 'bookmarks').then(arr => ...)
*/
export function IDBgettable(dbname, dbtable) {
  return new Promise((resolve) => {
    let datafromtable = [];
    IDBworkflow(dbname, dbtable, "readonly", (store) => {
      store.openCursor().addEventListener("success", (e) => {
        const cursor = e.target.result;
        if (cursor) {
          datafromtable.push(cursor.value);
          cursor.continue();
        } else {
          resolve(datafromtable);
        }
      });
    });
  });
}

/*
    IDBgetByKey(dbname, dbtable, key)
    Получает одну запись по ключу из выбранной БД/objectStore.
    Возвращает Promise с записью или null если не найдено.
    Пример:
        IDBgetByKey('Sensors', 'logsHealth', 'sensor123').then(record => ...)
*/
export function IDBgetByKey(dbname, dbtable, key) {
  return new Promise((resolve) => {
    IDBworkflow(dbname, dbtable, "readonly", (store) => {
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        resolve(null);
      };
    });
  });
}

/*
    IDBdeleteByKey(dbname, dbtable, key)
    Удаляет одну запись по ключу из выбранной БД/objectStore.
    Возвращает Promise, который resolve после удаления.
    Пример:
        IDBdeleteByKey('Sensors', 'bookmarks', 5)
*/
export function IDBdeleteByKey(dbname, dbtable, key) {
  return new Promise((resolve, reject) => {
    IDBworkflow(dbname, dbtable, "readwrite", (store) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e);
    });
  });
}

/*
    IDBcleartable(dbname, dbtable)
    Очищает objectStore полностью в выбранной БД.
    Не возвращает ничего, просто очищает.
    Пример:
        IDBcleartable('Sensors', 'bookmarks')
*/
export function IDBcleartable(dbname, dbtable) {
  IDBworkflow(dbname, dbtable, "readwrite", (store) => {
    const request = store.clear();

    request.onsuccess = () => {
      const bc = new BroadcastChannel("idb_changed");
      bc.postMessage(dbtable);
      bc.close();
      return true;
    };

    request.onerror = (err) => {
      console.error(`Error to empty Object Store: ${err}`);
      return false;
    };
  });
}

/*
    encryptText(text)
    Возвращает объект { ciphertext, iv, key }
    Для безопасного хранения строки в IndexedDB.
*/
export async function encryptText(text) {
  const MAGIC = "altruist-v1";
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(`${MAGIC}:${text}`)
  );
  const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
  return {
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    iv: Array.from(iv),
    key: exportedKey,
  };
}

/*
    decryptText(data)
    Дешифрует объект, полученный из encryptText.
    Возвращает строку или null при ошибке.
*/
export async function decryptText(data) {
  try {
    const MAGIC = "altruist-v1";
    const dec = new TextDecoder();
    const key = await window.crypto.subtle.importKey("jwk", data.key, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(data.iv) },
      key,
      new Uint8Array(data.ciphertext)
    );
    const str = dec.decode(new Uint8Array(decrypted));
    if (str.startsWith(MAGIC + ":")) {
      return str.slice(MAGIC.length + 1);
    }
    return null;
  } catch (e) {
    return null;
  }
}

/*
    notifyDBChange(dbname, dbtable)
    Отправляет событие в BroadcastChannel, что в objectStore произошли изменения.
    Вызывай после любых операций изменения данных в IndexedDB, чтобы другие вкладки/компоненты могли отреагировать.
    Пример:
        notifyDBChange('Altruist', 'Accounts')
*/
export function notifyDBChange(dbname, dbtable) {
  const bc = new BroadcastChannel("idb_changed");
  bc.postMessage({ dbname, tablename: dbtable });
  bc.close();
}

/*
    watchDBChange(dbname, dbtable, callback)
    Подписывается на изменения конкретного objectStore.
    - dbname: имя базы
    - dbtable: имя objectStore
    - callback: функция, вызываемая при изменении
    Возвращает функцию для отписки.
    Пример:
        const stop = watchDBChange('Altruist', 'Accounts', loadAccounts);
        onUnmounted(stop);
*/
export function watchDBChange(dbname, dbtable, callback) {
  const bc = new BroadcastChannel("idb_changed");

  bc.onmessage = (event) => {
    const { dbname: changedDB, tablename: changedTable } = event.data || {};
    if (changedDB === dbname && changedTable === dbtable) {
      callback();
    }
  };

  return () => bc.close();
}

/*
    hasIndexedDB()
    Проверяет поддержку IndexedDB в окружении.
*/
export function hasIndexedDB() {
  const IDB = window.indexedDB || window.webkitIndexedDB;
  return !!IDB;
}

/*
    migrateDB()
    Общий механизм миграции данных между базами данных.
    @param {Object} migrationConfig - конфигурация миграции
    @param {string} migrationConfig.fromDB - исходная база данных
    @param {string} migrationConfig.fromStore - исходная таблица
    @param {string} migrationConfig.toDB - целевая база данных
    @param {string} migrationConfig.toStore - целевая таблица
    @param {Function} migrationConfig.transform - функция преобразования данных (опционально)
    @param {boolean} migrationConfig.clearSource - очищать исходную таблицу после миграции (по умолчанию true)
    @returns {Promise<boolean>} true если миграция прошла успешно
*/
export async function migrateDB(migrationConfig) {
  const {
    fromDB,
    fromStore,
    toDB,
    toStore,
    transform = (data) => data, // По умолчанию данные не изменяются
    clearSource = true,
  } = migrationConfig;

  try {
    // Проверяем, существует ли исходная база данных
    let sourceData = [];
    try {
      sourceData = await IDBgettable(fromDB, fromStore);
      if (!sourceData || sourceData.length === 0) {
        return true;
      }
    } catch (error) {
      return true; // Не считаем это ошибкой
    }

    if (!sourceData || sourceData.length === 0) {
      return true;
    }

    // Мигрируем данные
    for (const record of sourceData) {
      const transformedRecord = transform(record);

      IDBworkflow(toDB, toStore, "readwrite", (store) => {
        store.put(transformedRecord);
      });
    }

    // Очищаем исходную таблицу если требуется
    if (clearSource) {
      try {
        await IDBcleartable(fromDB, fromStore);
      } catch (error) {
        console.warn(`Could not clear source table ${fromDB}.${fromStore}:`, error);
      }
    }

    // Уведомляем об изменениях в целевой базе
    notifyDBChange(toDB, toStore);

    return true;
  } catch (error) {
    console.error("Migration failed:", error);
    return false;
  }
}
