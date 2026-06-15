/**
 * Генератор уникальных аватарок на основе ID (Polkadot-style identicon)
 * Использует Web Crypto API для создания хеша и генерации SVG паттерна
 */

/**
 * Создает хеш из строки используя Web Crypto API
 * @param {string} str - Строка для хеширования
 * @returns {Promise<Uint8Array>} Хеш в виде массива байт
 */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Генерирует цвет на основе хеша
 * @param {Uint8Array} hash - Хеш для генерации цвета
 * @param {number} offset - Смещение для получения разных цветов из того же хеша
 * @returns {string} HSL цвет
 */
function generateColor(hash, offset = 0) {
  const index = offset % hash.length;
  const r = hash[index];
  const g = hash[(index + 1) % hash.length];
  const b = hash[(index + 2) % hash.length];

  // Генерируем очень яркие, насыщенные цвета
  const hue = (r * 360) / 255;
  const saturation = 70 + (g % 30); // 70-100% - более насыщенные
  const lightness = 50 + (b % 30); // 50-80% - более яркие

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Генерирует SVG аватарку на основе ID
 * @param {string} id - ID сенсора
 * @param {number} size - Размер аватарки (по умолчанию 40)
 * @returns {Promise<string>} SVG строка data URL
 */
export async function generateAvatar(id, size = 40) {
  if (!id) {
    return null;
  }

  try {
    // Создаем хеш из ID
    const hash = await hashString(id);

    // Генерируем несколько цветов для сегментов
    const colors = [];
    const numColors = 4 + (hash[0] % 3); // 4-6 цветов
    for (let i = 0; i < numColors; i++) {
      colors.push(generateColor(hash, i * 3));
    }

    // Определяем тип паттерна на основе хеша
    const patternType = hash[5] % 3; // 3 типа красивых паттернов

    // Создаем SVG с абстрактным паттерном
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${generateGradients(hash, colors, size)}
        </defs>
        ${generateAbstractPattern(hash, size, colors, patternType)}
      </svg>
    `.trim();

    // Конвертируем в data URL
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  } catch (error) {
    console.error("Error generating avatar:", error);
    return null;
  }
}

/**
 * Генерирует градиенты для SVG
 * @param {Uint8Array} hash - Хеш
 * @param {Array<string>} colors - Массив цветов
 * @param {number} size - Размер
 * @returns {string} SVG градиенты
 */
function generateGradients(hash, colors, size) {
  const gradients = [];
  const centerX = size / 2;
  const centerY = size / 2;

  colors.forEach((color, index) => {
    const gradientId = `grad-${hash[0]}-${index}`;
    const gradientType = hash[index % hash.length] % 2 === 0 ? "radialGradient" : "linearGradient";

    if (gradientType === "radialGradient") {
      gradients.push(`
        <radialGradient id="${gradientId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.7" />
        </radialGradient>
      `);
    } else {
      const angle = (hash[index % hash.length] * 360) / 255;
      const x1 = Math.cos((angle * Math.PI) / 180);
      const y1 = Math.sin((angle * Math.PI) / 180);
      gradients.push(`
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.6" />
        </linearGradient>
      `);
    }
  });

  return gradients.join("");
}

/**
 * Генерирует паттерн из маленьких квадратиков для SVG
 * @param {Uint8Array} hash - Хеш
 * @param {number} size - Размер аватарки
 * @param {Array<string>} colors - Массив цветов
 * @param {number} patternType - Тип паттерна (не используется, но оставлен для совместимости)
 * @returns {string} SVG элементы паттерна
 */
function generateAbstractPattern(hash, size, colors, patternType) {
  const elements = [];

  // Фоновый цвет - пастельно-оранжевый или серый на основе хеша
  const bgColorIndex = hash[1] % 2;
  const bgColors = [
    "#f5e6d3", // пастельно-оранжевый
    "#e8e8e8", // светло-серый
  ];
  const backgroundColor = bgColors[bgColorIndex];

  // Добавляем фоновый прямоугольник
  elements.push(`<rect x="0" y="0" width="${size}" height="${size}" fill="${backgroundColor}"/>`);

  // Размер сетки - чем больше, тем больше квадратиков
  const gridSize = 8 + (hash[0] % 4); // 8-11 квадратов в ряду/строке
  const cellSize = size / gridSize;

  // Центральная точка для симметрии
  const centerX = (gridSize - 1) / 2;
  const centerY = (gridSize - 1) / 2;

  // Генерируем квадратики с симметрией
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      // Вычисляем симметричную позицию (зеркалируем по вертикали)
      const mirrorX = gridSize - 1 - x;

      // Используем только левую половину для генерации, затем зеркалим
      const sourceX = x < centerX + 1 ? x : mirrorX;

      // Определяем, закрашивать ли ячейку на основе хеша
      const hashIndex = (sourceX + y * gridSize) % hash.length;
      const shouldFill = hash[hashIndex] % 2 === 0;

      if (shouldFill) {
        // Выбираем цвет на основе позиции и хеша
        const colorIndex = (hashIndex + y) % colors.length;
        const color = colors[colorIndex];

        // Добавляем квадратик
        elements.push(`
          <rect x="${x * cellSize}" y="${y * cellSize}" 
                width="${cellSize}" height="${cellSize}" 
                fill="${color}" 
                rx="${cellSize * 0.15}"/>
        `);
      }
    }
  }

  return elements.join("");
}

/**
 * Синхронная версия генератора (использует кэш)
 * Кэширует результаты для быстрого доступа
 */
const avatarCache = new Map();

export function generateAvatarSync(id, size = 40) {
  if (!id) {
    return null;
  }

  // Проверяем кэш
  const cacheKey = `${id}-${size}`;
  if (avatarCache.has(cacheKey)) {
    return avatarCache.get(cacheKey);
  }

  // Генерируем аватарку асинхронно и кэшируем
  generateAvatar(id, size).then((avatar) => {
    if (avatar) {
      avatarCache.set(cacheKey, avatar);
    }
  });

  // Возвращаем null для первого вызова (будет обновлено после генерации)
  return null;
}

/**
 * Предзагружает аватарку и возвращает Promise.
 * TODO(sensor Info tab): показывать аватар owner во вкладке Info (`tabs/Info.vue`).
 * @param {string} id - ID сенсора
 * @param {number} size - Размер аватарки
 * @returns {Promise<string>} Promise с data URL аватарки
 */
export async function getAvatar(id, size = 40) {
  if (!id) {
    return null;
  }

  const cacheKey = `${id}-${size}`;

  // Проверяем кэш
  if (avatarCache.has(cacheKey)) {
    return avatarCache.get(cacheKey);
  }

  // Генерируем и кэшируем
  const avatar = await generateAvatar(id, size);
  if (avatar) {
    avatarCache.set(cacheKey, avatar);
  }

  return avatar;
}
