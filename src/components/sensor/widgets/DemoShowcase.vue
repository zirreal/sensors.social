<template>
  <section
    v-if="showSummary && demoItems.length"
    class="demo-summary"
    :aria-label="t('sensorpopup.current_readings')"
  >
    <header class="demo-summary__head">
      <h3 class="demo-summary__title">{{ t("sensorpopup.current_readings") }}</h3>
      <router-link
        class="demo-summary__info"
        to="/air-measurements/"
        :title="t('links.measurement')"
        :aria-label="t('links.measurement')"
      >
        <font-awesome-icon icon="fa-solid fa-circle-info" />
      </router-link>
    </header>
    <div class="demo-summary__grid">
      <article
        v-for="item in demoItems"
        :key="`sum-${item.key}`"
        class="demo-summary__item"
        :class="{ 'demo-summary__item--pair': isPair(item) }"
        :style="{ '--zone-color': item.color }"
      >
        <span class="demo-summary__icon" aria-hidden="true">
          <font-awesome-icon :icon="item.icon || 'fa-solid fa-chart-simple'" />
        </span>
        <span class="demo-summary__body">
          <span class="demo-summary__name">{{ item.name }}</span>
          <template v-if="isPair(item)">
            <span
              v-for="part in item.parts"
              :key="`sum-part-${part.key}`"
              class="demo-summary__zone"
              :style="{ '--zone-color': part.color }"
            >
              {{ part.zoneLabel }}
              <small>{{ part.name }}</small>
            </span>
          </template>
          <span v-else class="demo-summary__zone">{{ item.zoneLabel }}</span>
          <span v-if="item.hint" class="demo-summary__meta">{{ item.hint }}</span>
        </span>
      </article>
    </div>
  </section>

  <section v-else-if="showMetrics && demoItems.length" class="demo-board">
    <div class="demo-metrics" :class="{ 'demo-metrics--wide': isWide }">
      <article
        v-for="item in demoItems"
        :key="item.key"
        class="demo-metric"
        :class="{
          'demo-metric--pair': isPair(item),
          'demo-metric--fill': isFill(item),
          'is-active': !isPair(item) && isActive(item.key),
        }"
        :style="{ '--zone-color': item.color }"
      >
        <header class="demo-metric__head">
          <span class="demo-metric__icon" aria-hidden="true">
            <font-awesome-icon :icon="item.icon || 'fa-solid fa-chart-simple'" />
          </span>
          <span class="demo-metric__name">{{ item.name }}</span>
          <span v-if="isPair(item)" class="demo-metric__icon demo-metric__icon--end" aria-hidden="true">
            <font-awesome-icon :icon="item.icon || 'fa-solid fa-chart-simple'" />
          </span>
        </header>

        <div v-if="isPair(item)" class="demo-metric__pair">
          <button
            v-for="part in item.parts"
            :key="part.key"
            type="button"
            class="demo-metric__half"
            :class="{ 'is-active': isActive(part.key) }"
            :style="{ '--zone-color': part.color }"
            :aria-label="`${item.name}, ${part.name}: ${part.displayValue} ${part.unit}, ${part.zoneLabel}`"
            :aria-pressed="isActive(part.key) ? 'true' : 'false'"
            @click="selectMetric(part.key)"
          >
            <span class="demo-metric__value">{{ part.displayValue }}</span>
            <span class="demo-metric__part-name">
              {{ part.name }}<span v-if="part.unit" class="demo-metric__part-unit">{{ part.unit }}</span>
            </span>
          </button>
        </div>

        <button
          v-else
          type="button"
          class="demo-metric__hit"
          :aria-label="`${item.name}: ${item.displayValue} ${item.unit}, ${item.zoneLabel}`"
          :aria-pressed="isActive(item.key) ? 'true' : 'false'"
          @click="selectMetric(item.key)"
        >
          <span class="demo-metric__value">
            {{ item.displayValue }}<span v-if="item.unit" class="demo-metric__unit">{{ item.unit }}</span>
          </span>
          <span class="demo-metric__track" aria-hidden="true">
            <span class="demo-metric__fill" :style="{ width: `${item.progress ?? 0}%` }"></span>
          </span>
        </button>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useMap } from "@/composables/useMap";
import { useCurrentReadings } from "@/composables/useCurrentReadings";
import { MEASUREMENT_GROUP_LOOKUP } from "@/measurements/groups";

