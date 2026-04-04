<template>
  <aside class="api-panel-root">
    <header class="api-panel-header">
      <h2 class="api-panel-title">AppServer 接口</h2>
      <p class="api-panel-count">{{ methods.length }} 个方法</p>
    </header>

    <p v-if="isLoading" class="api-panel-loading">正在加载方法目录...</p>

    <ul v-else class="api-method-list">
      <li v-for="method in methods" :key="method" class="api-method-item">
        <code class="api-method-code">{{ method }}</code>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  methods: string[]
  isLoading: boolean
}>()
</script>

<style scoped>
@reference "tailwindcss";

.api-panel-root {
  @apply h-full min-h-0 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col;
}

.api-panel-header {
  @apply pb-3 border-b border-slate-200;
}

.api-panel-title {
  @apply m-0 text-lg font-semibold text-slate-900;
}

.api-panel-count {
  @apply m-0 mt-1 text-xs text-slate-500;
}

.api-panel-loading {
  @apply mt-3 mb-0 text-sm text-slate-500;
}

.api-method-list {
  @apply mt-3 list-none m-0 p-0 overflow-y-auto min-h-0 flex-1 flex flex-col gap-1;
}

.api-method-item {
  @apply m-0;
}

.api-method-code {
  @apply block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700;
}
</style>
