<template>
  <header class="content-header">
    <div class="content-header-main">
      <div class="content-leading">
        <slot name="leading" />
      </div>
      <div class="content-title-wrap">
        <h1 class="content-title">{{ title }}</h1>
        <slot name="subtitle" />
      </div>
      <div class="content-actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="hasMeta" class="content-meta">
      <slot name="meta" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

defineProps<{
  title: string
}>()

const slots = useSlots()
const hasMeta = computed(() => Boolean(slots.meta))
</script>

<style scoped>
@reference "tailwindcss";

.content-header {
  @apply sticky top-0 z-20 w-full flex flex-col gap-1 px-3 sm:px-4 pt-2 sm:pt-2 pb-2 border-b border-[#e8dfcf] bg-[#fcfbf8]/96;
}

.content-header-main {
  @apply w-full min-h-10 sm:min-h-11 flex items-center gap-2 sm:gap-2.5;
}

.content-title {
  @apply m-0 min-w-0 truncate text-[15px] sm:text-[16px] font-semibold leading-5 text-[#1f2937];
  letter-spacing: -0.01em;
}

.content-title-wrap {
  @apply min-w-0 flex-1 flex flex-col gap-0.5;
}

.content-actions {
  @apply flex items-center justify-end gap-2;
}

.content-leading {
  @apply flex items-center gap-1;
}

.content-meta {
  @apply flex flex-wrap items-center gap-1.5 min-h-0;
}

@media (max-width: 767px) {
  .content-header {
    padding-top: max(0.5rem, env(safe-area-inset-top));
  }
}
</style>
