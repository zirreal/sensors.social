<template>
  <div class="popup-js active">
    <section>
      <h3 class="sensor-title clipoverflow">
        
        <Icon :sensorID="sensor_id" />

        <span v-if="state.addressLoading" class="skeleton-text"></span>
        <span v-else>{{ addressformatted }}</span>
      </h3>
    </section>

    <div class="scrollable-y">
      <section class="flexline-mobile-column">

        <div class="flexline mb">
          <AQIWidget v-if="state.provider !== 'realtime'" :logs="log" />

          <ProviderType />

          <div v-if="state.provider !== 'realtime'">
            <input type="date" v-model="state.start" :max="state.maxDate" onchange="this.blur()" />
          </div>

          <div v-else>
            <div v-if="state.rttime" class="rt-time">{{ state.rttime }}</div>
          </div>
        </div>

        <div v-if="state.provider === 'realtime'" class="flexline">
          <template v-if="state.rtdata && state.rtdata.length">
            <div v-for="item in state.rtdata" :key="item.key">
              <div class="rt-unit">{{ item.label }}</div>
              <div class="rt-number" :style="item.color ? 'color:' + item.color : ''">
                {{ item.measure }} {{ item.unit }}
              </div>
            </div>
          </template>
        </div>

      </section>

      <section>
        <Chart v-show="state.chartReady" :log="log" :unit="measurements[props.type]?.unit" />
        <div v-show="!state.chartReady" class="chart-skeleton"></div>
      </section>

      <section class="flexline space-between">
        <div class="flexline">
          <Bookmark
            v-if="sensor_id"
            :id="sensor_id"
            :address="state.address?.address && state.address?.address.join(', ')"
            :link="sensor_id"
            :geo="geo"
          />
        </div>
        <div class="shared-container">
          <button
            v-if="globalWindow.navigator.share"
            @click.prevent="shareData"
            class="button"
            :title="t('sensorpopup.sharedefault')"
          >
            <font-awesome-icon icon="fa-solid fa-share-from-square" v-if="!state.sharedDefault" />
            <font-awesome-icon icon="fa-solid fa-check" v-if="state.sharedDefault" />
          </button>

          <button @click.prevent="shareLink" class="button" :title="t('sensorpopup.sharelink')">
            <font-awesome-icon icon="fa-solid fa-link" v-if="!state.sharedLink" />
            <font-awesome-icon icon="fa-solid fa-check" v-if="state.sharedLink" />
          </button>
        </div>
      </section>

      <!-- monthly-analysis block is temporarily disabled
      <section class="monthly-analysis" v-if="state.chartReady" style="display: none">
        <h2>Analysis / Reports </h2>
        <div v-if="state.provider !== 'realtime'" class="flexline">
          <template v-if="state.monthLogLoading"><Loader /></template>
          <button v-if="!state.monthLogLoading" @click="getScope('week')" class="button" :disabled="state.analysisType === 'week'">{{ state.analysisType === 'week' && state.chartScopeReady ? 'Weekly report ready' : 'Generate weekly report' }}</button>
          <button v-if="!state.monthLogLoading" @click="getScope('month')" class="button" :disabled="state.analysisType === 'month'"> {{ state.analysisType === 'month' && state.chartScopeReady ? 'Monthly report ready' : 'Generate monthly report' }}</button>
        </div>
        <div class="chart-wrapper" v-if="state.showAnalysisChart">
          <AnalysisChart v-show="state.chartScopeReady" :log="scopeLog" :unit="measurements[props.type]?.unit" :currentScope="state.analysisType" />
          <div v-show="!state.chartScopeReady" class="chart-skeleton"></div>
          <div v-if="state.monthLogLoading" class="monthly-scope-warning">
           <font-awesome-icon icon="fa-solid fa-circle-exclamation" />
           WARNING: Data scope is still in beta and may freeze at the time.
          </div>
        </div>        
      </section> -->

      <AltruistPromo />

      <section v-if="units && scales && scales.length > 0">
        <h3>{{ t("scales.title") }}</h3>
        <div class="scalegrid">
          <div v-for="item in scales" :key="item.label">
            <template v-if="item?.zones && (item.name || item.label)">
              <p>
                <b v-if="item.name">
                  {{item.nameshort[localeComputed]}}
                </b>
                <b v-else>{{ item.label }}</b>
                <template v-if="item.unit && item.unit !== ''">
                  ({{ item.unit }})
                </template>
              </p>
              <template v-for="zone in item.zones" :key="zone.color">
                <div
                  class="scales-color"
                  v-if="zone.color && zone.label"
                  :style="`--color: ${zone.color}`"
                >
                  <b>
                    {{ zone.label[localeComputed] ? zone.label[localeComputed] : zone.label.en }}
                  </b>
                  (<template v-if="typeof zone.valueMax === 'number'">
                    {{ t("scales.upto") }} {{ zone.valueMax }}
                  </template>
                  <template v-else>{{ t("scales.above") }}</template
                  >)
                </div>
              </template>
            </template>
          </div>
        </div>

        <p class="textsmall">
          <template v-if="isRussia">{{ t("notice_with_fz") }}</template>
          <template v-else>{{ t("notice_without_fz") }}</template>
        </p>
      </section>

      <section>
        <h3>{{ t("sensorpopup.infotitle") }}</h3>
        <div class="infoline flexline" v-if="sensor_id">
          <div class="infoline-title">{{ t("sensorpopup.infosensorid") }}:</div>
          <div class="infoline-info">
            {{ filters.collapse(sensor_id) }}
            <Copy
              :msg="sensor_id"
              :title="`Sensor id: ${sensor_id}`"
              :notify="t('details.copied')"
            />
          </div>
        </div>

        <div class="infoline flexline" v-if="geo && geo.lat && geo.lng">
          <div class="infoline-title">{{ t("sensorpopup.infosensorgeo") }}:</div>
          <div class="infoline-info">
            <a 
              v-if="sensor_id"
              :href="getMapLink(geo.lat, geo.lng, `Air Sensor: ${sensor_id}` )"
              target="_blank"
            >{{ geo.lat }}, {{ geo.lng }}</a>
            <span v-else>{{ geo.lat }}, {{ geo.lng }}</span>
          </div>
        </div>

        <div class="infoline flexline" v-if="link">
          <div class="infoline-title">{{ t("sensorpopup.infosensorowner") }}:</div>
          <div class="infoline-info">
            <a :href="link" rel="noopener" target="_blank">{{ link }}</a>
          </div>
        </div>

        <div class="infoline flexline" v-if="donated_by">
          <div class="infoline-title">{{ t("sensorpopup.infosensordonated") }}:</div>
          <div class="infoline-info">{{ donated_by }}</div>
        </div>

        <div v-if="model === 3" class="infoline flexline">
          <div class="infoline-title">
            <label for="realtime"></label>
            <span class="sensors-switcher-text"> {{ t("details.showpath") }} </span>:
          </div>
          <div class="infoline-info">
            <input type="checkbox" id="realtime" v-model="state.isShowPath" />
          </div>
        </div>
      </section>

      <ReleaseInfo />
    </div>

    <button @click.prevent="closesensor" aria-label="Close sensor" class="close">
      <font-awesome-icon icon="fa-solid fa-xmark" />
    </button>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch, onMounted, getCurrentInstance } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { settings, sensors } from "@config";
