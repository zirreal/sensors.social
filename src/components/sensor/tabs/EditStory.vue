<template>
  <section class="story-editor">
    <header class="story-hero">
      <h3>{{ $t("Stories") }}</h3>
      <p class="owner-hint" v-if="!isOwnerLoggedIn">
        {{ $t("Only sensor owner can add stories for this sensor.") }}
      </p>
      <p class="owner-hint" v-else>
        {{ $t("Share your insights with the community!") }}
      </p>
    </header>

    <div v-if="statusMessage" :class="['status', statusType]">
      {{ statusMessage }}
    </div>

    <p v-if="isCheckingAuth" class="owner-hint">{{ $t("Checking login state...") }}</p>

    <template v-else-if="!hasAnyLoggedAccounts">
      <div>
        <p class="owner-hint">{{ $t("Please login first.") }}</p>
        <div class="actions">
          <router-link to="/login/" class="button">{{ $t("Login") }}</router-link>
        </div>
      </div>
    </template>

    <button
      v-else-if="step === 'idle' && isOwnerLoggedIn"
      class="button"
      :disabled="!ownerAddress"
      @click.prevent="startForm"
    >
      {{ $t("Add story") }}
    </button>

    <form v-if="step === 'form'" class="card stack story-form" @submit.prevent="saveStory">
      <h4 class="card-title">{{ $t("Add a story") }}</h4>

      <label class="field">
        <div class="field-head">
          <span class="field-title">{{ $t("Story date") }}</span>
          <span class="field-meta">{{ $t("from chart") }}</span>
        </div>
        <input v-model="storyDate" type="date" />
      </label>

      <label class="field">
        <div class="field-head">
          <span class="field-title">{{ $t("Short comment") }}</span>
          <span class="field-meta">{{ storyComment.length }}/280</span>
        </div>
        <textarea
          v-model.trim="storyComment"
          rows="3"
          maxlength="280"
          placeholder="E.g. “Dust storm — PM10 was off the charts.”"
        ></textarea>
      </label>

      <div class="icon-wrapper">
        <div class="field-title">{{ $t("Pick an icon") }}</div>
        <div class="image-grid">
          <label
            v-for="item in STORY_ICONS"
            :key="item.id"
            class="image-option"
            :class="{ selected: selectedIconId === item.id }"
          >
            <input v-model="selectedIconId" type="radio" name="story-icon" :value="item.id" />
            <font-awesome-icon
              :icon="item.icon"
              class="story-icon"
              :style="{ color: iconColor(item.id) }"
            />
            <span>{{ item.title }}</span>
          </label>
        </div>
      </div>

      <div class="actions">
        <button class="button" type="submit" :disabled="!canSubmitStory || isSubmitting">
          <template v-if="isSubmitting">{{ $t("Publishing…") }}</template>
          <template v-else>{{ $t("Publish") }}</template>
        </button>
        <button
          class="button button-round-outline"
          type="button"
          @click.prevent="resetFlow"
          aria-label="Cancel"
        >
          <font-awesome-icon icon="fa-solid fa-xmark" />
        </button>
      </div>
    </form>

    <div v-if="visibleStories.length" class="stories-list">
      <h4 class="card-title">{{ $t("Stories for this sensor") }}</h4>
      <article v-for="story in visibleStories" :key="story.id" class="story-card">
        <div
          v-if="story.icon"
          class="story-icon-badge"
          :style="{ '--badge-color': iconColor(story.iconId) }"
          aria-hidden="true"
        >
          <font-awesome-icon
            :icon="story.icon"
            class="story-icon story-icon-large"
            :style="{ color: iconColor(story.iconId) }"
          />
        </div>
        <img v-else :src="story.imageSrc" :alt="story.imageTitle" />
        <div>
          <p>{{ story.message || story.comment }}</p>
          <small>
            {{ $t("Posted") }} {{ formatDate(story.createdAt) }}
            <span v-if="story.date"> · {{ story.date }}</span>
            <button
              v-if="story.date"
              class="story-jump"
              type="button"
              @click="openStoryDate(story)"
            >
              {{ $t("Open") }}
            </button>
          </small>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { encodeAddress, decodeAddress } from "@polkadot/util-crypto";
