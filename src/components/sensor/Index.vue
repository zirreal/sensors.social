<template>
  <div class="popup-js active">
    <section class="sensor-header">
      <div class="sensor-type">
        <a
          v-if="log !== null && sensorTypeImage"
          :href="sensorTypeLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img :src="sensorTypeImage" :alt="sensorType" />
        </a>
      </div>

      <div class="sensor-info-title">
        <img v-if="sensorAvatar" :src="sensorAvatar" :alt="sensor_id" class="sensor-avatar" />

        <h3>
          <template v-if="point?.address">{{ point.address }}</template>
          <span v-else class="skeleton skeleton-text"></span>
        </h3>
      </div>

      <button @click.prevent="closesensor" aria-label="Close sensor" class="localbutton-close">
        <font-awesome-icon icon="fa-solid fa-xmark" />
      </button>
    </section>

    <!-- <div class="sensor-info-desc">Here you'll see some custom description</div> -->

    <div class="sensor-panel">
      <button
        class="panel-button"
        :class="{ active: activeTab === 'chart' }"
        @click.prevent="activeTab = 'chart'"
        :title="'Analytics'"
      >
        <font-awesome-icon icon="fa-solid fa-chart-line" />
        Analytics
      </button>

      <button
        v-if="isAccountsEnabled && isStoriesEnabled"
        class="panel-button"
        :class="{ active: activeTab === 'edit' }"
        @click.prevent="activeTab = 'edit'"
        :title="t('sensorpopup.edit') || 'Edit'"
      >
        <font-awesome-icon icon="fa-regular fa-comment" />
        Stories
      </button>

      <button
        class="panel-button"
        :class="{ active: activeTab === 'info' }"
        @click.prevent="activeTab = 'info'"
        :title="t('sensorpopup.infotitle')"
      >
        <font-awesome-icon icon="fa-regular fa-file-lines" />
        Info
      </button>
      <button
        class="panel-button"
        :class="{ active: activeTab === 'sharelink' }"
        @click.prevent="activeTab = 'sharelink'"
        :title="t('sensorpopup.sharedefault')"
      >
        <font-awesome-icon icon="fa-solid fa-link" />
        Share
      </button>
    </div>

    <div class="scrollable-y">
      <div v-show="activeTab === 'chart'" class="tab-content chart-tab">
        <div v-if="latestStoryInPeriod" class="story-day">
          <div class="story-day__content">
            <div
              class="story-day-icon"
              :style="{ '--story-color': iconColor(latestStoryInPeriod.iconId) }"
            >
              <font-awesome-icon
                v-if="latestStoryInPeriod.icon"
                :icon="latestStoryInPeriod.icon"
                class="story-day-fa"
                :style="{ color: iconColor(latestStoryInPeriod.iconId) }"
              />
            </div>
            <div class="story-day-body">
              <p class="story-day-body__time">{{ formatStoryDateTime(latestStoryInPeriod) }}</p>
              <p class="story-day-body__text">
                {{ latestStoryInPeriod.message || latestStoryInPeriod.comment }}
              </p>
            </div>
          </div>
          <button
            v-if="isAccountsEnabled"
            type="button"
            class="button button-round-outline"
            @click.prevent="activeTab = 'edit'"
            :title="$t('sensorpopup.allStories')"
          >
            <font-awesome-icon icon="fa-solid fa-comment" />
            <span class="button-round-outline__badge blue">{{ sensorStoriesTotalCount }}</span>
          </button>
        </div>

        <Analytics :point="point" :log="log" />
      </div>

      <div v-if="isStoriesEnabled && isAccountsEnabled && activeTab === 'edit'" class="tab-content">
        <EditStory
          v-if="sensor_id"
          :sensor-id="sensor_id"
          :owner="owner"
          :geo="geo"
          @open-chart="activeTab = 'chart'"
        />
      </div>

      <div v-show="activeTab === 'info'" class="tab-content">
        <Info :sensor-id="sensor_id" :owner="owner" :geo="geo" />
      </div>

      <div v-show="activeTab === 'sharelink'" class="tab-content">
        <ShareLink :log="log" :point="point" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useMap } from "@/composables/useMap";
import { useSensors } from "@/composables/useSensors";
import { useBookmarks } from "@/composables/useBookmarks";
import { getStoriesForSensor, isStoryHidden, storiesLocalKeys } from "@/composables/useStories";
import { getAvatar } from "@/utils/avatarGenerator";
import { settings } from "@config";
import { dayISO, getPeriodBounds } from "@/utils/date";

import Analytics from "./tabs/Analytics.vue";
import Info from "./tabs/Info.vue";
import ShareLink from "./tabs/ShareLink.vue";
import EditStory from "./tabs/EditStory.vue";

