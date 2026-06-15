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
import { useBookmarks, removeSensorBookmark } from "@/composables/useBookmarks";
import { idbschemas } from "@config";
// import { getTypeProvider } from "@/utils/utils"; // deprecated

const schema = idbschemas?.Sensors;

const router = useRouter();
const route = useRoute();
const { idbBookmarks, idbBookmarkGet, watchBookmarks } = useBookmarks();
const bookmarks = computed(() => idbBookmarks.value);

async function deletebookmark(id) {
  await removeSensorBookmark(id);
}

function getlink(bookmark) {
  if (!bookmark?.id) return "#";

  // Берем все параметры из текущего URL и меняем только sensor
  return router.resolve({
    name: "main",
    query: {
      ...route.query, // Все текущие параметры URL
      sensor: bookmark.id, // Используем id вместо link
    },
  }).href;
}

function showsensor(bookmark) {
  const href = getlink(bookmark);
  if (!href || href === "#") return;
  // Полная навигация с заменой записи в истории и принудительным перезапуском приложения
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