import { settings } from "@config";
import { useAccounts } from "@/composables/useAccounts";
import { useMap } from "@/composables/useMap";
import { usePolkadotApi } from "robonomics-interface-vue";
import { stringToHex, hexToU8a } from "@polkadot/util";
import Keyring from "@polkadot/keyring";
import { datalog } from "robonomics-interface";
import { dayISO } from "@/utils/date";
import { getMapAddressZoom } from "@/utils/map/defaultView";
import {
  fetchStoryList,
  getStoriesForSensor,
  isStoryHidden,
  preferredUnitByStoryIcon,
  normalizeBackendStory,
  unwrapBackendStoryPayload,
  upsertStory,
} from "@/composables/useStories";

const { t: $t } = useI18n();

const STORY_ICONS = [
  { id: "heat", title: "Heat wave", icon: "fa-solid fa-temperature-high" },
  { id: "cold", title: "Cold snap", icon: "fa-solid fa-temperature-low" },
  { id: "smog", title: "High PM / Smog", icon: "fa-solid fa-smog" },
  { id: "wind", title: "Wind / Dust", icon: "fa-solid fa-wind" },
  { id: "noise", title: "Noise / Loud", icon: "fa-solid fa-volume-high" },
  { id: "storm", title: "Storm", icon: "fa-solid fa-bolt-lightning" },
  { id: "rain", title: "Heavy rain", icon: "fa-solid fa-cloud-rain" },
  { id: "sun", title: "Clear day", icon: "fa-solid fa-cloud-sun" },
  { id: "fire", title: "Fire / Smoke", icon: "fa-solid fa-fire" },
  { id: "co2", title: "CO₂ / Emissions", icon: "fa-solid fa-cloud-arrow-up" },
  { id: "note", title: "Note", icon: "fa-regular fa-comment" },
];

// Compact icon codes for on-chain payload size (1–2 chars).
const ICON_CODE_BY_ID = {
  heat: "h",
  cold: "c",
  smog: "s",
  wind: "w",
  noise: "n",
  storm: "t",
  rain: "r",
  sun: "u",
  fire: "f",
  co2: "2",
  note: "o",
};

const ICON_ID_BY_CODE = Object.fromEntries(
  Object.entries(ICON_CODE_BY_ID).map(([id, code]) => [code, id])
);

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