import measurements from "../../measurements";
import { getTypeProvider } from "../../utils/utils";
import { getAddressByPos } from "../../utils/map/utils";
import { calculateAQIIndex } from '../../utils/aqiIndex';
import { dayISO, dayBoundsUnix } from '../../utils/date';

import AQIWidget from './AQIWidget.vue';
import Bookmark from "./Bookmark.vue";
import Chart from "./Chart.vue";
// import AnalysisChart from "./ChartAnalysis.vue";
import Copy from "./Copy.vue";
import ProviderType from "../ProviderType.vue";
import AltruistPromo from "../devices/altruist/AltruistPromo.vue";
import ReleaseInfo from "../ReleaseInfo.vue";
import Icon from "./Icon.vue";
// import Loader from "../Loader.vue";


const props = defineProps({
  type: String,
  point: Object,
  startTime: [Number, String],
});
const emit = defineEmits(["history", "close", 'getScope']);

// Глобальные объекты
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { proxy } = getCurrentInstance();
const filters = proxy.$filters;
const globalWindow = window;

// Единообразное описание локального состояния в одном реактивном объекте
const state = reactive({
  isShowPath: false,
  start: dayISO(),
  maxDate: dayISO(),
  provider: getTypeProvider(route.query),
  rttime: null,
  rtdata: [],
  sharedDefault: false,
  sharedLink: false,
  chartReady: false,
  // chartScopeReady: false,
  // monthLogLoading: false,
  // showAnalysisChart: false,
  // analysisType: null,
  lastCoords: { lat: null, lon: null },
  address: "",
  addressLoading: true,
  addressReqId: 0
});


