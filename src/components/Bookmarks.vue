<template>
  <template v-if="!schema">
    <!-- База данных не настроена -->
  </template>
  <template v-else-if="!bookmarks || bookmarks.length < 1">
    {{ $t("bookmarks.listempty") }}
  </template>
  <div class="bookmarkslist" v-else>
    <section v-for="bookmark in bookmarks" :key="bookmark.id" class="flexline">
      <a :href="getlink(bookmark)" @click.prevent="showsensor(bookmark)">
        <b v-if="bookmark?.name" class="name">{{ bookmark.name }}</b>
      </a>
      <button title="Remove this sensor" @click.prevent="deletebookmark(bookmark.id)">
        <font-awesome-icon icon="fa-solid fa-xmark" />
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useBookmarks, removeBookmarkById, isLegacyBookmarkRecord } from "@/composables/useBookmarks";
import { idbschemas } from "@config";

const schema = idbschemas?.Sensors;

const router = useRouter();
const route = useRoute();
const { idbBookmarks, idbBookmarkGet, watchBookmarks } = useBookmarks();
const bookmarks = computed(() => idbBookmarks.value);

async function deletebookmark(id) {
  await removeBookmarkById(id);
}

function getlink(bookmark) {
  if (!bookmark?.id) return "#";

  const query = { ...route.query };

  if (!isLegacyBookmarkRecord(bookmark) && bookmark.lat != null && bookmark.lng != null) {
    query.lat = String(bookmark.lat);
    query.lng = String(bookmark.lng);
    query.zoom = query.zoom || "18";
    if (bookmark.owner) {
      query.owner = bookmark.owner;
    } else {
      delete query.owner;
    }
    if (bookmark.sensorId) {
      query.sensor = bookmark.sensorId;
    }
  } else {
    query.sensor = bookmark.id;
  }

  return router.resolve({
    name: "main",
    query,
  }).href;
}

function showsensor(bookmark) {
  const href = getlink(bookmark);
  if (!href || href === "#") return;
  window.location.replace(href);
}

let stopWatch = null;

onMounted(async () => {
  await idbBookmarkGet();
  stopWatch = watchBookmarks();
});

onUnmounted(() => {
  if (typeof stopWatch === "function") stopWatch();
});
</script>

<style scoped>
a,
a b {
  display: block;
}

.addresssm {
  color: var(--app-textcolor);
  font-size: 0.7em;
}

section {
  justify-content: space-between;
}

section:not(:last-child) {
  padding-bottom: calc(var(--gap) / 2);
  margin-bottom: calc(var(--gap) / 2);
  border-bottom: 1px solid var(--app-textcolor);
}

button {
  border: 0;
  cursor: pointer;
  font-size: 1.2em;
  transition: color 0.2s ease-in;
}
button:hover {
  color: var(--color-red);
}

.bookmarkslist {
  max-height: 70svh;
  overflow-y: auto;
}
</style>