const props = defineProps({
  sensorId: {
    type: String,
    required: true,
  },
  owner: {
    type: String,
    default: "",
  },
  geo: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["open-chart"]);

const step = ref("idle");
const storyComment = ref("");
const selectedIconId = ref(STORY_ICONS[0].id);
const storyDate = ref("");
const statusMessage = ref("");
const statusType = ref("info");
const stories = ref([]);
const isCheckingAuth = ref(false);
const isSubmitting = ref(false);
const lastTxHash = ref("");

let lastStoryTimestampMs = 0;

const visibleStories = computed(() =>
  (Array.isArray(stories.value) ? stories.value : []).filter((s) => !isStoryHidden(s))
);

const accountStore = useAccounts();
const mapState = useMap();
const router = useRouter();
const { isConnected, instance } = usePolkadotApi();
const keyring = new Keyring({ ss58Format: 32 });
const accountsList = computed(() =>
  Array.isArray(accountStore.accounts?.value) ? accountStore.accounts.value : []
);

const ownerAddress = computed(() => normalizeAddress(props.owner));
const hasAnyLoggedAccounts = computed(() => accountsList.value.length > 0);
const isOwnerLoggedIn = computed(() => {
  const owner = ownerAddress.value;
  if (!owner) return false;
  return accountsList.value.some((acc) => normalizeAddress(acc?.address) === owner);
});
const canSubmitStory = computed(() => storyComment.value.length > 0 && !!selectedIconId.value);

watch(
  () => props.sensorId,
  () => {
    resetFlow();
    loadStories();
    refreshBackendStory();
    refreshBackendStoriesList();
    refreshAuthState();
  },
  { immediate: true }
);

watch(
  () => props.owner,
  () => {
    refreshAuthState();
  }
);

function normalizeAddress(address) {
  const value = String(address || "").trim();
  if (!value) return "";
  try {
    return encodeAddress(decodeAddress(value), 32);
  } catch {
    return value;
  }
}

function startForm() {
  if (!isOwnerLoggedIn.value) return;
  statusMessage.value = "";
  statusType.value = "info";
  storyDate.value = mapState.currentDate?.value || "";
  step.value = "form";
}

function resetFlow(clearStatus = true) {
  step.value = "idle";
  storyComment.value = "";
  selectedIconId.value = STORY_ICONS[0].id;
  storyDate.value = "";
  if (clearStatus) {
    statusMessage.value = "";
    statusType.value = "info";
  }
}

async function refreshAuthState() {
  isCheckingAuth.value = true;
  try {
    await accountStore.getAccounts();
  } catch {
    // silent
  } finally {
    isCheckingAuth.value = false;
  }
}

function loadStories() {
  stories.value = getStoriesForSensor(props.sensorId);
}

async function fetchLastStoryFromBackend(sensorId) {
  const raw = settings?.REMOTE_PROVIDER;
  if (raw == null || String(raw).trim() === "") {
    return null;
  }
  const base = String(raw).replace(/\/+$/, "");
  const url = `${base}/api/v2/story/last/${encodeURIComponent(sensorId)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || typeof data !== "object") return null;
  if (data.error) return null;
  return data;
}

async function refreshBackendStoriesList() {
  const sid = props.sensorId;
  if (!sid) return false;

  try {
    const { list } = await fetchStoryList({ limit: 50, page: 1 });
    const records = Array.isArray(list) ? list : [];

    let mergedAny = false;
    for (const rec of records) {
      const sensorId = rec?.sensor_id || rec?.sensorId;
      if (sensorId !== sid) continue;

      const normalized = normalizeBackendStory(rec);
      if (!normalized) continue;

      const iconObj =
        STORY_ICONS.find((i) => i.id === normalized.iconId) || STORY_ICONS[STORY_ICONS.length - 1];

      const backendStory = {
        id: normalized.id,
        backendKey: normalized.backendKey,
        sensorId: normalized.sensorId,
        owner: normalized.owner || ownerAddress.value,
        geo: props.geo ? { lat: props.geo.lat, lng: props.geo.lng } : null,
        date: normalized.date || "",
        timestamp: normalized.timestamp,
        message: normalized.message || "",
        comment: normalized.message || "",
        iconId: iconObj.id,
        iconTitle: iconObj.title,
        icon: iconObj.icon,
        createdAt: normalized.createdAt,
        test: false,
        source: "backend",
      };

      const merged = upsertStory(sid, backendStory, { dedupeKey: backendStory.backendKey });
      if (merged) mergedAny = true;
    }

    if (mergedAny) {
      loadStories();
      return true;
    }
  } catch {
    // silent
  }

  return false;
}

async function refreshBackendStory() {
  const sid = props.sensorId;
  if (!sid) return;
  try {
    const raw = await fetchLastStoryFromBackend(sid);
    const record = unwrapBackendStoryPayload(raw);
    if (!record) return;

    const normalized = normalizeBackendStory({
      ...record,
      sensor_id: record.sensor_id || record.sensorId || sid,
    });
    if (!normalized) return;

    const iconObj =
      STORY_ICONS.find((i) => i.id === normalized.iconId) || STORY_ICONS[STORY_ICONS.length - 1];

    const backendStory = {
      id: normalized.id,
      backendKey: normalized.backendKey,
      sensorId: sid,
      owner: normalized.owner || ownerAddress.value,
      geo: props.geo ? { lat: props.geo.lat, lng: props.geo.lng } : null,
      date: normalized.date || "",
      timestamp: normalized.timestamp,
      message: normalized.message || "",
      comment: normalized.message || "",
      iconId: iconObj.id,
      iconTitle: iconObj.title,
      icon: iconObj.icon,
      createdAt: normalized.createdAt,
      test: false,
      source: "backend",
    };

    const merged = upsertStory(sid, backendStory, { dedupeKey: backendStory.backendKey });
    if (merged) {
      loadStories();
      return true;
    }
  } catch {
    // silent
  }
  return false;
}

async function waitForBackendIndexing({ timeoutMs = 45000 }) {
  const start = Date.now();
  let delay = 1500;
  while (Date.now() - start < timeoutMs) {
    const merged = (await refreshBackendStory()) || (await refreshBackendStoriesList());
    if (merged) return true;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(7000, Math.floor(delay * 1.4));
  }
  return false;
}

async function saveStory() {
  if (!canSubmitStory.value) return;
  if (!isOwnerLoggedIn.value) return;

  const selectedIcon =
    STORY_ICONS.find((item) => item.id === selectedIconId.value) || STORY_ICONS[0];
  const date = storyDate.value || mapState.currentDate?.value || "";
  const message = storyComment.value;
  let ts = Date.now();
  if (ts <= lastStoryTimestampMs) ts = lastStoryTimestampMs + 1;
  lastStoryTimestampMs = ts;

  const owner = ownerAddress.value;
  const ownerAcc = accountsList.value.find((acc) => normalizeAddress(acc?.address) === owner);
  const phrase = ownerAcc?.phrase;

  if (!phrase) {
    statusType.value = "error";
    statusMessage.value = $t("Missing account secret phrase for signing.");
    return;
  }

  statusType.value = "info";
  statusMessage.value = $t("Sending story…");
  isSubmitting.value = true;
  lastTxHash.value = "";

  const ownerSensors = await accountStore.getUserSensors(owner);
  if (!Array.isArray(ownerSensors) || !ownerSensors.includes(props.sensorId)) {
    statusType.value = "error";
    statusMessage.value = $t("This account has no subscription for this sensor.");
    isSubmitting.value = false;
    return;
  }

  try {
    if (!isConnected.value) {
      await instance.connect();
    }

    const pair = keyring.addFromMnemonic(phrase.trim());
    // Required for stories indexing: send with subscription set
    if (!instance.account) {
      throw new Error("Account subsystem is not ready");
    }
    instance.account.setSender(pair);
    instance.account.useSubscription(pair.address);

    const dataStory = stringToHex(
      JSON.stringify({
        message,
        sensor: props.sensorId,
        model: 5,
        timestamp: ts,
        date, // explicit (YYYY-MM-DD) for linking
        i: ICON_CODE_BY_ID[selectedIcon.id] || selectedIcon.id,
      })
    );

    if (hexToU8a(data).byteLength > 512) {
      statusType.value = "error";
      statusMessage.value = "Unsupported characters were used or the comment is too long.";
      isSubmitting.value = false;
      return;
    }

    const call = datalog.action.write(instance.api, dataStory);

    const nonce = await instance.api.rpc.system.accountNextIndex(pair.address);
    const res = await instance.account.signAndSend(call, { nonce });
    lastTxHash.value = res?.tx?.hash?.toHex?.() || res?.tx?.hash?.toString?.() || "";
  } catch (e) {
    statusType.value = "error";
    statusMessage.value = e?.message || "Failed to send story.";
    isSubmitting.value = false;
    return;
  }

  const newStory = {
    id: `bk:${owner}:${props.sensorId}:${ts}`,
    backendKey: `bk:${owner}:${props.sensorId}:${ts}`,
    sensorId: props.sensorId,
    owner: ownerAddress.value,
    geo: props.geo ? { lat: props.geo.lat, lng: props.geo.lng } : null,
    date,
    timestamp: ts,
    message,
    comment: message,
    iconId: selectedIcon.id,
    iconTitle: selectedIcon.title,
    icon: selectedIcon.icon,
    createdAt: new Date(ts).toISOString(),
    source: "local",
  };
  upsertStory(props.sensorId, newStory, { dedupeKey: newStory.backendKey });
  loadStories();

  statusType.value = "success";
  statusMessage.value = lastTxHash.value
    ? `${$t("Story sent")} (tx: ${lastTxHash.value}). ${$t("Waiting for indexing…")}`
    : $t("Story sent. Waiting for indexing…");
  resetFlow(false);

  const merged = await waitForBackendIndexing({ sensorId: props.sensorId });
  if (merged) {
    statusType.value = "success";
    statusMessage.value = $t("Story added successfully.");
  } else {
    statusType.value = "info";
    statusMessage.value = lastTxHash.value
      ? `${$t("Story sent")} (tx: ${lastTxHash.value}). ${$t("Indexing may take a minute.")}`
      : $t("Story sent. Indexing may take a minute.");
  }
  isSubmitting.value = false;
}

function iconColor(id) {
  return ICON_COLORS[id] || "currentColor";
}

function storyLink(story) {
  const geo = story?.geo || null;
  const hasGeo =
    geo?.lat != null &&
    geo?.lng != null &&
    Number.isFinite(Number(geo.lat)) &&
    Number.isFinite(Number(geo.lng));
  // Stories always point to historical data, which is only available in `remote`.
  const provider = "remote";
  const suggestedType = preferredUnitByStoryIcon(story?.iconId);
  const type = suggestedType || mapState.currentUnit?.value || settings.MAP.measure;
  const ts = story?.timestamp;
  const derivedDay =
    story?.date || (ts != null && !Number.isNaN(Number(ts)) ? dayISO(Number(ts)) : null);

  return {
    name: "main",
    query: {
      provider,
      type,
      ...(derivedDay ? { date: derivedDay } : {}),
      ...(ts != null ? { timestamp: String(ts) } : {}),
      ...(hasGeo ? { zoom: getMapAddressZoom(), lat: geo.lat, lng: geo.lng } : {}),
      sensor: story?.sensorId || props.sensorId,
    },
  };
}

async function openStoryDate(story) {
  try {
    sessionStorage.setItem("story_nav_set_date", "1");
  } catch {
    // silent
  }
  await router.push(storyLink(story));
  // Ensure user immediately sees the date change in the chart.
  emit("open-chart");
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
</script>

<style scoped>
.story-editor {
  display: grid;
  gap: calc(var(--gap) * 0.7);
  padding-bottom: calc(var(--gap) * 2 + env(safe-area-inset-bottom, 0px));
}

.story-hero h3 {
  margin: 0;
}

.owner-hint {
  opacity: 0.8;
  margin: 0;
  margin-bottom: calc(var(--gap) * 0.5);
}

.story-jump {
  margin-left: calc(var(--gap) * 0.4);
  font-weight: 800;
  text-decoration: none;
  color: var(--color-blue);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.story-jump:hover {
  text-decoration: underline;
}

.card {
  background: var(--color-light);
  padding: var(--pad-md);
}

.card-title {
  font-weight: 900;
  margin: 0;
  padding-bottom: calc(var(--gap) * 0.5);
  margin-bottom: calc(var(--gap) * 0.7);
  text-transform: uppercase;
  border-bottom: 1px solid #333;
}

.story-form {
  margin-bottom: calc(var(--gap) * 2);
}

.stack {
  display: grid;
  gap: calc(var(--gap) * 0.9);
}

.field {
  display: grid;
  gap: calc(var(--gap) * 0.5);
}

textarea {
  resize: vertical;
  resize: none;
}

.field-title {
  font-weight: 700;
  margin-bottom: calc(var(--gap) * 0.35);
}

.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(var(--gap) * 0.35);
}

.field-meta {
  opacity: 0.6;
  font-size: calc(var(--font-size) * 1);
  font-weight: 700;
}

.field-help {
  font-size: calc(var(--font-size) * 1.02);
  opacity: 0.7;
}

textarea {
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: var(--radius-md);
  padding: var(--pad-sm) var(--pad-md);
  font: inherit;
  background: rgba(0, 0, 0, 0.01);
}

textarea:focus {
  outline: none;
  border-color: var(--color-blue);
}

.actions {
  display: flex;
  gap: calc(var(--gap) * 0.4);
  flex-wrap: wrap;
}

.status {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}

.status.info {
  background: rgba(80, 120, 255, 0.1);
}

.status.success {
  background: rgba(40, 170, 85, 0.12);
  color: var(--color-green);
}

.status.error,
.error {
  background: rgba(220, 70, 70, 0.1);
  color: var(--color-red);
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}

.icon-wrapper {
  margin-bottom: var(--gap);
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: calc(var(--gap) * 0.6);
}

.image-option {
  aspect-ratio: 1 / 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: center;
  justify-items: center;
  padding: calc(var(--gap) * 0.6) calc(var(--gap) * 0.5);
  border-radius: 15px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-light);
  cursor: pointer;
  position: relative;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease,
    background 0.12s ease;
}

.image-option:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.image-option:active {
  transform: scale(0.96);
}

.image-option.selected {
  border-color: var(--color-blue);
  background: rgba(80, 120, 255, 0.08);
  box-shadow: 0 0 0 1px var(--color-blue);
}

.image-option input {
  display: none;
}

.image-option span {
  font-size: calc(var(--font-size) * 0.8);
  line-height: 1.2;
  color: var(--color-gray);
  text-align: center;
  margin-top: calc(var(--gap) * 0.4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.image-option .story-icon {
  opacity: 0.55;
}

.image-option.selected .story-icon {
  opacity: 1;
}

.story-icon {
  width: 42px;
  height: 42px;
}

.story-icon-large {
  width: 40px;
  height: 40px;
}

.story-icon-badge {
  width: 70px;
  height: 70px;
  border-radius: 100%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--badge-color) 14%, transparent);
}

.stories-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

.stories-list h4 {
  margin-bottom: calc(var(--gap) * 0.8);
  display: grid;
  gap: calc(var(--gap) * 0.75);
}

.story-card {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  gap: var(--gap);
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  padding: calc(var(--gap) * 0.7);
  background: #fff;
}

.story-card img {
  width: 40px;
  height: 40px;
}

.story-card p {
  font-weight: 600;
  margin: 0 0 0.35rem 0;
}
</style>
