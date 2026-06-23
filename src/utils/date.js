// Reusable date helpers to replace moment.js usage

export function dayISO(input) {
  // Returns YYYY-MM-DD for provided date; if no input – for today
  let d;
  if (!input) {
    d = new Date();
  } else if (input instanceof Date) {
    d = input;
  } else if (typeof input === "number") {
    // Accept both seconds and milliseconds
    d = new Date(input < 1e12 ? input * 1000 : input);
  } else if (typeof input === "string") {
    d = new Date(input);
  } else {
    d = new Date();
  }
  // Use local date instead of UTC to avoid timezone issues
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayBoundsUnix(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);

  // Используем локальное время для правильных границ дня
  // Highcharts использует useUTC: false, поэтому timestamp'ы должны быть в локальном времени
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  const start = Math.floor(startDate.getTime() / 1000);
  const end = Math.floor(endDate.getTime() / 1000);

  return { start, end };
}

/**
 * Получает границы периода в зависимости от выбранного режима
 * @param {string} isoDate - дата в формате ISO (YYYY-MM-DD)
 * @param {string} mode - режим: 'day', 'week', 'month'
 * @returns {Object} объект с start и end в unix timestamp
 */
export function getPeriodBounds(isoDate, mode = "day") {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const today = dayISO();

  let endDate;
  let startDate;

  // Если это текущий день, показываем до текущего момента
  if (isoDate === today && mode === "day") {
    endDate = new Date(); // текущий момент
  } else {
    endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
  }

  switch (mode) {
    case "week":
      // Неделя: 7 дней назад от конечной даты
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;

    case "month":
      // Месяц: 30 дней назад от конечной даты
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;

    case "day":
    default:
      // День: только выбранная дата
      startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      break;
  }

  return {
    start: Math.floor(startDate.getTime() / 1000),
    end: Math.floor(endDate.getTime() / 1000),
  };
}

/**
 * API fetch window by timeline mode: day/realtime use live end for today; week/month rolling period.
 */
export function timelineFetchBounds(isoDate, timelineMode = "day") {
  if (timelineMode === "day" || timelineMode === "realtime") {
    const bounds = dayBoundsUnix(isoDate);
    if (isoDate === dayISO()) {
      return { start: bounds.start, end: Math.floor(Date.now() / 1000) };
    }
    return bounds;
  }
  return getPeriodBounds(isoDate, timelineMode);
}

/**
 * Список календарных дат YYYY-MM-DD в периоде (локальные границы как у getPeriodBounds).
 * Для realtime возвращает один день по выбранной дате (как day).
 */
export function enumeratePeriodDates(isoDate, mode = "day") {
  if (!isoDate) return [];
  const m = mode === "realtime" ? "day" : mode;
  const { start, end } = getPeriodBounds(isoDate, m);
  const startDay = dayISO(start * 1000);
  const endDay = dayISO(end * 1000);
  const out = [];
  let d = startDay;
  for (let i = 0; i < 400; i++) {
    out.push(d);
    if (d >= endDay) break;
    d = addDaysISO(d, 1);
  }
  return out;
}

export function addDaysISO(isoDate, deltaDays) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(deltaDays || 0));
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addMonthsISO(isoDate, deltaMonths) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + Number(deltaMonths || 0));
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function unixToISODate(unixSeconds) {
  if (!unixSeconds) return "";
  return new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
}

export function formatUnixLocale(unixSeconds, locale) {
  const dt = new Date(Number(unixSeconds) * 1000);
  const fmt = new Intl.DateTimeFormat(locale || localStorage.getItem("locale") || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return fmt.format(dt);
}

// Safely parse date from input (handles different locales and formats)
export function parseInputDate(dateString) {
  if (!dateString) return dayISO();

  // If it's already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Try to parse as Date and convert to ISO
  const parsedDate = new Date(dateString);
  if (isNaN(parsedDate.getTime())) {
    console.warn("Invalid date string:", dateString, "falling back to today");
    return dayISO();
  }

  return dayISO(parsedDate);
}