const props = defineProps({
  log: { type: Array, default: null },
  point: { type: Object, default: null },
  part: {
    type: String,
    default: "metrics",
  },
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const mapState = useMap();
const { demoItems } = useCurrentReadings(
  () => props.log,
  () => props.point
);

const showMetrics = computed(() => props.part === "metrics");
const showSummary = computed(() => props.part === "summary");

function isPair(item) {
  return Array.isArray(item?.parts) && item.parts.length > 1;
}

const isWide = computed(() => {
  const pairIdx = demoItems.value.findIndex(isPair);
  return pairIdx >= 3;
});

function isFill(item) {
  const list = demoItems.value;
  const pairIdx = list.findIndex(isPair);
  if (pairIdx <= 0) return false;
  const before = list.slice(0, pairIdx);
  if (before.length % 2 === 0) return false;
  return item.key === before[before.length - 1]?.key;
}

function isActive(key) {
  const unit = String(mapState.currentUnit.value || "").toLowerCase();
  if (unit === key) return true;
  const group = MEASUREMENT_GROUP_LOOKUP[key];
  const unitGroup = MEASUREMENT_GROUP_LOOKUP[unit];
  return Boolean(group && unitGroup && group === unitGroup);
}

function selectMetric(key) {
  mapState.setMapSettings(route, router, { type: key });
}
</script>

<style scoped>
.demo-board {
  container: demo-board / inline-size;
  margin: 0 0 calc(var(--gap) * 1.25);
}

.demo-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.demo-metrics--wide {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.demo-metric {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--color-light);
}

.demo-metric--pair {
  grid-column: 1 / -1;
  min-width: 0;
  border-color: color-mix(in srgb, var(--zone-color) 40%, rgba(0, 0, 0, 0.08));
}

.demo-metric--fill {
  grid-column: 1 / -1;
}

.demo-metrics--wide .demo-metric--fill {
  grid-column: auto;
}

@container demo-board (max-width: 520px) {
  .demo-metrics--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-metrics--wide .demo-metric--fill {
    grid-column: 1 / -1;
  }
}

.demo-metric:hover {
  border-color: rgba(0, 0, 0, 0.22);
}

.demo-metric.is-active,
.demo-metric:has(.is-active) {
  border-color: color-mix(in srgb, var(--zone-color) 70%, #000);
}

.demo-metric__head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45rem;
  padding: 0.8rem 0.85rem 0;
}

.demo-metric--pair .demo-metric__head {
  padding: 0.8rem 0.85rem 0.15rem;
}

.demo-metric__name {
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.demo-metric__icon {
  display: grid;
  place-items: center;
  width: 1.85rem;
  height: 1.85rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--zone-color) 18%, #fff);
  color: var(--zone-color);
  font-size: 0.78rem;
}

.demo-metric__icon--end {
  margin-left: auto;
}

.demo-metric__hit,
.demo-metric__half {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28rem;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0.55rem 0.85rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.demo-metric__hit {
  flex: 1;
}

.demo-metric__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-width: 0;
  padding-bottom: 0.55rem;
}

.demo-metric__half + .demo-metric__half {
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}

.demo-metric--pair .demo-metric__half {
  align-items: center;
  justify-content: center;
  padding: 0.65rem 0.9rem;
  text-align: center;
}

.demo-metric__value {
  display: flex;
  align-items: baseline;
  max-width: 100%;
  overflow: hidden;
  font-size: clamp(2.4rem, 34cqw, 4.4rem);
  font-weight: 800;
  line-height: 0.92;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: color-mix(in srgb, var(--zone-color) 72%, #161616);
}

.demo-metric--pair .demo-metric__value {
  font-size: clamp(3.4rem, 38cqw, 6.2rem);
  justify-content: center;
}

@container demo-board (max-width: 690px) {
  .demo-metric__value {
    font-size: clamp(2.7rem, 40cqw, 4.8rem);
  }

  .demo-metric--pair .demo-metric__value {
    font-size: clamp(3rem, 34cqw, 5.4rem);
  }
}

.demo-metric__unit {
  margin-left: 0.12em;
  font-size: 0.32em;
  font-weight: 700;
  letter-spacing: 0;
  opacity: 0.85;
}

.demo-metric__part-name {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.4em;
  font-size: 0.78rem;
  font-weight: 600;
  opacity: 0.45;
}

.demo-metric__part-unit {
  font-weight: 500;
}

.demo-metric__track {
  align-self: stretch;
  box-sizing: content-box;
  display: block;
  width: auto;
  height: 5px;
  margin: auto -0.85rem 0;
  padding-top: 1.15rem;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.08);
  background-clip: content-box;
}

.demo-metric__fill {
  display: block;
  height: 100%;
  min-width: 0.4rem;
  background: var(--zone-color);
}

.demo-summary {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0.95rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: var(--color-light);
}

.demo-summary__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.demo-summary__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  opacity: 1;
}

.demo-summary__info {
  display: grid;
  place-items: center;
  color: rgba(0, 0, 0, 0.35);
  font-size: 0.85rem;
  line-height: 1;
  text-decoration: none;
}

.demo-summary__info:hover {
  color: var(--color-dark);
}

.demo-summary__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.55rem;
}

@container (max-width: 800px) {
  .demo-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media screen and (max-width: 800px) {
  .demo-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 420px) {
  .demo-summary {
    padding: 0.7rem;
  }

  .demo-summary__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media screen and (max-width: 420px) {
  .demo-summary {
    padding: 0.7rem;
  }

  .demo-summary__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.demo-summary__item {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  min-width: 0;
  padding: 0.75rem 0.8rem;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-light);
  box-shadow: none;
}

.demo-summary__item--pair {
  min-width: 0;
}

.demo-summary__icon {
  display: grid;
  place-items: center;
  width: 2.35rem;
  height: 2.35rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--zone-color) 16%, #fff);
  color: var(--zone-color);
  font-size: 0.95rem;
}

@media screen and (max-width: 420px) {
  .demo-summary__icon {
    width: 1.9rem;
    height: 1.9rem;
    font-size: 0.8rem;
  }
}

.demo-summary__body {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.demo-summary__name {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0;
  opacity: 0.48;
}

.demo-summary__zone {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-wrap: balance;
  color: color-mix(in srgb, var(--zone-color) 68%, #161616);
}

.demo-summary__zone small {
  display: inline-block;
  margin-left: 0.35em;
  font-size: 0.72em;
  font-weight: 600;
  opacity: 0.45;
}

.demo-summary__meta {
  font-size: 0.78rem;
  font-weight: 500;
  overflow-wrap: anywhere;
  opacity: 0.45;
}
</style>
