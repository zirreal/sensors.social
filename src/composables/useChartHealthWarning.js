import { computed, toValue, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMap } from "@/composables/useMap";
import { useSensors } from "@/composables/useSensors";
import measurements from "@/measurements";
import { enumeratePeriodDates } from "@/utils/date";
import {
  checkAllLogsHealthForVisiblePeriod,
  isLogsHealthCategoryUnhealthy,
  loadLogsHealth,
  resolveUnhealthyMetricIds,
  unhealthyMetricIdsForVisiblePeriod,
  useLogsHealth,
} from "@/utils/calculations/sensor/logs_health.js";

/** Chart legend group key → logsHealth aggregate key. */
const LEGEND_TO_HEALTH = {
  dust: "pm",
  climate: "climate",
  noise: "noise",
};

/** Single metric id → logsHealth aggregate key. */
const UNIT_TO_HEALTH = {
  pm10: "pm",
  pm25: "pm",
  temperature: "climate",
  humidity: "climate",
  noise: "noise",
  noiseavg: "noise",
  noisemax: "noise",
};

function healthCategoryForChart(legendKey, currentUnit) {
  return LEGEND_TO_HEALTH[legendKey] || UNIT_TO_HEALTH[currentUnit] || null;
}

function metricDisplayName(unitId, locale) {
  const id = String(unitId || "").toLowerCase();
  if (!id) return "";
  const entry = measurements[id];
  if (!entry) return "";
  return entry.nameshort?.[locale] || entry.name?.[locale] || entry.name?.en || "";
}

/**
 * Chart health warning: visibility and metric labels for the active legend tab.
 * @param {{ log: import('vue').MaybeRefOrGetter<Array>, sensorId: import('vue').MaybeRefOrGetter<string>, legendKey: import('vue').MaybeRefOrGetter<string|null> }} sources
 */
export function useChartHealthWarning(sources) {
  const { locale } = useI18n();
  const mapState = useMap();
  const { runLogsHealth } = useSensors();
  const { logsHealth, logsHealthMeta } = useLogsHealth();

  const reloadContext = () => ({
    currentDate: mapState.currentDate.value,
    timelineMode: mapState.timelineMode.value,
  });

  watch(
    () => [
      runLogsHealth.value,
      toValue(sources.sensorId),
      toValue(sources.log)?.length ?? 0,
      mapState.currentDate.value,
      mapState.timelineMode.value,
    ],
    ([enabled, sensorId]) => {
      if (!enabled || !sensorId) return;
      void loadLogsHealth(sensorId, toValue(sources.log), reloadContext());
    },
    { immediate: true }
  );

  const popoverId = computed(
    () => `chart-health-warning-${String(toValue(sources.sensorId) || "sensor")}`
  );

  const logsHealthUi = computed(() => (runLogsHealth.value ? logsHealth.value : null));

  const sensorUserHidden = computed(() =>
    Boolean(
      logsHealthMeta.value?.userhide &&
        logsHealthMeta.value?.sensorId != null &&
        String(logsHealthMeta.value.sensorId) === String(toValue(sources.sensorId))
    )
  );

  const hasChartData = computed(() => {
    const log = toValue(sources.log);
    return Array.isArray(log) && log.length > 0;
  });

  const activeHealthCategory = computed(() =>
    healthCategoryForChart(toValue(sources.legendKey), mapState.currentUnit.value)
  );

  const visibleDates = computed(() =>
    enumeratePeriodDates(mapState.currentDate.value, mapState.timelineMode.value)
  );

  const unhealthyMetricLabels = computed(() => {
    if (!runLogsHealth.value) return [];

    const healthCat = activeHealthCategory.value;
    if (!healthCat) return [];

    const log = toValue(sources.log);
    const logArr = Array.isArray(log) && log.length > 1 ? log : null;
    const fromAggregate = logsHealthUi.value?.[healthCat];
    const dates = visibleDates.value;
    const fromLog = logArr
      ? checkAllLogsHealthForVisiblePeriod(logArr, dates)[healthCat]
      : null;

    // Chart logs are the source of truth for the open popup; IDB is fallback only.
    if (logArr) {
      if (!isLogsHealthCategoryUnhealthy(fromLog)) return [];
      return unhealthyMetricIdsForVisiblePeriod(healthCat, logArr, dates)
        .map((id) => metricDisplayName(id, locale.value))
        .filter(Boolean);
    }

    if (!isLogsHealthCategoryUnhealthy(fromAggregate)) return [];
    return resolveUnhealthyMetricIds(healthCat, fromAggregate, null)
      .map((id) => metricDisplayName(id, locale.value))
      .filter(Boolean);
  });

  const metricsLabel = computed(() => unhealthyMetricLabels.value.join(", "));

  const visible = computed(
    () =>
      hasChartData.value &&
      unhealthyMetricLabels.value.length > 0 &&
      !sensorUserHidden.value
  );

  return {
    visible,
    metricsLabel,
    popoverId,
    sensorUserHidden,
  };
}