// const prevGeo = ref({ lat: null, lng: null });
const units = ref([]);
const dewPoint = ref(null)


const sensor_id = computed(() => {
  return props.point?.sensor_id || route.query.sensor || null;
});

const localeComputed = computed(() => localStorage.getItem("locale") || locale.value || "en");

const geo = computed(() => {
  // Prefer sensor's own coordinates strictly
  if (props.point?.geo && Number(props.point.geo.lat) && Number(props.point.geo.lng)) {
    return { lat: Number(props.point.geo.lat), lng: Number(props.point.geo.lng) };
  }
  // Fallback to URL only if sensor does not provide valid coordinates
  const { lat, lng } = route.query;
  return { lat: Number(lat) || 0, lng: Number(lng) || 0 };
});

const donated_by = computed(() => props.point?.donated_by || null);

// Гарантируем, что log всегда массив
const log = computed(() => (Array.isArray(props.point?.log) ? props.point.log : []));
// const scopeLog = computed(() => (Array.isArray(props.point?.scopeLog) ? props.point.scopeLog : []));
const model = computed(() => props.point?.model || null);

const addressformatted = computed(() => {
  let parts = [];
  if (state.address && (state.address.length > 0 || Object.keys(state.address).length > 0)) {
    if (state.address.country) parts.push(state.address.country);
    if (Array.isArray(state.address.address) && state.address.address.length > 0) {
      // join address parts without leading comma when country is empty
      parts = parts.concat(state.address.address);
    }
  }
  return parts.join(", ");
});

const isRussia = computed(() => /^(RU|Россия|Russia)$/i.test(state.address?.country || ""));

const last = computed(() => (log.value.length > 0 ? log.value[log.value.length - 1] : {}));

const startTimestamp = computed(() => dayBoundsUnix(state.start).start);
const endTimestamp = computed(() => dayBoundsUnix(state.start).end);

const scales = computed(() => {
  const buffer = [];
  Object.keys(measurements).forEach((key) => {
    if (units.value.some((unit) => unit === key)) {
      if(measurements[key].zones) {
       buffer.push(measurements[key]);
      }
    }
  });
  
  return buffer.sort((a, b) => {
    const nameA = a.nameshort[localeComputed] || '';
    const nameB = b.nameshort[localeComputed] || '';
    return nameA.localeCompare(nameB);
  });
});

const linkSensor = computed(() => {
  if (geo.value?.lat && geo.value?.lng && sensor_id.value) {
    const resolved = router.resolve({
      name: "main",
      query: {
        provider: state.provider,
        type: route.query.type || settings.MAP.measure,
        zoom: route.query.zoom || settings.MAP.zoom,
        lat: geo.value.lat,
        lng: geo.value.lng,
        sensor: sensor_id.value,
      },
    });
    return new URL(resolved.href, window.location.origin).href;
  }
  return "";
});

const link = computed(() => {
  return sensors[sensor_id.value] ? sensors[sensor_id.value].link : "";
});