// Импортируем изображения типов сенсоров
import diyIcon from "@/assets/images/sensorTypes/DIY.svg";
import insightIcon from "@/assets/images/sensorTypes/Insight.svg";
import urbanIcon from "@/assets/images/sensorTypes/Urban.svg";
import altruistIcon from "@/assets/images/sensorTypes/Altruist.svg";

const props = defineProps({
  point: Object,
});

const emit = defineEmits(["close"]);

const { t, locale } = useI18n();
const mapState = useMap();
const { idbBookmarks } = useBookmarks();

const localeComputed = computed(() => localStorage.getItem("locale") || locale.value || "en");
const sensorsUI = useSensors(localeComputed);

const point = computed(() => props.point?.value ?? props.point ?? null);

// Активная вкладка
const activeTab = ref("chart");

// Проверяем, включен ли сервис accounts
const isAccountsEnabled = computed(() => settings?.SERVICES?.accounts === true);
const isStoriesEnabled = computed(() => settings?.SERVICES?.stories !== false);

const ICON_COLORS = {
  heat: "#ff6b6b",
  cold: "#7ad9e8",
  smog: "#9aa7b1",
  wind: "#76a7ff",
  noise: "#c58bff",
  storm: "#b39ddb",
  rain: "#7fbfff",
  sun: "#ffd36e",
  fire: "#ffb26b",
  co2: "#b08a7a",
  note: "#7fcf9a",
};

function iconColor(id) {
  return ICON_COLORS[id] || "currentColor";
}

