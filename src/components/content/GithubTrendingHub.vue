<template>
  <section class="trending-hub">
    <div class="trending-hub-header">
      <div class="trending-hub-copy">
        <h2 class="trending-hub-title">GitHub 热门</h2>
        <p class="trending-hub-subtitle">
          浏览当前热门仓库，直接查看介绍、进入主页，或一键带着项目链接发起提问。
        </p>
      </div>
      <div class="trending-hub-toolbar">
        <ComposerDropdown
          class="trending-hub-scope-dropdown"
          :model-value="scope"
          :options="scopeOptions"
          @update:model-value="onScopeChange"
        />
        <button type="button" class="trending-hub-refresh" :disabled="isLoading" @click="emit('refresh')">
          {{ isLoading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <p v-if="isLoading" class="trending-hub-empty">正在加载热门项目...</p>
    <p v-else-if="projects.length === 0" class="trending-hub-empty">当前没有可展示的热门项目。</p>

    <div v-else class="trending-hub-grid">
      <article
        v-for="project in projects"
        :key="project.id"
        class="trending-card"
      >
        <div class="trending-card-head">
          <div class="trending-card-title-block">
            <p class="trending-card-kicker">热门仓库</p>
            <h3 class="trending-card-title" :title="project.fullName">
              <span class="trending-card-owner">{{ project.owner }}</span>
              <span class="trending-card-slash">/</span>
              <span class="trending-card-repo">{{ project.repo || project.fullName }}</span>
            </h3>
          </div>
          <div class="trending-card-metrics">
            <span v-if="project.languageLabel || project.language" class="trending-card-chip">
              {{ project.languageLabel || project.language }}
            </span>
            <span class="trending-card-chip">★ {{ formatStars(project.stars) }}</span>
          </div>
        </div>

        <div class="trending-card-body">
          <p class="trending-card-summary">
            {{ getPrimaryDescription(project) }}
          </p>

          <div v-if="showProjectDetails(project)" class="trending-card-details">
            <div
              v-if="hasOriginalDescription(project)"
              class="trending-card-detail-block"
            >
              <p class="trending-card-detail-label">原始介绍</p>
              <p class="trending-card-detail-text">{{ project.description.trim() }}</p>
            </div>
            <div
              class="trending-card-detail-block trending-card-detail-block-link"
              :class="{ 'trending-card-detail-block-muted': hasOriginalDescription(project) }"
            >
              <p class="trending-card-detail-label">仓库地址</p>
              <p class="trending-card-detail-text trending-card-url">{{ project.url }}</p>
            </div>
          </div>
        </div>

        <div class="trending-card-footer">
          <div class="trending-card-actions">
            <a
              class="trending-card-action trending-card-action-link"
              :href="project.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              进入主页
            </a>
            <button
              type="button"
              class="trending-card-action trending-card-action-primary"
              @click="emit('ask-project', project)"
            >
              询问
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { GithubTipsScope, GithubTrendingProject } from '../../api/codexGateway'

const ComposerDropdown = defineAsyncComponent(() => import('./ComposerDropdown.vue'))

const props = defineProps<{
  projects: GithubTrendingProject[]
  isLoading: boolean
  scope: GithubTipsScope
  scopeOptions: Array<{ value: GithubTipsScope; label: string }>
}>()

const emit = defineEmits<{
  'update:scope': [value: string]
  'refresh': []
  'ask-project': [project: GithubTrendingProject]
}>()

function onScopeChange(value: string): void {
  emit('update:scope', value)
}

function formatStars(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function getPrimaryDescription(project: GithubTrendingProject): string {
  return project.descriptionZh?.trim() || project.description.trim() || '暂无介绍。'
}

function hasOriginalDescription(project: GithubTrendingProject): boolean {
  const translated = project.descriptionZh?.trim() ?? ''
  const original = project.description.trim()
  return Boolean(translated && original && translated !== original)
}

function showProjectDetails(project: GithubTrendingProject): boolean {
  return hasOriginalDescription(project) || project.url.trim().length > 0
}
</script>

<style scoped>
@reference "tailwindcss";

.trending-hub {
  @apply flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-3 py-1 sm:px-4;
  padding-bottom: max(1.75rem, calc(env(safe-area-inset-bottom) + 1.25rem));
  -webkit-overflow-scrolling: touch;
}

.trending-hub-header {
  @apply flex flex-col gap-3 rounded-[28px] border border-[#e3d8c8] bg-[linear-gradient(135deg,#fffaf2_0%,#f8f4ec_100%)] px-4 py-4 sm:px-5;
}

.trending-hub-copy {
  @apply flex flex-col gap-1;
}

.trending-hub-title {
  @apply m-0 text-[1.65rem] font-semibold leading-tight text-[#1f2937];
}

.trending-hub-subtitle {
  @apply m-0 text-sm leading-6 text-[#6d6354];
}

.trending-hub-toolbar {
  @apply flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between;
}

.trending-hub-scope-dropdown {
  @apply w-full sm:max-w-60;
}

.trending-hub-refresh {
  @apply inline-flex items-center justify-center rounded-2xl border border-[#d6c9b6] bg-white px-4 py-2 text-sm font-medium text-[#4f463b] transition-colors duration-100 hover:border-[#bca98d] hover:bg-[#f7f1e5] disabled:cursor-not-allowed disabled:opacity-60;
}

.trending-hub-empty {
  @apply m-0 rounded-2xl border border-dashed border-[#ddd5c7] bg-[#faf6ef] px-4 py-5 text-sm text-[#7b7062];
}

.trending-hub-grid {
  @apply grid gap-3 md:grid-cols-2 xl:grid-cols-3;
}

.trending-card {
  @apply flex min-h-[18rem] flex-col rounded-[24px] border border-[#e3d8c8] bg-white px-4 py-4 shadow-[0_14px_35px_-28px_rgba(31,41,55,0.28)];
}

.trending-card-head {
  @apply flex flex-col gap-3;
}

.trending-card-title-block {
  @apply min-w-0 flex flex-col gap-1;
}

.trending-card-kicker {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a8062];
}

.trending-card-title {
  @apply m-0 min-w-0 text-lg font-semibold leading-6 text-[#1f2937] break-words;
}

.trending-card-owner,
.trending-card-slash {
  @apply text-[#9a8062];
}

.trending-card-repo {
  @apply text-[#1f2937];
}

.trending-card-metrics {
  @apply flex flex-wrap gap-2;
}

.trending-card-chip {
  @apply inline-flex items-center rounded-full border border-[#e5d6bf] bg-[#fbf6ec] px-2.5 py-1 text-xs text-[#6d6354];
}

.trending-card-body {
  @apply mt-4 flex-1 flex flex-col gap-3;
}

.trending-card-summary {
  @apply m-0 text-sm leading-6 text-[#423a31];
}

.trending-card-details {
  @apply flex flex-col gap-3 rounded-2xl bg-[#faf6ef] px-3.5 py-3;
}

.trending-card-detail-block {
  @apply flex flex-col gap-1;
}

.trending-card-detail-block-muted {
  @apply border-t border-[#e8decf] pt-3;
}

.trending-card-detail-block-link {
  @apply border-t border-[#e8decf] pt-3;
}

.trending-card-detail-label {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a8062];
}

.trending-card-detail-text {
  @apply m-0 text-sm leading-6 text-[#544a3d] break-words;
}

.trending-card-url {
  @apply text-[#0f766e];
}

.trending-card-footer {
  @apply mt-4 flex flex-col gap-3 border-t border-[#efe5d7] pt-3;
}

.trending-card-actions {
  @apply flex flex-wrap gap-2;
}

.trending-card-action {
  @apply inline-flex items-center justify-center rounded-2xl border px-3.5 py-2 text-sm font-medium transition-colors duration-100;
}

.trending-card-action-link {
  @apply border-[#d6c9b6] bg-white text-[#4f463b] hover:border-[#bca98d] hover:bg-[#f7f1e5];
}

.trending-card-action-primary {
  @apply border-[#0f766e] bg-[#0f766e] text-white hover:border-[#0b5e58] hover:bg-[#0b5e58];
}
</style>