// checking log values for dew point
const latestValidLog = computed(() => {
  return [...log.value] // clone array to avoid mutating original
    .reverse()
    .find(entry => {
      const data = entry?.data;
      return typeof data?.temperature === 'number' && typeof data?.humidity === 'number';
    });
});

// methods

const shareData = () => {
  if (navigator.share) {
    navigator.share({
      title: settings.TITLE,
      url: linkSensor.value || link.value,
    });
  }
};

const shareLink = () => {
  navigator.clipboard
    .writeText(linkSensor.value)
    .then(() => {
      state.sharedLink = true;
      setTimeout(() => {
        state.sharedLink = false;
      }, 5000);
    })
    .catch((e) => console.error("Sensor's link not copied", e));
};

const getHistory = () => {
  if (state.provider === "realtime") return;

  state.chartReady = false;

  emit("history", {
    sensor_id: sensor_id.value,
    start: startTimestamp.value,
    end: endTimestamp.value,
  });
}

// const getScope = (type) => {
//   if (state.provider === "realtime") return;
//   state.chartScopeReady = false
//   state.monthLogLoading = true
//   state.showAnalysisChart = true
//   state.analysisType = type
//   emit("getScope", type);
// }

const calculateDewPoint = (t, h) => {
  if (typeof t !== 'number' || typeof h !== 'number' || h <= 0 || h > 100) {
    return null;
  }

  const a = 17.27;
  const b = 237.7;
  const gamma = (a * t) / (b + t) + Math.log(h / 100);
  const dewPoint = (b * gamma) / (a - gamma);

  return parseFloat(dewPoint.toFixed(2));

}

// Helpers to keep watchers concise
function enrichLogsWithDewPoint(logArr) {
  logArr.forEach(entry => {
    const data = entry?.data;
    if (data && typeof data.temperature === 'number' && typeof data.humidity === 'number') {
      const dew = calculateDewPoint(data.temperature, data.humidity);
      entry.data = { ...data, ['dewpoint']: dew };
    }
  });
}

function buildUnitsList(logArr) {
  const set = new Set();
  logArr.forEach(item => {
    if (item?.data) Object.keys(item.data).forEach(u => set.add(u.toLowerCase()));
  });
  // Add AQI scale if calculable for the available history
  const aqiVal = calculateAQIIndex(log.value);
  if (typeof aqiVal === 'number') set.add('aqi');
  return Array.from(set).sort();
}

// Updates the realtime view: refreshes the timestamp and rebuilds state.rtdata with the latest measurements, labels, units, and zone colors.
const updatert = () => {
  if (state.provider === "realtime" && log.value.length > 0) {
    const ts = last.value.timestamp * 1000;
    if (ts) {
      state.rttime = new Date(ts).toLocaleString();
    }
    const data = last.value.data;
    if (data) {
      state.rtdata = [];
      Object.keys(measurements).forEach((item) => {
        Object.keys(data).forEach((datakey) => {
          if (item === datakey) {
            const buffer = {
              key: datakey,
              measure: data[datakey],
              label: measurements[item].nameshort[localeComputed.value] || measurements[item].label,
              unit: measurements[item].unit,
              color: undefined,
            };
            const zones = measurements[item].zones;
            if (zones && zones.length) {
              const matchedZone = zones.find((z) => typeof z.valueMax === 'number' && buffer.measure < z.valueMax);
              if (matchedZone) {
                buffer.color = matchedZone.color;
              } else if (zones.length > 1) {
                const preLast = zones[zones.length - 2];
                if (typeof preLast?.valueMax === 'number' && buffer.measure > preLast.valueMax) {
                  buffer.color = zones[zones.length - 1].color;
                }
              }
            }
            state.rtdata.push(buffer);
          }
        });
      });
    }
  }
}

