<template>
  <form @submit.prevent="saveBookmark">
    <input
      type="text"
      v-model="bookmarkName"
      :placeholder="t('sensorpopup.bookmarkplaceholder')"
      :disabled="isBookmarked && !isEditing"
    />
    <div class="flexline">
      <button
        v-if="!isBookmarked"
        type="submit"
        class="button"
        :aria-label="t('sensorpopup.bookmarkbutton')"
        :title="t('sensorpopup.bookmarkbutton')"
      >
        <font-awesome-icon icon="fa-solid fa-bookmark" />
      </button>
      <button
        v-if="isBookmarked && !isEditing"
        type="button"
        class="button"
        @click.prevent="startEditing"
        :aria-label="t('sensorpopup.editbookmark') || 'Edit bookmark'"
        :title="t('sensorpopup.editbookmark') || 'Edit bookmark'"
      >
        <font-awesome-icon icon="fa-solid fa-pencil" />
      </button>
      <button
        v-if="isEditing"
        type="submit"
        :class="['button', { 'button-green': !hasUnsavedChanges }]"
        :disabled="!hasUnsavedChanges"
        :aria-label="t('sensorpopup.savebookmark') || 'Save bookmark'"
        :title="t('sensorpopup.savebookmark') || 'Save bookmark'"
      >
        <font-awesome-icon v-if="hasUnsavedChanges" icon="fa-solid fa-floppy-disk" />
        <font-awesome-icon v-else icon="fa-solid fa-check" />
      </button>
      <button
        v-if="isBookmarked"
        type="button"
        class="button button-red"
        @click.prevent="deleteBookmark"
        :aria-label="t('sensorpopup.deletebookmark') || 'Delete bookmark'"
        :title="t('sensorpopup.deletebookmark') || 'Delete bookmark'"
      >
        <font-awesome-icon icon="fa-solid fa-trash" />
      </button>
    </div>
  </form>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSensorBookmark } from "@/composables/useBookmarks";

const props = defineProps({
  point: {
    type: Object,
    default: null,
  },
});

const { t } = useI18n();

const sensorId = computed(() => props.point?.sensor_id ?? null);

const {
  isBookmarked,
  bookmarkName,
  isEditing,
  startEditing,
  saveBookmark,
  deleteBookmark,
  savedBookmarkName,
} = useSensorBookmark(() => props.point, {
  defaultName: () => props.point?.address || sensorId.value || "",
});

const hasUnsavedChanges = computed(
  () => isEditing.value && bookmarkName.value !== savedBookmarkName.value
);
</script>

<style scoped>
form {
  width: 100%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--gap);
}

button {
  padding-right: calc(var(--app-inputpadding) * 2);
  padding-left: calc(var(--app-inputpadding) * 2);
  height: 100%;
}
</style>