/** Milliseconds for display/sort: publish time, else createdAt. */
function storyTimestampMs(s) {
  if (!s) return null;
  const ts = s.timestamp != null ? Number(s.timestamp) : null;
  if (ts != null && !Number.isNaN(ts)) return ts < 1e12 ? ts * 1000 : ts;
  if (s.createdAt) {
    const t = new Date(s.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** Calendar day of the story (event `date` or day of `timestamp`) for period filter. */
function storyEventDayISO(s) {
  if (!s) return null;
  const d = s.date != null && String(s.date).trim() !== "" ? String(s.date).trim() : null;
  if (d) return d;
  const ms = storyTimestampMs(s);
  if (ms == null) return null;
  try {
    return dayISO(ms);
  } catch {
    return null;
  }
}

function formatStoryDateTime(s) {
  const ms = storyTimestampMs(s);
  if (ms == null) return "—";
  const loc = String(locale.value || "en");
  const fmtLoc = loc === "ru" ? "ru-RU" : "en-GB";
  return new Intl.DateTimeFormat(fmtLoc, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** Bump on `stories_updated` so counts/lists refresh after localStorage writes. */
const storiesRefreshTick = ref(0);

/** Stories in selected timeline period (day / week / month), newest first, not hidden. */
const storiesInSelectedPeriod = computed(() => {
  storiesRefreshTick.value;
  const sid = sensor_id.value;
  const date = mapState.currentDate?.value;
  const modeRaw = mapState.timelineMode?.value || "day";
  const mode = modeRaw === "realtime" ? "day" : modeRaw;
  if (!sid || !date) return [];

  const { start, end } = getPeriodBounds(date, mode);
  const startDay = dayISO(start * 1000);
  const endDay = dayISO(end * 1000);

  const list = getStoriesForSensor(sid);
  const inPeriod = (s) => {
    const eventIso = storyEventDayISO(s);
    if (!eventIso) return false;
    return eventIso >= startDay && eventIso <= endDay;
  };

  const matches = (Array.isArray(list) ? list : []).filter((s) => inPeriod(s) && !isStoryHidden(s));
  matches.sort((a, b) => (storyTimestampMs(b) || 0) - (storyTimestampMs(a) || 0));
  return matches;
});

/** Последняя (самая новая) история за выбранный период. */
const latestStoryInPeriod = computed(() => storiesInSelectedPeriod.value[0] || null);

/** Всего историй по датчику (localStorage), без скрытых. */
const sensorStoriesTotalCount = computed(() => {
  storiesRefreshTick.value;
  const sid = sensor_id.value;
  if (!sid) return 0;
  const list = getStoriesForSensor(sid);
  return (Array.isArray(list) ? list : []).filter((s) => s && !isStoryHidden(s)).length;
});

// Порядок табов для навигации клавиатурой (edit только если accounts включен)
const tabsOrder = computed(() => {
  const base = ["chart", "info", "sharelink", "bookmarks"];
  if (isAccountsEnabled.value) {
    base.push("edit");
  }
  return base;
});

// Функция для переключения табов клавиатурой
const handleKeydown = (event) => {
  // Проверяем, что нажата стрелка влево или вправо
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    // Предотвращаем стандартное поведение (прокрутку страницы)
    event.preventDefault();

    const currentIndex = tabsOrder.value.indexOf(activeTab.value);
    if (currentIndex === -1) return;

    let nextIndex;
    if (event.key === "ArrowLeft") {
      // Переход к предыдущему табу (циклически)
      nextIndex = currentIndex === 0 ? tabsOrder.value.length - 1 : currentIndex - 1;
    } else {
      // Переход к следующему табу (циклически)
      nextIndex = currentIndex === tabsOrder.value.length - 1 ? 0 : currentIndex + 1;
    }

    activeTab.value = tabsOrder.value[nextIndex];
  }
};

const sensor_id = computed(() => point.value?.sensor_id || null);

// Аватарка сенсора на основе ID
const sensorAvatar = ref(null);

// Генерируем аватарку при изменении sensor_id
watch(
  sensor_id,
  (newId) => {
    if (newId) {
      getAvatar(newId, 60)
        .then((avatar) => {
          sensorAvatar.value = avatar;
        })
        .catch((error) => {
          console.error("Error generating avatar:", error);
          sensorAvatar.value = null;
        });
    } else {
      sensorAvatar.value = null;
    }
  },
  { immediate: true }
);

const geo = computed(() => point.value?.geo || { lat: 0, lng: 0 });

const owner = computed(() => point.value?.owner || null);

// Проверяем, добавлен ли сенсор в закладки
const isBookmarked = computed(() => {
  if (!sensor_id.value) return false;
  return idbBookmarks.value?.some((bookmark) => bookmark.id === sensor_id.value) || false;
});

// Гарантируем, что logs всегда массив
const log = computed(() => (Array.isArray(point.value?.logs) ? point.value.logs : null));

// Вычисляем тип сенсора используя функцию из composable
const sensorType = computed(() => sensorsUI.getSensorType(point.value));

// Вычисляем путь к изображению типа сенсора
const sensorTypeImage = computed(() => {
  if (!sensorType.value) return null;

  const typeMap = {
    diy: diyIcon,
    insight: insightIcon,
    urban: urbanIcon,
    altruist: altruistIcon,
  };

  return typeMap[sensorType.value] || null;
});

// Вычисляем ссылку для типа сенсора
const sensorTypeLink = computed(() => {
  if (sensorType.value === "diy") {
    return "https://robonomics.academy/en/learn/sensors-connectivity-course/sensor-hardware/";
  }
  return "https://shop.akagi.dev/products/outdoor-sensor-altruist-dev-kit";
});

// Функции для табов теперь не нужны - переключение происходит через activeTab

const closesensor = () => {
  // Просто эмитим событие закрытия - всю логику обрабатывает Main.vue
  emit("close");
};

/**
 * Генерирует ссылку на карту в зависимости от устройства
 * @param {number} lat - Широта
 * @param {number} lon - Долгота
 * @param {string} [label="Sensor"] - Подпись для метки
 * @returns {string} URL ссылки на карту
 */
function getMapLink(lat, lon, label = "Sensor") {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  if (isIOS) {
    return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(label)}`;
  }
  if (isAndroid) {
    return `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(label)})`;
  }
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

function bumpStoriesRefresh() {
  storiesRefreshTick.value += 1;
}

onMounted(() => {
  // Инициализация компонента
  // Добавляем обработчик клавиатуры для переключения табов
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener(storiesLocalKeys.STORIES_UPDATED_EVENT, bumpStoriesRefresh);
});

onBeforeUnmount(() => {
  // Удаляем обработчик клавиатуры при размонтировании
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener(storiesLocalKeys.STORIES_UPDATED_EVENT, bumpStoriesRefresh);
});

// Watcher для изменений даты (из UI или внешних источников)
watch(
  () => mapState.currentDate.value,
  async (newDate, oldDate) => {
    if (!newDate || oldDate === undefined || newDate === oldDate) return;
    const sid = sensor_id.value;
    if (!sid || !sensorsUI.isSensorOpen(sid)) return;
    sensorsUI.clearSensorLogs(sid);
    await sensorsUI.updateSensorLogs(sid);
  }
);

// URL обновление теперь происходит только в Main.vue
// Здесь оставляем только UI-специфичную логику
</script>

<style scoped>
/* + Заголовок сенсора: тип, выбор даты, кнопка закрыть */

.sensor-type {
  width: 30px;
}

.sensor-type {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.sensor-type img {
  width: 100%;
  display: block;
}

.sensor-header {
  display: grid;
  gap: var(--gap);
  grid-template-columns: 30px 1fr 30px;
  align-items: center;
}
/* - Заголовок сенсора: тип, выбор даты, кнопка закрыть */

.popup-js.active {
  container: popup / inline-size;
  background: var(--color-light);
  border-radius: 0;
  bottom: 0;
  box-sizing: border-box;
  color: var(--color-dark);
  padding: var(--gap);
  position: absolute;
  right: 0;
  top: 0;
  width: 80vw;
  max-width: 1000px;
  z-index: 100;
  box-shadow: -6px 0 12px -4px rgba(0, 0, 0, 0.3);
}

.scrollable-y {
  max-height: 85%;
}

/* Стили скелетона для заглушки графика */
.chart-skeleton {
  height: 300px;
  width: 100%;
  background: linear-gradient(90deg, #f0f0f0, #e0e0e0, #f0f0f0);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

.no-data-message {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 1rem;
  text-align: center;
  padding: 2rem;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Стили заглушки для текста */
.skeleton-text {
  display: inline-block;
  height: 1em;
  width: 100%;
  background: linear-gradient(90deg, #f0f0f0, #e0e0e0, #f0f0f0);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media screen and (max-width: 700px) {
  .popup-js.active {
    left: 0;
    width: 100%;
    top: 0;
  }
}

@container popup (max-width: 400px) {
  h3.flexline {
    max-width: calc(100% - var(--gap) * 3);
  }
}

/* shared container */

/* + scales */
.scalegrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap);
  font-size: 0.8em;
}
.scalegrid:not(:last-child) {
  margin-bottom: calc(var(--gap) * 2);
}
.scalegrid p {
  margin-bottom: calc(var(--gap) * 0.5);
}
.scales-color {
  position: relative;
  padding-left: calc(var(--gap) * 2);
  hyphens: auto;
}
.scales-color:before {
  content: "";
  display: block;
  position: absolute;
  background-color: var(--color);
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--gap);
}
/* - scales */

/* + realtime */
/* removed .rt-title indicator styles (not used) */
.rt-time {
  font-size: 0.8em;
  font-weight: 300;
}
.rt-unit,
.rt-number {
  font-size: 0.8em;
  font-weight: 900;
}

.rt-number {
  color: var(--color-blue);
}

/* - realtime */

.sensor-info {
  text-align: center;
}

.sensor-info-title {
  display: flex;
  gap: var(--gap);
  align-items: center;
  margin-bottom: 0;
  justify-content: center;
}

@media screen and (width < 700px) {
  .sensor-header {
    align-items: start;
    justify-content: start;
    gap: calc(var(--gap) * 3);
  }

  .sensor-info-title {
    flex-direction: column;
    text-align: center;
  }
}
.sensor-info-title h3 {
  margin-bottom: 0;
}

.sensor-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  display: inline-block;
}

.sensor-panel {
  display: flex;
  justify-content: center;
  gap: calc(var(--gap) * 0.5);
  flex-wrap: wrap;
  border-bottom: 2px solid var(--color-dark);
  margin-top: calc(var(--gap) * 2);
}

.panel-button {
  background: transparent;
  border: 2px solid transparent;
  cursor: pointer;
  padding: calc(var(--gap) * 0.5) calc(var(--gap) * 1.5);
  color: var(--color-text);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  top: 2px;
  font-size: var(--font-size);
  gap: calc(var(--gap) * 0.5);
  font-weight: 600;
}

.panel-button:hover {
  color: var(--color-link);
}

.panel-button.active {
  color: var(--color-link);
  border-bottom: 2px solid var(--color-link);
}

.panel-button svg {
  width: 1.2em;
  height: 1.2em;
}

.tab-content {
  --tab-offset-x: 0;
  --tab-offset-y: calc(var(--gap) * 3);
  padding: var(--tab-offset-y) var(--tab-offset-x);
  position: relative;
}

.chart-tab {
  padding-top: calc(var(--tab-offset-y) * 0.65);
}

.story-day {
  --story-icon-size: 3rem;
  padding: calc(var(--gap) / 2);
  background-color: var(--color-light-gray);
  border: 1px solid var(--color-middle-gray);
  border-radius: var(--radius-sm);
  margin-bottom: var(--gap);
  display: grid;
  grid-template-columns: auto var(--story-icon-size);
  align-items: center;
}

.story-day__content {
  display: grid;
  grid-template-columns: var(--story-icon-size) auto;
  gap: var(--gap);
  align-items: center;
}

.story-day-icon {
  width: var(--story-icon-size);
  height: var(--story-icon-size);
  border-radius: calc(var(--story-icon-size) / 2);
  background: color-mix(in srgb, var(--story-color, var(--color-blue)) 14%, transparent);
  border: 1px solid
    color-mix(in srgb, var(--story-color, var(--color-blue)) 28%, rgba(0, 0, 0, 0.08));
  display: grid;
  place-items: center;
}

.story-day__content p {
  margin-bottom: 0.2rem;
}

.story-day-body__time {
  font-weight: 600;
}

.localbutton-close {
  border: 0;
  cursor: pointer;
}

.localbutton-close .fa-xmark {
  height: calc(var(--font-size) * 2);
}

.sensor-info-desc {
  text-align: center;
}
</style>