const closesensor = () => {
  try {
    router.replace({
      name: route.name,
      query: {
        provider: route.query.provider,
        type: route.query.type,
        zoom: route.query.zoom,
        lat: route.query.lat,
        lng: route.query.lng,
        // Убираем sensor из URL чтобы предотвратить автоматическое открытие
      },
    });
    emit("close");
    state.showAnalysisChart = false;
  } catch (error) {
    console.error('Error closing sensor:', error);
  }
};

function addressQuality(addr) {
  if (!addr) return -1;
  const arr = Array.isArray(addr.address) ? addr.address : [];
  const joined = arr.join(", ");
  // Highest: has street/house (more than one segment)
  if (arr.length >= 3) return 3;
  // City-level
  if (arr.length >= 1 && joined && isNaN(Number(joined))) return 2;
  // Only coordinates (contains digits and comma)
  if (arr.length === 1 && /-?\d+\.?\d*,\s*-?\d+\.?\d*/.test(arr[0])) return 0;
  return 1;
}

const setAddressUnrecognised = (lat, lng) => {
  const fallback = {
    country: null,
    address: [`${lat}, ${lng}`]
  };
  // Do not downgrade if we already have a better address
  if (addressQuality(fallback) > addressQuality(state.address)) {
    state.address = fallback;
  }
}

const ADDRESS_FALLBACK_DELAY_MS = 2000;
let addressFallbackTimer = null;

function scheduleAddressFallback(lat, lng, reqId, delay = ADDRESS_FALLBACK_DELAY_MS) {
  if (addressFallbackTimer) clearTimeout(addressFallbackTimer);
  addressFallbackTimer = setTimeout(() => {
    if (state.addressReqId !== reqId) return; // stale
    if (!state.address || Object.keys(state.address).length === 0) {
      setAddressUnrecognised(lat, lng);
      state.addressLoading = false;
    }
  }, delay);
}

async function requestAddressForGeo(newGeo) {
  if (!newGeo || !newGeo.lat || !newGeo.lng) {
    setAddressUnrecognised(newGeo?.lat || '', newGeo?.lng || '');
    state.addressLoading = false;
    return;
  }
  state.addressLoading = true;
  state.address = {};
  const currentReq = ++state.addressReqId;
  scheduleAddressFallback(newGeo.lat, newGeo.lng, currentReq);
  try {
    const res = await getAddressByPos(newGeo.lat, newGeo.lng, localeComputed.value);
    if (state.addressReqId !== currentReq) return; // stale
    if (res && Object.keys(res).length > 0) {
      state.address = res;
    } else {
      setAddressUnrecognised(newGeo.lat, newGeo.lng);
    }
  } catch (err) {
    console.error("Reverse geocoding error:", err);
    setAddressUnrecognised(newGeo.lat, newGeo.lng);
  } finally {
    if (state.addressReqId === currentReq) state.addressLoading = false;
  }
}

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

onMounted(() => {

  state.start = props.startTime ? dayISO(Number(props.startTime)) : dayISO();

  updatert();

});

// removed unused onUnmounted hook

watch(
  () => sensor_id.value,
  () => {
    state.isShowPath = false;
    // Force skeleton until fresh address is resolved for the new sensor
    state.addressLoading = true;
    state.address = {};
    if (geo.value?.lat && geo.value?.lng) {
      scheduleAddressFallback(geo.value.lat, geo.value.lng);
    }
  }
);
watch(
  () => state.start,
  () => {
    getHistory();
  }
);


watch(() => log.value, (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return;

    // enrich & update realtime view
    enrichLogsWithDewPoint(log.value);
    updatert();

    if (!state.chartReady) {
      state.chartReady = true;
      state.monthLogLoading = false;
    }

    // update units list for scales
    const nextUnits = buildUnitsList(arr);
    const prevUnits = units.value;
    const changed = nextUnits.length !== prevUnits.length || nextUnits.some((u, i) => u !== prevUnits[i]);
    if (changed) units.value = nextUnits;

    // last dew point
    if (latestValidLog.value) {
      const { temperature, humidity } = latestValidLog.value.data;
      dewPoint.value = calculateDewPoint(temperature, humidity);
    } else {
      console.warn('No valid log entry for dew point was found');
    }
  },
  { immediate: true }
);

// watcher for analysis chart (disabled)
// watch(() => scopeLog.value, (arr) => {
//     if (!Array.isArray(arr) || arr.length === 0) return;
//     enrichLogsWithDewPoint(arr);
//     if (!state.chartScopeReady) {
//       state.chartScopeReady = true;
//       state.monthLogLoading = false;
//     }
//     const nextUnits = buildUnitsList(arr);
//     const prevUnits = units.value;
//     const changed = nextUnits.length !== prevUnits.length || nextUnits.some((u, i) => u !== prevUnits[i]);
//     if (changed) units.value = nextUnits;
//   },
//   { immediate: true }
// );


// EN: Change URL for valid point if sensor_id is present and geo is okay
watch(
  () => props.point,
  (newPoint) => {
    if (newPoint && newPoint.sensor_id && newPoint.geo) {
      router.replace({
        name: route.name, // Assumes the route name remains the same
        query: {
          provider: state.provider,
          type: props.type.toLowerCase(),
          zoom: route.query.zoom || settings.MAP.zoom, // trying to keep zoom
          lat: newPoint.geo.lat,
          lng: newPoint.geo.lng,
          sensor: newPoint.sensor_id,
        },
      });
    }
  },
  { immediate: true, deep: true }
);

// EN: Change the address text if geo is changed
watch(
  () => geo.value,
  async (newGeo) => {
    // Only proceed if coordinates have actually changed
    if (
      newGeo?.lat !== state.lastCoords.lat ||
      newGeo?.lng !== state.lastCoords.lon
    ) {
      state.lastCoords.lat = newGeo?.lat || null;
      state.lastCoords.lon = newGeo?.lng || null;
      await requestAddressForGeo(newGeo);
    }
  },
  { immediate: true, deep: true });

</script>

<style scoped>
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
  max-height: 90%;
}

.close {
  border: 0;
  color: var(--color-dark);
  cursor: pointer;
  position: absolute;
  right: var(--gap);
  top: var(--gap);
}

.close:hover {
  color: var(--color-red);
}

.close svg {
  height: 2rem;
}

.monthly-analysis {
  margin-top: calc(var(--gap) * 3);
  margin-bottom: calc(var(--gap) * 2);
}

.monthly-analysis h2 {
  margin-bottom: calc(var(--gap) * 0.5);;
}

.monthly-analysis .flexline {
  margin-bottom: var(--gap);
}

.chart-wrapper {
  position: relative;
}

.monthly-scope-warning {
  position: absolute;
  top: 50%;
  left: 50%;
  font-weight: 600;
  transform: translateX(-50%);
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
    padding-right: calc(var(--gap) * 0.5);
    padding-top: calc(2rem + var(--gap));
  }

  .close {
    font-size: 2rem !important; 
  }

  /* .close {
    top: -35px;
    right: 10px;
    background-color: #fff;
    width: 40px;
    height: 40px;
  } */
}

@container popup (min-width: 400px) {
  .close {
    font-size: 1.8em;
  }
}

@container popup (max-width: 400px) {
  h3.flexline {
    max-width: calc(100% - var(--gap) * 3);
  }

  .close {
    font-size: 1.8em;
  }
}

.infoline.flexline {
  gap: calc(var(--gap) * 0.5);
}

.infoline-title {
  font-weight: bold;
}

/* shared container */
.shared-container button:first-of-type {
  margin-right: 10px;
}

/* removed unused .shared-container span styles */

@media screen and (max-width: 570px) {
  .shared-container {
    display: flex;
    /* flex-direction: column; */
    gap: 10px;
    padding-right: 10px;
  }
  .shared-container button:first-of-type {
    margin-right: 0;
    flex-shrink: 0;
  }

  .shared-container button {
    min-width: 20px;
    min-height: 20px;
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

.sensor-title {
  display: flex;
  gap: var(--gap);
  align-items: center;
}

.sensor-title span {
  font-size: inherit;
}
</style>
