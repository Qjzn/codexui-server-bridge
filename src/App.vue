<template>
  <a class="skip-to-content" href="#main-content">跳到主要内容</a>
  <DesktopLayout :is-sidebar-collapsed="isSidebarCollapsed" @close-sidebar="setSidebarCollapsed(true)">
    <template #sidebar>
      <section class="sidebar-root">
        <div class="sidebar-scrollable">
          <SidebarThreadControls
            v-if="!isSidebarCollapsed"
            class="sidebar-thread-controls-host"
            :is-sidebar-collapsed="isSidebarCollapsed"
            :show-new-thread-button="true"
            @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
            @start-new-thread="onStartNewThreadFromToolbar"
          >
            <button
              class="sidebar-search-toggle"
              type="button"
              :aria-pressed="isSidebarSearchVisible"
              aria-label="搜索会话"
              title="搜索会话"
              @click="toggleSidebarSearch"
            >
              <IconTablerSearch class="sidebar-search-toggle-icon" />
            </button>
            <button
              class="sidebar-toolbar-pill"
              type="button"
              :disabled="!hasUnreadThreads"
              :aria-disabled="!hasUnreadThreads"
              title="清除当前列表里的未读标记"
              @click="onMarkAllThreadsRead"
            >
              全部已读
            </button>
          </SidebarThreadControls>

          <div v-if="!isSidebarCollapsed && isSidebarSearchVisible" class="sidebar-search-bar">
            <IconTablerSearch class="sidebar-search-bar-icon" />
            <input
              ref="sidebarSearchInputRef"
              v-model="sidebarSearchQuery"
              class="sidebar-search-input"
              type="text"
              placeholder="筛选会话..."
              @keydown="onSidebarSearchKeydown"
            />
            <button
              v-if="sidebarSearchQuery.length > 0"
              class="sidebar-search-clear"
              type="button"
              aria-label="清空搜索"
              @click="clearSidebarSearch"
            >
              <IconTablerX class="sidebar-search-clear-icon" />
            </button>
          </div>

          <div v-if="!isSidebarCollapsed" class="sidebar-explore-nav">
            <button
              class="sidebar-skills-link"
              :class="{ 'is-active': isSkillsRoute }"
              type="button"
              @click="router.push({ name: 'skills' }); isMobile && setSidebarCollapsed(true)"
            >
              技能中心
            </button>
            <button
              v-if="showGithubTrendingProjects"
              class="sidebar-skills-link"
              :class="{ 'is-active': isGithubTrendingRoute }"
              type="button"
              @click="router.push({ name: 'github-trending' }); isMobile && setSidebarCollapsed(true)"
            >
              GitHub 热门
            </button>
          </div>

          <SidebarThreadTree :groups="projectGroups" :project-display-name-by-id="projectDisplayNameById"
            v-if="!isSidebarCollapsed"
            :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads"
            :search-query="sidebarSearchQuery"
            :search-matched-thread-ids="serverMatchedThreadIds"
            @select="onSelectThread"
            @archive="onArchiveThread" @start-new-thread="onStartNewThread" @rename-project="onRenameProject"
            @browse-thread-files="onBrowseThreadFiles"
            @rename-thread="onRenameThread"
            @fork-thread="onForkThread"
            @remove-project="onRemoveProject" @reorder-project="onReorderProject"
            @export-thread="onExportThread" />
        </div>

        <div v-if="!isSidebarCollapsed" ref="sidebarSettingsAreaRef" class="sidebar-settings-area">
          <Transition name="settings-panel">
            <div v-if="isSettingsOpen" class="sidebar-settings-panel">
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.sendWithEnter" @click="toggleSendWithEnter">
                <span class="sidebar-settings-label">发送需按 ⌘ + Enter</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': !sendWithEnter }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.appearance" @click="cycleDarkMode">
                <span class="sidebar-settings-label">外观</span>
                <span class="sidebar-settings-value">{{ darkMode === 'system' ? '跟随系统' : darkMode === 'dark' ? '深色' : '浅色' }}</span>
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationClickToToggle" @click="toggleDictationClickToToggle">
                <span class="sidebar-settings-label">点击切换听写</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationClickToToggle }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationAutoSend" @click="toggleDictationAutoSend">
                <span class="sidebar-settings-label">听写后自动发送</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationAutoSend }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.rollbackCommits" @click="toggleWorktreeGitAutomation">
                <span class="sidebar-settings-label">回滚时提交变更</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': worktreeGitAutomationEnabled }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.githubTrendingProjects" @click="toggleGithubTrendingProjects">
                <span class="sidebar-settings-label">GitHub 热门项目</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': showGithubTrendingProjects }" />
              </button>
              <div class="sidebar-settings-row sidebar-settings-row--select" :title="SETTINGS_HELP.dictationLanguage">
                <span class="sidebar-settings-label">听写语言</span>
                <ComposerDropdown
                  class="sidebar-settings-language-dropdown"
                  :model-value="dictationLanguage"
                  :options="dictationLanguageOptions"
                  placeholder="自动识别"
                  open-direction="up"
                  :enable-search="true"
                  search-placeholder="搜索语言..."
                  @update:model-value="onDictationLanguageChange"
                />
              </div>
              <button class="sidebar-settings-row" type="button" aria-live="polite" @click="onConnectTelegramBot">
                <span class="sidebar-settings-label">Telegram</span>
                <span class="sidebar-settings-value">{{ telegramStatusText }}</span>
              </button>
              <button
                class="sidebar-settings-row"
                type="button"
                :title="desktopRefreshButtonTitle"
                :disabled="!isDesktopRefreshAvailable || isDesktopRefreshRunning"
                @click="onRefreshDesktopApp"
              >
                <span class="sidebar-settings-label">刷新桌面端</span>
                <span class="sidebar-settings-value">{{ desktopRefreshButtonLabel }}</span>
              </button>
              <div class="sidebar-settings-rate-limits">
                <RateLimitStatus :snapshots="accountRateLimitSnapshots" />
              </div>
              <div class="sidebar-settings-build-label" aria-label="Worktree name and version">
                WT {{ worktreeName }} · v{{ appVersion }}
              </div>
            </div>
          </Transition>
          <button class="sidebar-settings-button" type="button" @click="isSettingsOpen = !isSettingsOpen">
            <IconTablerSettings class="sidebar-settings-icon" />
            <span>设置</span>
          </button>
        </div>
      </section>
    </template>

    <template #content>
      <section id="main-content" class="content-root" tabindex="-1">
        <ContentHeader :title="contentTitle">
          <template #subtitle>
            <p v-if="headerSubtitle" class="content-header-subtitle">{{ headerSubtitle }}</p>
          </template>
          <template #leading>
            <SidebarThreadControls
              v-if="isSidebarCollapsed || isMobile"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isSidebarCollapsed"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @start-new-thread="onStartNewThreadFromToolbar"
            />
          </template>
          <template #meta>
            <div class="content-status-strip" aria-live="polite">
              <span class="content-status-pill" :data-tone="serviceStatusTone">
                <span class="content-status-pill-label">服务</span>
                <span>{{ serviceStatusLabel }}</span>
              </span>
              <span v-if="threadStatusLabel" class="content-status-pill" :data-tone="threadStatusTone">
                <span class="content-status-pill-label">会话</span>
                <span>{{ threadStatusLabel }}</span>
              </span>
              <span class="content-status-pill" :data-tone="desktopStatusTone">
                <span class="content-status-pill-label">客户端</span>
                <span>{{ desktopStatusLabel }}</span>
              </span>
              <span v-if="serviceStatusDetail" class="content-status-detail">{{ serviceStatusDetail }}</span>
            </div>
          </template>
        </ContentHeader>

        <section class="content-body">
          <template v-if="isSkillsRoute">
            <SkillsHub @skills-changed="onSkillsChanged" />
          </template>
          <template v-else-if="isGithubTrendingRoute">
            <GithubTrendingHub
              :projects="trendingProjects"
              :is-loading="isTrendingProjectsLoading"
              :scope="githubTipsScope"
              :scope-options="githubTipsScopeOptions"
              @update:scope="onGithubTipsScopeChange"
              @refresh="onRefreshTrendingProjects"
              @ask-project="onAskTrendingProject"
            />
          </template>
          <template v-else-if="isHomeRoute">
            <div class="content-grid">
              <div class="new-thread-empty">
                <p class="new-thread-hero">开始任务</p>
                <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd"
                  :options="newThreadFolderOptions" placeholder="选择目录"
                  :enable-search="true"
                  search-placeholder="搜索项目"
                  :show-add-action="true"
                  add-action-label="+ 新建项目"
                  :default-add-value="defaultNewProjectName"
                  add-placeholder="项目名或绝对路径"
                  :disabled="false" @update:model-value="onSelectNewThreadFolder"
                  @add="onAddNewProject" />
                <ComposerRuntimeDropdown
                  class="new-thread-runtime-dropdown"
                  v-model="newThreadRuntime"
                />
                <div
                  v-if="worktreeInitStatus.phase !== 'idle'"
                  class="worktree-init-status"
                  :class="{
                    'is-running': worktreeInitStatus.phase === 'running',
                    'is-error': worktreeInitStatus.phase === 'error',
                  }"
                >
                  <strong class="worktree-init-status-title">{{ worktreeInitStatus.title }}</strong>
                  <span class="worktree-init-status-message">{{ worktreeInitStatus.message }}</span>
                </div>
              </div>

                <ThreadComposer ref="homeThreadComposerRef" :active-thread-id="composerThreadContextId"
                :cwd="composerCwd"
                :models="availableModelIds" :selected-model="selectedModelId"
                :selected-reasoning-effort="selectedReasoningEffort"
                :selected-speed-mode="selectedSpeedMode"
                :is-updating-speed-mode="isUpdatingSpeedMode"
                :skills="installedSkills"
                :is-turn-in-progress="false"
                :is-interrupting-turn="false" :send-with-enter="sendWithEnter"
                :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                :prepend-draft-request="rollbackDraftPrependRequest"
                :dictation-language="dictationLanguage"
                @submit="onSubmitThreadMessage"
                @update:selected-model="onSelectModel"
                @update:selected-reasoning-effort="onSelectReasoningEffort"
                @update:selected-speed-mode="onSelectSpeedMode" />
            </div>
          </template>
          <template v-else>
            <div class="content-grid">
              <div class="content-thread">
                <ThreadConversation :messages="displayedThreadMessages" :is-loading="isLoadingMessages"
                  :active-thread-id="displayedThreadConversationId" :cwd="displayedThreadCwd" :scroll-state="displayedThreadScrollState"
                  :live-overlay="displayedThreadLiveOverlay"
                  :pending-requests="displayedThreadPendingRequests"
                  :is-thread-switching="isThreadContentSwitching"
                  :show-empty-thread-actions="isRouteOnlyEmptyThread"
                  :is-turn-in-progress="isSelectedThreadInProgress"
                  :is-rolling-back="isRollingBack"
                  @update-scroll-state="onUpdateThreadScrollState"
                  @respond-server-request="onRespondServerRequest"
                  @return-to-new-thread="onReturnToNewThreadFromEmptyThread"
                  @dismiss-empty-thread="onDismissEmptyThread"
                  @rollback="onRollback" />
              </div>

              <div class="composer-with-queue">
                <QueuedMessages
                  :messages="selectedThreadQueuedMessages"
                  :is-processing="selectedThreadQueueProcessing"
                  @edit="onEditQueuedMessage"
                  @quote="quoteQueuedMessage"
                  @delete="removeQueuedMessage"
                />
                <ThreadComposer ref="threadComposerRef" :active-thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  :models="availableModelIds"
                  :selected-model="selectedModelId"
                  :selected-reasoning-effort="selectedReasoningEffort"
                  :selected-speed-mode="selectedSpeedMode"
                  :is-updating-speed-mode="isUpdatingSpeedMode"
                  :skills="installedSkills"
                  :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn"
                  :has-queue-above="selectedThreadQueuedMessages.length > 0"
                  :send-with-enter="sendWithEnter"
                  :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                  :prepend-draft-request="rollbackDraftPrependRequest"
                  :dictation-language="dictationLanguage"
                  @submit="onSubmitThreadMessage" @update:selected-model="onSelectModel"
                  @update:selected-reasoning-effort="onSelectReasoningEffort"
                  @update:selected-speed-mode="onSelectSpeedMode"
                  @interrupt="onInterruptTurn" />
              </div>
            </div>
          </template>
        </section>
      </section>
    </template>
  </DesktopLayout>

  <Teleport to="body">
    <div
      v-if="isDesktopRefreshConfirmVisible"
      class="desktop-refresh-confirm-overlay"
      @click.self="closeDesktopRefreshConfirm"
    >
      <div class="desktop-refresh-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-refresh-confirm-title">
        <p class="desktop-refresh-confirm-kicker">确认刷新客户端</p>
        <h2 id="desktop-refresh-confirm-title" class="desktop-refresh-confirm-title">
          {{ desktopRefreshConfirmTitle }}
        </h2>
        <p class="desktop-refresh-confirm-text">
          {{ desktopRefreshConfirmMessage }}
        </p>
        <div class="desktop-refresh-confirm-actions">
          <button class="desktop-refresh-confirm-button" type="button" @click="closeDesktopRefreshConfirm">
            取消
          </button>
          <button
            class="desktop-refresh-confirm-button desktop-refresh-confirm-button-primary"
            :class="{ 'desktop-refresh-confirm-button-warning': isDesktopRefreshRiskHigh }"
            type="button"
            @click="confirmDesktopRefresh"
          >
            {{ isDesktopRefreshRiskHigh ? '仍然刷新' : '刷新桌面端' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadConversation from './components/content/ThreadConversation.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import QueuedMessages from './components/content/QueuedMessages.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerSettings from './components/icons/IconTablerSettings.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import { useDesktopState } from './composables/useDesktopState'
import { useMobile } from './composables/useMobile'
import {
  configureTelegramBot,
  createWorktree,
  getDesktopAppStatus,
  getGithubProjectsForScope,
  getHomeDirectory,
  getProjectRootSuggestion,
  getThreadRuntimeSnapshot,
  getTelegramStatus,
  getWorkspaceRootsState,
  openProjectRoot,
  refreshDesktopApp,
  searchThreads,
} from './api/codexGateway'
import type { ReasoningEffort, SpeedMode, ThreadScrollState, UiLiveOverlay, UiMessage, UiServerRequest } from './types/codex'
import type { ComposerDraftPayload, ThreadComposerExposed } from './components/content/ThreadComposer.vue'
import type { DesktopAppStatus, GithubTipsScope, GithubTrendingProject, TelegramStatus } from './api/codexGateway'
import { getPathLeafName, getPathParent } from './pathUtils.js'

const SkillsHub = defineAsyncComponent(() => import('./components/content/SkillsHub.vue'))
const GithubTrendingHub = defineAsyncComponent(() => import('./components/content/GithubTrendingHub.vue'))
const RateLimitStatus = defineAsyncComponent(() => import('./components/content/RateLimitStatus.vue'))
const ComposerRuntimeDropdown = defineAsyncComponent(() => import('./components/content/ComposerRuntimeDropdown.vue'))

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codex-web-local.sidebar-collapsed.v1'
const worktreeName = import.meta.env.VITE_WORKTREE_NAME ?? 'unknown'
const appVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
const SETTINGS_HELP = {
  sendWithEnter: '开启后直接按 Enter 发送，关闭后使用 Command + Enter 发送。',
  appearance: '在跟随系统、浅色和深色之间切换。',
  dictationClickToToggle: '改为点击开始、点击结束听写，而不是按住说话。',
  dictationAutoSend: '录音结束后自动发送转写内容。',
  rollbackCommits: '开启后每条消息都会生成回滚提交，回滚时会重置到该消息之前的提交。',
  githubTrendingProjects: '显示或隐藏侧栏里的 GitHub 热门页面入口。',
  dictationLanguage: '选择转写语言，或保持自动识别。',
} as const
const WHISPER_LANGUAGES: Record<string, string> = {
  en: 'english',
  zh: 'chinese',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  ko: 'korean',
  fr: 'french',
  ja: 'japanese',
  pt: 'portuguese',
  tr: 'turkish',
  pl: 'polish',
  ca: 'catalan',
  nl: 'dutch',
  ar: 'arabic',
  sv: 'swedish',
  it: 'italian',
  id: 'indonesian',
  hi: 'hindi',
  fi: 'finnish',
  vi: 'vietnamese',
  he: 'hebrew',
  uk: 'ukrainian',
  el: 'greek',
  ms: 'malay',
  cs: 'czech',
  ro: 'romanian',
  da: 'danish',
  hu: 'hungarian',
  ta: 'tamil',
  no: 'norwegian',
  th: 'thai',
  ur: 'urdu',
  hr: 'croatian',
  bg: 'bulgarian',
  lt: 'lithuanian',
  la: 'latin',
  mi: 'maori',
  ml: 'malayalam',
  cy: 'welsh',
  sk: 'slovak',
  te: 'telugu',
  fa: 'persian',
  lv: 'latvian',
  bn: 'bengali',
  sr: 'serbian',
  az: 'azerbaijani',
  sl: 'slovenian',
  kn: 'kannada',
  et: 'estonian',
  mk: 'macedonian',
  br: 'breton',
  eu: 'basque',
  is: 'icelandic',
  hy: 'armenian',
  ne: 'nepali',
  mn: 'mongolian',
  bs: 'bosnian',
  kk: 'kazakh',
  sq: 'albanian',
  sw: 'swahili',
  gl: 'galician',
  mr: 'marathi',
  pa: 'punjabi',
  si: 'sinhala',
  km: 'khmer',
  sn: 'shona',
  yo: 'yoruba',
  so: 'somali',
  af: 'afrikaans',
  oc: 'occitan',
  ka: 'georgian',
  be: 'belarusian',
  tg: 'tajik',
  sd: 'sindhi',
  gu: 'gujarati',
  am: 'amharic',
  yi: 'yiddish',
  lo: 'lao',
  uz: 'uzbek',
  fo: 'faroese',
  ht: 'haitian creole',
  ps: 'pashto',
  tk: 'turkmen',
  nn: 'nynorsk',
  mt: 'maltese',
  sa: 'sanskrit',
  lb: 'luxembourgish',
  my: 'myanmar',
  bo: 'tibetan',
  tl: 'tagalog',
  mg: 'malagasy',
  as: 'assamese',
  tt: 'tatar',
  haw: 'hawaiian',
  ln: 'lingala',
  ha: 'hausa',
  ba: 'bashkir',
  jw: 'javanese',
  su: 'sundanese',
  yue: 'cantonese',
}

const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadScrollState,
  selectedThreadServerRequests,
  selectedLiveOverlay,
  selectedThreadId,
  availableModelIds,
  selectedModelId,
  selectedReasoningEffort,
  selectedSpeedMode,
  installedSkills,
  accountRateLimitSnapshots,
  messages,
  isLoadingThreads,
  isLoadingMessages,
  isSendingMessage,
  isInterruptingTurn,
  isUpdatingSpeedMode,
  notificationStale,
  realtimeConnectionState,
  syncLagging,
  error,
  refreshAll,
  refreshSkills,
  refreshRateLimits,
  selectThread,
  setThreadScrollState,
  archiveThreadById,
  dismissThreadLocally,
  forkThreadById,
  renameThreadById,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  rollbackSelectedThread,
  isRollingBack,
  selectedThreadExecutionActive,
  selectedThreadQueuedMessages,
  selectedThreadQueueProcessing,
  removeQueuedMessage,
  quoteQueuedMessage,
  markAllThreadsAsRead,
  setSelectedModelId,
  setWorktreeGitAutomationEnabled,
  setSelectedReasoningEffort,
  updateSelectedSpeedMode,
  respondToPendingServerRequest,
  renameProject,
  removeProject,
  reorderProject,
  pinProjectToTop,
  startPolling,
  stopPolling,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()
const homeThreadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadComposerRef = ref<ThreadComposerExposed | null>(null)
const sidebarSettingsAreaRef = ref<HTMLElement | null>(null)
const trendingProjects = ref<GithubTrendingProject[]>([])
const isTrendingProjectsLoading = ref(false)
const githubTipsScope = ref<GithubTipsScope>('trending-daily')
const lastLoadedGithubTipsScope = ref<GithubTipsScope | ''>('')
const editingQueuedMessageState = ref<{ threadId: string; queueIndex: number } | null>(null)
const isRouteSyncInProgress = ref(false)
const hasInitialized = ref(false)
const routeWarmThreadIds = ref<string[]>([])
const newThreadCwd = ref('')
const newThreadRuntime = ref<'local' | 'worktree'>('local')
const workspaceRootOptionsState = ref<{ order: string[]; labels: Record<string, string> }>({ order: [], labels: {} })
const worktreeInitStatus = ref<{ phase: 'idle' | 'running' | 'error'; title: string; message: string }>({
  phase: 'idle',
  title: '',
  message: '',
})
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const serverMatchedThreadIds = ref<string[] | null>(null)
let threadSearchTimer: ReturnType<typeof setTimeout> | null = null
const defaultNewProjectName = ref('New Project (1)')
const homeDirectory = ref('')
const isSettingsOpen = ref(false)
const SEND_WITH_ENTER_KEY = 'codex-web-local.send-with-enter.v1'
const DARK_MODE_KEY = 'codex-web-local.dark-mode.v1'
const DICTATION_CLICK_TO_TOGGLE_KEY = 'codex-web-local.dictation-click-to-toggle.v1'
const DICTATION_AUTO_SEND_KEY = 'codex-web-local.dictation-auto-send.v1'
const DICTATION_LANGUAGE_KEY = 'codex-web-local.dictation-language.v1'
const WORKTREE_GIT_AUTOMATION_KEY = 'codex-web-local.worktree-git-automation.v1'
const GITHUB_TRENDING_PROJECTS_KEY = 'codex-web-local.github-trending-projects.v1'
const sendWithEnter = ref(loadBoolPref(SEND_WITH_ENTER_KEY, true))
const darkMode = ref<'system' | 'light' | 'dark'>(loadDarkModePref())
const dictationClickToToggle = ref(loadBoolPref(DICTATION_CLICK_TO_TOGGLE_KEY, false))
const rollbackDraftPrependRequest = ref<{ id: number; text: string } | null>(null)
let rollbackDraftPrependRequestId = 0
const dictationAutoSend = ref(loadBoolPref(DICTATION_AUTO_SEND_KEY, true))
const dictationLanguage = ref(loadDictationLanguagePref())
const dictationLanguageOptions = computed(() => buildDictationLanguageOptions())
const worktreeGitAutomationEnabled = ref(loadBoolPref(WORKTREE_GIT_AUTOMATION_KEY, true))
const showGithubTrendingProjects = ref(loadBoolPref(GITHUB_TRENDING_PROJECTS_KEY, true))
const telegramStatus = ref<TelegramStatus>({
  configured: false,
  active: false,
  mappedChats: 0,
  mappedThreads: 0,
  lastError: '',
})
const desktopAppStatus = ref<DesktopAppStatus>({
  available: false,
  platform: '',
  appInstalled: false,
  appRunning: false,
  appUserModelId: '',
  reason: '',
})
const isDesktopRefreshRunning = ref(false)
const isDesktopRefreshConfirmVisible = ref(false)

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const knownThreadIdSet = computed(() => {
  const ids = new Set<string>()
  for (const group of projectGroups.value) {
    for (const thread of group.threads) {
      ids.add(thread.id)
    }
  }
  return ids
})
const routableThreadIdSet = computed(() => {
  const ids = new Set<string>(knownThreadIdSet.value)
  for (const threadId of routeWarmThreadIds.value) {
    ids.add(threadId)
  }
  return ids
})

const isHomeRoute = computed(() => route.name === 'home')
const isSkillsRoute = computed(() => route.name === 'skills')
const isGithubTrendingRoute = computed(() => route.name === 'github-trending')
const isNonThreadRoute = computed(() => (
  isHomeRoute.value || isSkillsRoute.value || isGithubTrendingRoute.value
))
const isRouteOnlyEmptyThread = computed(() => (
  route.name === 'thread'
  && !!routeThreadId.value
  && !selectedThread.value
  && filteredMessages.value.length === 0
  && selectedThreadServerRequests.value.length === 0
))
const contentTitle = computed(() => {
  if (isSkillsRoute.value) return '技能'
  if (isGithubTrendingRoute.value) return 'GitHub 热门'
  if (isHomeRoute.value) return '新会话'
  if (isRouteOnlyEmptyThread.value) return '空会话'
  return selectedThread.value?.title ?? '选择会话'
})
const browserHostName =
  typeof window !== 'undefined'
    ? (window.location.hostname || window.location.host || 'codexui')
    : 'codexui'
const pageTitle = computed(() => {
  const threadTitle = selectedThread.value?.title?.trim() ?? ''
  return threadTitle || browserHostName
})
const headerSubtitle = computed(() => {
  if (isSkillsRoute.value) return '管理已安装技能和当前运行能力。'
  if (isGithubTrendingRoute.value) return '浏览热门仓库、查看介绍，并直接带着项目链接发起提问。'
  if (isHomeRoute.value) return '从已配置工作区快速发起新的 Codex 任务。'
  if (isRouteOnlyEmptyThread.value) return '这个会话还没有消息，你可以直接发送第一条消息，或将它移除。'
  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  return cwd || ''
})
const hasActiveSyncDemand = computed(() => {
  if (isLoadingMessages.value || isSendingMessage.value) return true
  if (selectedThreadExecutionActive.value) return true
  if (selectedThread.value?.unread) return true
  if (selectedThreadServerRequests.value.length > 0) return true
  return false
})
const serviceStatusTone = computed<'live' | 'syncing' | 'warning' | 'danger'>(() => {
  if (error.value.trim().length > 0) return 'danger'
  if (realtimeConnectionState.value === 'disconnected' && hasActiveSyncDemand.value) return 'danger'
  if (realtimeConnectionState.value === 'connecting') return 'syncing'
  if (realtimeConnectionState.value === 'reconnecting' && hasActiveSyncDemand.value) return 'warning'
  if (syncLagging.value && hasActiveSyncDemand.value) return 'warning'
  if (notificationStale.value && hasActiveSyncDemand.value) return 'warning'
  if (isLoadingMessages.value || isSendingMessage.value) return 'syncing'
  return 'live'
})
const serviceStatusLabel = computed(() => {
  if (error.value.trim().length > 0) return '出现异常'
  if (realtimeConnectionState.value === 'disconnected' && hasActiveSyncDemand.value) return '连接中断'
  if (realtimeConnectionState.value === 'connecting') return '连接中'
  if (realtimeConnectionState.value === 'reconnecting' && hasActiveSyncDemand.value) return '回补同步中'
  if (syncLagging.value && hasActiveSyncDemand.value) return '同步延迟'
  if (notificationStale.value && hasActiveSyncDemand.value) return '回补同步中'
  if (realtimeConnectionState.value === 'reconnecting' || realtimeConnectionState.value === 'disconnected') return '待机'
  if (notificationStale.value) return '待机'
  if (isLoadingMessages.value || isSendingMessage.value) return '同步中'
  return '已连接'
})
const serviceStatusDetail = computed(() => {
  if (error.value.trim().length > 0) return error.value.trim()
  if (realtimeConnectionState.value === 'disconnected' && hasActiveSyncDemand.value) return '实时通知通道已断开，页面正在等待重新建立连接。'
  if (realtimeConnectionState.value === 'connecting') return '正在建立实时通知连接。'
  if (realtimeConnectionState.value === 'reconnecting' && hasActiveSyncDemand.value) return '实时通知正在重连，页面会继续短周期补同步。'
  if (syncLagging.value && hasActiveSyncDemand.value) return '最近同步结果偏旧，页面正在主动补拉最新消息。'
  if (notificationStale.value && hasActiveSyncDemand.value) return '实时通知暂时安静，页面正在主动校验任务状态并补拉最新进度。'
  if (selectedThreadServerRequests.value.length > 0) return '当前任务正在等待你的确认或补充输入，处理后会自动继续。'
  if (notificationStale.value) return '当前无进行中任务，未检测到可用同步目标。'
  if (selectedLiveOverlay.value?.activityLabel) return selectedLiveOverlay.value.activityLabel
  return 'Web 服务状态正常。'
})
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'commandExecution') return message.commandExecution?.status === 'inProgress'
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const latestUserTurnIndex = computed(() => {
  let latest = -1
  for (const message of messages.value) {
    if (message.role !== 'user') continue
    if (typeof message.turnIndex !== 'number') continue
    if (message.turnIndex > latest) latest = message.turnIndex
  }
  return latest
})
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const composerCwd = computed(() => {
  if (isHomeRoute.value) return newThreadCwd.value.trim()
  return selectedThread.value?.cwd?.trim() ?? ''
})
const displayedThreadConversationId = ref('')
const displayedThreadCwd = ref('')
const displayedThreadMessages = ref<UiMessage[]>([])
const displayedThreadPendingRequests = ref<UiServerRequest[]>([])
const displayedThreadLiveOverlay = ref<UiLiveOverlay | null>(null)
const displayedThreadScrollState = ref<ThreadScrollState | null>(null)
const isThreadContentSwitching = ref(false)
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const threadStatusTone = computed<'live' | 'syncing' | 'warning' | 'danger'>(() => {
  if (selectedThreadServerRequests.value.length > 0) return 'warning'
  if (selectedThreadExecutionActive.value) return 'syncing'
  if (isRouteOnlyEmptyThread.value) return 'live'
  if (selectedThread.value?.unread) return 'warning'
  return 'live'
})
const threadStatusLabel = computed(() => {
  if (isNonThreadRoute.value) return ''
  if (isRouteOnlyEmptyThread.value) return '空会话'
  if (!selectedThread.value) return ''
  if (selectedThreadServerRequests.value.length > 0) {
    return selectedLiveOverlay.value?.activityLabel || '等待处理'
  }
  if (selectedThreadExecutionActive.value) {
    return selectedLiveOverlay.value?.activityLabel || '执行中'
  }
  if (selectedThread.value.unread) return '有未读更新'
  return '就绪'
})
const desktopStatusTone = computed<'live' | 'syncing' | 'warning' | 'danger'>(() => {
  if (isDesktopRefreshRunning.value) return 'syncing'
  if (desktopAppStatus.value.available) return 'live'
  return 'warning'
})
const desktopStatusLabel = computed(() => {
  if (isDesktopRefreshRunning.value) return '刷新中'
  if (desktopAppStatus.value.available) return desktopAppStatus.value.appRunning ? '已连接' : '可用'
  return '不可用'
})
const newThreadFolderOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seenCwds = new Set<string>()

  for (const cwdRaw of workspaceRootOptionsState.value.order) {
    const cwd = cwdRaw.trim()
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: workspaceRootOptionsState.value.labels[cwd] || getPathLeafName(cwd),
    })
  }

  for (const group of projectGroups.value) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: projectDisplayNameById.value[group.projectName] ?? group.projectName,
    })
  }

  const selectedCwd = newThreadCwd.value.trim()
  if (selectedCwd && !seenCwds.has(selectedCwd)) {
    options.unshift({
      value: selectedCwd,
      label: getPathLeafName(selectedCwd),
    })
  }

  return options
})
const darkModeMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const githubTipsScopeOptions = computed<Array<{ value: GithubTipsScope; label: string }>>(() => [
  { value: 'search-daily', label: '搜索日报' },
  { value: 'search-weekly', label: '搜索周榜' },
  { value: 'search-monthly', label: '搜索月榜' },
  { value: 'trending-daily', label: '趋势日报' },
  { value: 'trending-weekly', label: '趋势周榜' },
  { value: 'trending-monthly', label: '趋势月榜' },
])

watch(
  () => [
    composerThreadContextId.value,
    composerCwd.value,
    filteredMessages.value,
    selectedThreadServerRequests.value,
    liveOverlay.value,
    selectedThreadScrollState.value,
    isLoadingMessages.value,
    isHomeRoute.value,
  ] as const,
  ([
    nextThreadId,
    nextCwd,
    nextMessages,
    nextPendingRequests,
    nextLiveOverlay,
    nextScrollState,
    loading,
    homeRoute,
  ]) => {
    const hasDisplayedConversation =
      displayedThreadMessages.value.length > 0 ||
      displayedThreadPendingRequests.value.length > 0 ||
      displayedThreadLiveOverlay.value !== null

    if (!nextThreadId || homeRoute) {
      isThreadContentSwitching.value = false
      displayedThreadConversationId.value = nextThreadId
      displayedThreadCwd.value = nextCwd
      displayedThreadMessages.value = [...nextMessages]
      displayedThreadPendingRequests.value = [...nextPendingRequests]
      displayedThreadLiveOverlay.value = nextLiveOverlay
      displayedThreadScrollState.value = nextScrollState
      return
    }

    const isSwitchingToAnotherThread = displayedThreadConversationId.value !== '' && displayedThreadConversationId.value !== nextThreadId
    if (loading && isSwitchingToAnotherThread && hasDisplayedConversation) {
      isThreadContentSwitching.value = true
      return
    }

    displayedThreadConversationId.value = nextThreadId
    displayedThreadCwd.value = nextCwd
    displayedThreadMessages.value = [...nextMessages]
    displayedThreadPendingRequests.value = [...nextPendingRequests]
    displayedThreadLiveOverlay.value = nextLiveOverlay
    displayedThreadScrollState.value = nextScrollState
    isThreadContentSwitching.value = false
  },
  { immediate: true },
)
const telegramStatusText = computed(() => {
  if (!telegramStatus.value.configured) return '未配置'
  const base = telegramStatus.value.active ? '在线' : '已配置（离线）'
  const mapped = `${telegramStatus.value.mappedChats} 个聊天，${telegramStatus.value.mappedThreads} 个线程`
  const error = telegramStatus.value.lastError ? `，错误：${telegramStatus.value.lastError}` : ''
  return `${base}, ${mapped}${error}`
})
const isDesktopRefreshAvailable = computed(() => desktopAppStatus.value.available)
const desktopRefreshButtonTitle = computed(() => {
  if (desktopAppStatus.value.available) {
    return '关闭并重开官方 Codex 桌面端，让它重新载入 Web 侧最新会话。'
  }
  return desktopAppStatus.value.reason || '当前机器无法刷新官方 Codex 桌面端。'
})
const desktopRefreshButtonLabel = computed(() => (
  isDesktopRefreshRunning.value ? '刷新中...' : '刷新桌面端'
))
const hasUnreadThreads = computed(() =>
  projectGroups.value.some((group) => group.threads.some((thread) => thread.unread)),
)
const isDesktopRefreshRiskHigh = computed(() => (
  selectedThread.value?.inProgress === true || selectedLiveOverlay.value !== null
))
const desktopRefreshConfirmTitle = computed(() => (
  isDesktopRefreshRiskHigh.value
    ? '刷新桌面端可能中断当前任务。'
    : '是否刷新官方 Codex 桌面端？'
))
const desktopRefreshConfirmMessage = computed(() => (
  isDesktopRefreshRiskHigh.value
    ? '这会关闭并重开当前机器上的官方 Codex 桌面端。桌面端正在执行的任务可能会停止，7420 网页端不会关闭。'
    : '这会关闭并重开官方 Codex 桌面端，让它重新载入最新的本地会话记录。'
))

type IdleSchedulerWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

let idleTaskCancels: Array<() => void> = []
let pendingTrendingProjectsCancel: (() => void) | null = null
let trendingProjectsRequestToken = 0

function scheduleIdleTask(task: () => void, timeoutMs = 1200): (() => void) {
  if (typeof window === 'undefined') {
    task()
    return () => {}
  }

  const idleWindow = window as IdleSchedulerWindow
  if (typeof idleWindow.requestIdleCallback === 'function' && typeof idleWindow.cancelIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(task, { timeout: timeoutMs })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = window.setTimeout(task, Math.min(Math.max(Math.round(timeoutMs / 3), 120), 420))
  return () => window.clearTimeout(handle)
}

function queueIdleTask(task: () => void, timeoutMs = 1200): void {
  idleTaskCancels.push(scheduleIdleTask(task, timeoutMs))
}

function clearQueuedIdleTasks(): void {
  for (const cancel of idleTaskCancels) {
    cancel()
  }
  idleTaskCancels = []
}

function cancelPendingTrendingProjectsLoad(): void {
  pendingTrendingProjectsCancel?.()
  pendingTrendingProjectsCancel = null
}

function scheduleTrendingProjectsLoad(priority: 'idle' | 'immediate' = 'idle'): void {
  if (!showGithubTrendingProjects.value || !isGithubTrendingRoute.value) return
  const targetScope = githubTipsScope.value
  if (
    lastLoadedGithubTipsScope.value === targetScope &&
    trendingProjects.value.length > 0 &&
    !isTrendingProjectsLoading.value
  ) {
    return
  }

  cancelPendingTrendingProjectsLoad()
  const run = () => {
    pendingTrendingProjectsCancel = null
    void loadTrendingProjects(targetScope)
  }

  if (priority === 'immediate') {
    run()
    return
  }

  pendingTrendingProjectsCancel = scheduleIdleTask(run, 1800)
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
  applyDarkMode()
  darkModeMediaQuery?.addEventListener('change', applyDarkMode)
  void initialize()
  void applyLaunchProjectPathFromUrl()
  queueIdleTask(() => { void loadHomeDirectory() }, 800)
  queueIdleTask(() => { void loadWorkspaceRootOptionsState() }, 950)
  queueIdleTask(() => { void refreshDefaultProjectName() }, 1200)
  queueIdleTask(() => { void refreshTelegramStatus() }, 1500)
  queueIdleTask(() => { void refreshDesktopAppAvailability() }, 1700)
  scheduleTrendingProjectsLoad()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('pointerdown', onWindowPointerDownForSettings, { capture: true })
  darkModeMediaQuery?.removeEventListener('change', applyDarkMode)
  clearQueuedIdleTasks()
  cancelPendingTrendingProjectsLoad()
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  stopPolling()
})

watch(sidebarSearchQuery, (value) => {
  const query = value.trim()
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  if (!query) {
    serverMatchedThreadIds.value = null
    return
  }
  if (query.length < 2) {
    serverMatchedThreadIds.value = null
    return
  }

  threadSearchTimer = setTimeout(() => {
    void searchThreads(query, 1000)
      .then((result) => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = result.threadIds
      })
      .catch(() => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = null
      })
  }, 280)
})

watch(isSettingsOpen, (open) => {
  if (open) {
    void refreshRateLimits()
    window.addEventListener('pointerdown', onWindowPointerDownForSettings, { capture: true })
    return
  }
  window.removeEventListener('pointerdown', onWindowPointerDownForSettings, { capture: true })
})

function onSkillsChanged(): void {
  void refreshSkills()
}

function onMarkAllThreadsRead(): void {
  markAllThreadsAsRead()
}

async function refreshTelegramStatus(): Promise<void> {
  try {
    telegramStatus.value = await getTelegramStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载 Telegram 状态失败'
    telegramStatus.value = {
      configured: false,
      active: false,
      mappedChats: 0,
      mappedThreads: 0,
      lastError: message,
    }
  }
}

async function refreshDesktopAppAvailability(): Promise<void> {
  try {
    desktopAppStatus.value = await getDesktopAppStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载桌面端状态失败'
    desktopAppStatus.value = {
      available: false,
      platform: '',
      appInstalled: false,
      appRunning: false,
      appUserModelId: '',
      reason: message,
    }
  }
}

function onRefreshDesktopApp(): void {
  if (isDesktopRefreshRunning.value) return
  if (!desktopAppStatus.value.available) {
    window.alert(desktopAppStatus.value.reason || '当前机器无法刷新官方 Codex 桌面端。')
    return
  }

  isDesktopRefreshConfirmVisible.value = true
}

function closeDesktopRefreshConfirm(): void {
  isDesktopRefreshConfirmVisible.value = false
}

function confirmDesktopRefresh(): void {
  if (!desktopAppStatus.value.available || isDesktopRefreshRunning.value) {
    closeDesktopRefreshConfirm()
    return
  }

  closeDesktopRefreshConfirm()
  isDesktopRefreshRunning.value = true
  void refreshDesktopApp()
    .then((result) => {
      window.alert(result.message)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '刷新官方 Codex 桌面端失败'
      window.alert(message)
    })
    .finally(() => {
      isDesktopRefreshRunning.value = false
      void refreshDesktopAppAvailability()
    })
}

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (selectedThreadId.value !== threadId) {
    void selectThread(threadId)
  }
  if (route.name !== 'thread') {
    void router.push({ name: 'thread', params: { threadId } })
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

async function onExportThread(threadId: string): Promise<void> {
  if (!threadId) return
  if (selectedThreadId.value !== threadId) {
    await selectThread(threadId)
    await router.push({ name: 'thread', params: { threadId } })
  }
  await nextTick()
  onExportChat()
}

function onArchiveThread(threadId: string): void {
  void archiveThreadById(threadId)
}

async function onForkThread(threadId: string): Promise<void> {
  const nextThreadId = await forkThreadById(threadId)
  if (!nextThreadId) return
  if (!isHomeRoute.value) {
    await router.push({ name: 'thread', params: { threadId: nextThreadId } })
  } else {
    await router.replace({ name: 'thread', params: { threadId: nextThreadId } })
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function isWorktreePath(cwdRaw: string): boolean {
  const cwd = cwdRaw.trim().replace(/\\/gu, '/')
  if (!cwd) return false
  return cwd.includes('/.codex/worktrees/') || cwd.includes('/.git/worktrees/')
}

function resolvePreferredLocalCwd(projectName: string, fallbackCwd = ''): string {
  const group = projectGroups.value.find((row) => row.projectName === projectName)
  if (!group) return fallbackCwd.trim()
  const nonWorktreeThread = group.threads.find((thread) => !isWorktreePath(thread.cwd))
  const candidate = nonWorktreeThread?.cwd?.trim() ?? group.threads[0]?.cwd?.trim() ?? ''
  return candidate || fallbackCwd.trim()
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
  if (projectCwd) {
    newThreadCwd.value = projectCwd
  }
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onBrowseThreadFiles(threadId: string): void {
  let targetCwd = ''
  for (const group of projectGroups.value) {
    const thread = group.threads.find((row) => row.id === threadId)
    if (thread?.cwd?.trim()) {
      targetCwd = thread.cwd.trim()
      break
    }
  }
  if (!targetCwd || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(targetCwd)}`, '_blank', 'noopener,noreferrer')
}

function onStartNewThreadFromToolbar(): void {
  const selected = selectedThread.value
  const cwd = selected
    ? resolvePreferredLocalCwd(selected.projectName, selected.cwd?.trim() ?? '')
    : ''
  if (cwd) {
    newThreadCwd.value = cwd
  }
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

async function onDismissEmptyThread(): Promise<void> {
  const threadId = routeThreadId.value.trim()
  if (!threadId) return

  dismissThreadLocally(threadId)
  await archiveThreadById(threadId)
  await selectThread('')
  if (!isHomeRoute.value) {
    await router.replace({ name: 'home' })
  }
}

function onReturnToNewThreadFromEmptyThread(): void {
  if (isHomeRoute.value) return
  void router.replace({ name: 'home' })
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

function onRemoveProject(projectName: string): void {
  removeProject(projectName)
}

function onReorderProject(payload: { projectName: string; toIndex: number }): void {
  reorderProject(payload.projectName, payload.toIndex)
}

function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void {
  setThreadScrollState(payload.threadId, payload.state)
}

function onRespondServerRequest(payload: { id: number; result?: unknown; error?: { code?: number; message: string } }): void {
  void respondToPendingServerRequest(payload)
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && isDesktopRefreshConfirmVisible.value) {
    event.preventDefault()
    closeDesktopRefreshConfirm()
    return
  }
  if (event.key === 'Escape' && isSettingsOpen.value) {
    event.preventDefault()
    isSettingsOpen.value = false
    return
  }
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  if (event.key.toLowerCase() !== 'b') return
  event.preventDefault()
  setSidebarCollapsed(!isSidebarCollapsed.value)
}

function onWindowPointerDownForSettings(event: PointerEvent): void {
  if (!isSettingsOpen.value) return
  const settingsArea = sidebarSettingsAreaRef.value
  if (!settingsArea) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (settingsArea.contains(target)) return

  isSettingsOpen.value = false
}

function onSubmitThreadMessage(payload: { text: string; imageUrls: string[]; fileAttachments: Array<{ label: string; path: string; fsPath: string }>; skills: Array<{ name: string; path: string }>; mode: 'steer' | 'queue'; rollbackLatestUserTurn?: boolean }): void {
  const text = payload.text
  const editingState = editingQueuedMessageState.value
  const queueInsertIndex =
    payload.mode === 'queue'
    && editingState
    && editingState.threadId === selectedThreadId.value
      ? editingState.queueIndex
      : undefined
  editingQueuedMessageState.value = null
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(text, payload.imageUrls, payload.skills, payload.fileAttachments)
    return
  }
  if (payload.rollbackLatestUserTurn === true) {
    void rollbackAndResendDictation(payload)
    return
  }
  void sendMessageToSelectedThread(text, payload.imageUrls, payload.skills, payload.mode, payload.fileAttachments, queueInsertIndex)
}

function onGithubTipsScopeChange(nextValue: string): void {
  const allowed = new Set<GithubTipsScope>([
    'search-daily',
    'search-weekly',
    'search-monthly',
    'trending-daily',
    'trending-weekly',
    'trending-monthly',
  ])
  const scope = allowed.has(nextValue as GithubTipsScope) ? (nextValue as GithubTipsScope) : 'trending-daily'
  if (githubTipsScope.value === scope) return
  githubTipsScope.value = scope
}

function onRefreshTrendingProjects(): void {
  trendingProjectsRequestToken += 1
  lastLoadedGithubTipsScope.value = ''
  cancelPendingTrendingProjectsLoad()
  scheduleTrendingProjectsLoad('immediate')
}

function onConnectTelegramBot(): void {
  if (typeof window === 'undefined') return
  const botToken = window.prompt('请输入 Telegram 机器人 Token')
  if (!botToken || !botToken.trim()) return

  void configureTelegramBot(botToken.trim())
    .then(() => {
      window.alert('Telegram 机器人已配置完成。打开机器人私聊并发送 /start。')
      void refreshTelegramStatus()
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '连接 Telegram 机器人失败'
      window.alert(message)
      void refreshTelegramStatus()
    })
}

function buildTrendingProjectAskPrompt(project: GithubTrendingProject): string {
  return `请先了解这个 GitHub 项目：${project.url}\n然后用非常简单、五年级学生也能听懂的话解释这个项目是做什么的。`
}

async function onAskTrendingProject(project: GithubTrendingProject): Promise<void> {
  if (!isHomeRoute.value) {
    await router.push({ name: 'home' })
    await nextTick()
  }
  const composer = homeThreadComposerRef.value
  if (!composer) return
  composer.hydrateDraft({
    text: buildTrendingProjectAskPrompt(project),
    imageUrls: [],
    fileAttachments: [],
    skills: [],
  })
}

function onEditQueuedMessage(messageId: string): void {
  const queueIndex = selectedThreadQueuedMessages.value.findIndex((item) => item.id === messageId)
  const message = queueIndex >= 0 ? selectedThreadQueuedMessages.value[queueIndex] : undefined
  const composer = threadComposerRef.value
  if (!message || !composer) return

  if (composer.hasUnsavedDraft()) {
    const shouldReplace = window.confirm('当前输入框里还有未发送内容，是否替换为这条排队消息继续编辑？')
    if (!shouldReplace) return
  }

  editingQueuedMessageState.value = selectedThreadId.value
    ? { threadId: selectedThreadId.value, queueIndex }
    : null
  const payload: ComposerDraftPayload = {
    text: message.text,
    imageUrls: [...message.imageUrls],
    fileAttachments: message.fileAttachments.map((attachment) => ({ ...attachment })),
    skills: message.skills.map((skill) => ({ ...skill })),
  }
  composer.hydrateDraft(payload)
  removeQueuedMessage(messageId)
}

async function rollbackAndResendDictation(payload: {
  text: string
  imageUrls: string[]
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  skills: Array<{ name: string; path: string }>
}): Promise<void> {
  if (isSelectedThreadInProgress.value) {
    await interruptSelectedThreadTurn()
  }
  const rollbackTargetTurnIndex = latestUserTurnIndex.value
  if (rollbackTargetTurnIndex >= 0) {
    await rollbackSelectedThread(rollbackTargetTurnIndex)
  }
  await sendMessageToSelectedThread(payload.text, payload.imageUrls, payload.skills, 'steer', payload.fileAttachments)
}

function onSelectNewThreadFolder(cwd: string): void {
  newThreadCwd.value = cwd.trim()
}

async function onAddNewProject(rawInput: string): Promise<void> {
  const normalizedInput = rawInput.trim()
  if (!normalizedInput) return

  const isPath = looksLikePath(normalizedInput)
  const baseDir = await resolveProjectBaseDirectory()
  const targetPath = isPath
    ? normalizedInput
    : joinPath(baseDir, normalizedInput)
  if (!targetPath) return

  try {
    const normalizedPath = await openProjectRoot(targetPath, {
      createIfMissing: !isPath,
      label: isPath ? '' : normalizedInput,
    })
    if (normalizedPath) {
      newThreadCwd.value = normalizedPath
      pinProjectToTop(getPathLeafName(normalizedPath))
      void loadWorkspaceRootOptionsState()
      void refreshDefaultProjectName()
    }
  } catch {
    // Error is surfaced on next request if path is invalid.
  }
}

async function applyLaunchProjectPathFromUrl(): Promise<void> {
  if (typeof window === 'undefined') return
  const launchProjectPath = new URLSearchParams(window.location.search).get('openProjectPath')?.trim() ?? ''
  if (!launchProjectPath) return
  try {
    const normalizedPath = await openProjectRoot(launchProjectPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return
    newThreadCwd.value = normalizedPath
    pinProjectToTop(getPathLeafName(normalizedPath))
    await router.replace({ name: 'home' })
    await loadWorkspaceRootOptionsState()
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('openProjectPath')
    window.history.replaceState({}, '', nextUrl.toString())
  } catch {
    // If launch path is invalid, keep normal startup behavior.
  }
}

async function resolveProjectBaseDirectory(): Promise<string> {
  const baseDir = getProjectBaseDirectory()
  if (baseDir) return baseDir
  try {
    const loadedHomeDirectory = await getHomeDirectory()
    if (loadedHomeDirectory) {
      homeDirectory.value = loadedHomeDirectory
      return loadedHomeDirectory
    }
  } catch {
    // Fallback handled by empty return.
  }
  return ''
}

function looksLikePath(value: string): boolean {
  if (!value) return false
  if (value.startsWith('~/')) return true
  if (value.startsWith('/')) return true
  return /^[a-zA-Z]:[\\/]/.test(value)
}

async function refreshDefaultProjectName(): Promise<void> {
  const baseDir = getProjectBaseDirectory()
  if (!baseDir) {
    defaultNewProjectName.value = 'New Project (1)'
    return
  }

  try {
    const suggestion = await getProjectRootSuggestion(baseDir)
    defaultNewProjectName.value = suggestion.name || 'New Project (1)'
  } catch {
    defaultNewProjectName.value = 'New Project (1)'
  }
}

function getProjectBaseDirectory(): string {
  const selected = newThreadCwd.value.trim()
  if (selected) return getPathParent(selected)
  const first = newThreadFolderOptions.value[0]?.value?.trim() ?? ''
  if (first) return getPathParent(first)
  return homeDirectory.value.trim()
}

async function loadHomeDirectory(): Promise<void> {
  try {
    homeDirectory.value = await getHomeDirectory()
  } catch {
    homeDirectory.value = ''
  }
}

async function loadWorkspaceRootOptionsState(): Promise<void> {
  try {
    const state = await getWorkspaceRootsState()
    workspaceRootOptionsState.value = {
      order: [...state.order],
      labels: { ...state.labels },
    }
  } catch {
    workspaceRootOptionsState.value = { order: [], labels: {} }
  }
}

async function loadTrendingProjects(scope: GithubTipsScope = githubTipsScope.value): Promise<void> {
  const requestToken = ++trendingProjectsRequestToken
  isTrendingProjectsLoading.value = true
  try {
    const rows = await getGithubProjectsForScope(scope, 6)
    if (requestToken !== trendingProjectsRequestToken) return
    if (!showGithubTrendingProjects.value || !isGithubTrendingRoute.value) return
    if (scope !== githubTipsScope.value) return
    trendingProjects.value = rows
    lastLoadedGithubTipsScope.value = scope
  } catch {
    if (requestToken !== trendingProjectsRequestToken) return
    trendingProjects.value = []
    lastLoadedGithubTipsScope.value = ''
  } finally {
    if (requestToken === trendingProjectsRequestToken) {
      isTrendingProjectsLoading.value = false
    }
  }
}
function joinPath(parent: string, child: string): string {
  const normalizedParent = parent.trim().replace(/\/+$/, '')
  const normalizedChild = child.trim().replace(/^\/+/, '')
  if (!normalizedParent || !normalizedChild) return ''
  return `${normalizedParent}/${normalizedChild}`
}

function onSelectModel(modelId: string): void {
  setSelectedModelId(modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSelectSpeedMode(mode: SpeedMode): void {
  void updateSelectedSpeedMode(mode)
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function onRollback(payload: { turnIndex: number; prependText?: string }): void {
  const prependText = payload.prependText?.trim() ?? ''
  if (prependText.length > 0) {
    rollbackDraftPrependRequestId += 1
    rollbackDraftPrependRequest.value = { id: rollbackDraftPrependRequestId, text: prependText }
  }
  void rollbackSelectedThread(payload.turnIndex)
}

function onExportChat(): void {
  if (isNonThreadRoute.value || typeof document === 'undefined') return
  if (!selectedThread.value || filteredMessages.value.length === 0) return
  const markdown = buildThreadMarkdown()
  const fileName = buildExportFileName()
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function buildThreadMarkdown(): string {
  const lines: string[] = []
  const threadTitle = selectedThread.value?.title?.trim() || '未命名会话'
  lines.push(`# ${escapeMarkdownText(threadTitle)}`)
  lines.push('')
  lines.push(`- 导出时间：${new Date().toISOString()}`)
  lines.push(`- 会话 ID：${selectedThread.value?.id ?? ''}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const message of filteredMessages.value) {
    const roleLabel = message.role === 'user'
      ? '用户'
      : message.role === 'assistant'
        ? 'Codex'
        : message.role === 'system'
          ? '系统'
          : '消息'
    lines.push(`## ${roleLabel}`)
    lines.push('')

    const normalizedText = message.text.trim()
    if (normalizedText) {
      lines.push(normalizedText)
      lines.push('')
    }

    if (message.commandExecution) {
      lines.push('```text')
      lines.push(`命令：${message.commandExecution.command}`)
      lines.push(`状态：${message.commandExecution.status}`)
      if (message.commandExecution.cwd) {
        lines.push(`目录：${message.commandExecution.cwd}`)
      }
      if (message.commandExecution.exitCode !== null) {
        lines.push(`退出码：${message.commandExecution.exitCode}`)
      }
      lines.push(message.commandExecution.aggregatedOutput || '（无输出）')
      lines.push('```')
      lines.push('')
    }

    if (message.fileAttachments && message.fileAttachments.length > 0) {
      lines.push('附件：')
      for (const attachment of message.fileAttachments) {
        lines.push(`- ${attachment.path}`)
      }
      lines.push('')
    }

    if (message.images && message.images.length > 0) {
      lines.push('图片：')
      for (const imageUrl of message.images) {
        lines.push(`- ${imageUrl}`)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function buildExportFileName(): string {
  const threadTitle = selectedThread.value?.title?.trim() || 'chat'
  const sanitized = threadTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = sanitized || 'chat'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${base}-${stamp}.md`
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1')
}

function loadBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1'
}

function loadDarkModePref(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(DARK_MODE_KEY)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

function toggleSendWithEnter(): void {
  sendWithEnter.value = !sendWithEnter.value
  window.localStorage.setItem(SEND_WITH_ENTER_KEY, sendWithEnter.value ? '1' : '0')
}

function cycleDarkMode(): void {
  const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
  const idx = order.indexOf(darkMode.value)
  darkMode.value = order[(idx + 1) % order.length]
  window.localStorage.setItem(DARK_MODE_KEY, darkMode.value)
  applyDarkMode()
}

function toggleDictationClickToToggle(): void {
  dictationClickToToggle.value = !dictationClickToToggle.value
  window.localStorage.setItem(DICTATION_CLICK_TO_TOGGLE_KEY, dictationClickToToggle.value ? '1' : '0')
}

function toggleDictationAutoSend(): void {
  dictationAutoSend.value = !dictationAutoSend.value
  window.localStorage.setItem(DICTATION_AUTO_SEND_KEY, dictationAutoSend.value ? '1' : '0')
}

function toggleWorktreeGitAutomation(): void {
  worktreeGitAutomationEnabled.value = !worktreeGitAutomationEnabled.value
  window.localStorage.setItem(WORKTREE_GIT_AUTOMATION_KEY, worktreeGitAutomationEnabled.value ? '1' : '0')
}

function toggleGithubTrendingProjects(): void {
  showGithubTrendingProjects.value = !showGithubTrendingProjects.value
  window.localStorage.setItem(GITHUB_TRENDING_PROJECTS_KEY, showGithubTrendingProjects.value ? '1' : '0')
}

function onDictationLanguageChange(nextValue: string): void {
  const normalized = normalizeToWhisperLanguage(nextValue.trim())
  const value = normalized || 'auto'
  dictationLanguage.value = value
  window.localStorage.setItem(DICTATION_LANGUAGE_KEY, value)
}

function loadDictationLanguagePref(): string {
  if (typeof window === 'undefined') return 'auto'
  const value = window.localStorage.getItem(DICTATION_LANGUAGE_KEY)?.trim() || 'auto'
  const normalized = normalizeToWhisperLanguage(value)
  return normalized || 'auto'
}

function buildDictationLanguageOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: 'auto', label: '自动识别' }]
  const seen = new Set<string>(['auto'])
  function formatLanguageLabel(value: string): string {
    const languageName = WHISPER_LANGUAGES[value] || value
    const title = languageName.charAt(0).toUpperCase() + languageName.slice(1)
    return `${title} (${value})`
  }

  for (const raw of typeof navigator !== 'undefined' ? (navigator.languages ?? []) : []) {
    const value = normalizeToWhisperLanguage(raw)
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: `优先：${formatLanguageLabel(value)}`,
    })
  }

  for (const value of Object.keys(WHISPER_LANGUAGES)) {
    if (seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: formatLanguageLabel(value),
    })
  }

  const current = dictationLanguage.value.trim()
  if (current && !seen.has(current)) {
    options.push({
      value: current,
      label: formatLanguageLabel(current),
    })
  }

  return options
}

function normalizeToWhisperLanguage(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value || value === 'auto') return ''
  if (value in WHISPER_LANGUAGES) return value
  const base = value.split('-')[0] ?? value
  if (base in WHISPER_LANGUAGES) return base
  return ''
}

function applyDarkMode(): void {
  const root = document.documentElement
  if (darkMode.value === 'dark') {
    root.classList.add('dark')
  } else if (darkMode.value === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0')
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

function rememberRoutableThreadId(threadId: string): void {
  const normalized = threadId.trim()
  if (!normalized || routeWarmThreadIds.value.includes(normalized)) return
  routeWarmThreadIds.value = [...routeWarmThreadIds.value, normalized]
}

async function initialize(): Promise<void> {
  await refreshAll({ loadMessages: false, loadSkills: false })
  hasInitialized.value = true
  const selectedThreadIdBeforeRouteSync = selectedThreadId.value
  await syncThreadSelectionWithRoute()
  if (route.name === 'thread' && selectedThreadId.value && selectedThreadId.value === selectedThreadIdBeforeRouteSync) {
    await selectThread(selectedThreadId.value)
  }
  startPolling()
  if (route.name !== 'thread') {
    queueIdleTask(() => { void refreshSkills() }, 220)
  }
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) return
  isRouteSyncInProgress.value = true

  try {
    if (route.name === 'home' || route.name === 'skills' || route.name === 'github-trending') {
      if (selectedThreadId.value !== '') {
        await selectThread('')
      }
      return
    }

    if (route.name === 'thread') {
      const threadId = routeThreadId.value
      if (!threadId) return

      if (!routableThreadIdSet.value.has(threadId)) {
        try {
          await getThreadRuntimeSnapshot(threadId)
          rememberRoutableThreadId(threadId)
        } catch {
          await router.replace({ name: 'home' })
          return
        }
      }

      if (selectedThreadId.value !== threadId) {
        void selectThread(threadId)
        rememberRoutableThreadId(threadId)
      }
      return
    }

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      routableThreadIdSet.value.has(routeThreadId.value),
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isNonThreadRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => githubTipsScope.value,
  () => {
    if (!showGithubTrendingProjects.value || !isGithubTrendingRoute.value) return
    scheduleTrendingProjectsLoad()
  },
)

watch(
  () => showGithubTrendingProjects.value,
  (enabled) => {
    cancelPendingTrendingProjectsLoad()
    if (!enabled) {
      trendingProjectsRequestToken += 1
      isTrendingProjectsLoading.value = false
      trendingProjects.value = []
      lastLoadedGithubTipsScope.value = ''
      return
    }
    scheduleTrendingProjectsLoad()
  },
)

watch(
  () => route.name,
  (name) => {
    if (name === 'github-trending') {
      scheduleTrendingProjectsLoad()
      return
    }
    trendingProjectsRequestToken += 1
    isTrendingProjectsLoading.value = false
    cancelPendingTrendingProjectsLoad()
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      newThreadCwd.value = ''
      return
    }
    const hasSelected = options.some((option) => option.value === newThreadCwd.value)
    if (!hasSelected) {
      newThreadCwd.value = options[0].value
    }
    void refreshDefaultProjectName()
  },
  { immediate: true },
)

watch(
  () => newThreadCwd.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    void refreshDefaultProjectName()
  },
)

watch(
  () => newThreadRuntime.value,
  (runtime) => {
    if (runtime === 'local') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      const current = newThreadCwd.value.trim()
      if (current && isWorktreePath(current)) {
        const fallbackProjectName = selectedThread.value?.projectName ?? getPathLeafName(current)
        const localCwd = resolvePreferredLocalCwd(fallbackProjectName, '')
        if (localCwd) {
          newThreadCwd.value = localCwd
        }
      }
    }
  },
)

watch(
  () => route.name,
  (name) => {
    if (name !== 'home') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    }
  },
)

watch(
  () => selectedThreadId.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
  },
)

watch(
  pageTitle,
  (value) => {
    if (typeof document === 'undefined') return
    document.title = value
  },
  { immediate: true },
)

watch(
  () => worktreeGitAutomationEnabled.value,
  (enabled) => {
    setWorktreeGitAutomationEnabled(enabled)
  },
  { immediate: true },
)

watch(isMobile, (mobile) => {
  if (mobile && !isSidebarCollapsed.value) {
    setSidebarCollapsed(true)
  }
})

async function submitFirstMessageForNewThread(
  text: string,
  imageUrls: string[] = [],
  skills: Array<{ name: string; path: string }> = [],
  fileAttachments: Array<{ label: string; path: string; fsPath: string }> = [],
): Promise<void> {
  try {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    let targetCwd = newThreadCwd.value
    if (newThreadRuntime.value === 'worktree') {
      worktreeInitStatus.value = {
        phase: 'running',
        title: '正在创建工作树',
        message: '正在创建工作树并执行初始化。',
      }
      try {
        const created = await createWorktree(newThreadCwd.value)
        targetCwd = created.cwd
        newThreadCwd.value = created.cwd
        worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      } catch {
        worktreeInitStatus.value = {
          phase: 'error',
          title: '工作树初始化失败',
          message: '无法创建工作树，请重试或切换到当前项目。',
        }
        return
      }
    }
    const threadId = await sendMessageToNewThread(text, targetCwd, imageUrls, skills, fileAttachments)
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  } catch {
    // Error is already reflected in state.
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-root {
  @apply h-full flex flex-col select-none;
}

.skip-to-content {
  position: fixed;
  left: 1rem;
  top: 0.75rem;
  z-index: 80;
  transform: translateY(-160%);
  border-radius: 9999px;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  padding: 0.55rem 0.9rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #134e4a;
  text-decoration: none;
  transition: transform 140ms ease;
}

.skip-to-content:focus-visible {
  transform: translateY(0);
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.sidebar-scrollable {
  @apply flex-1 min-h-0 overflow-y-auto py-3 px-2.5 flex flex-col gap-2;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.content-root {
  @apply h-full min-h-0 w-full flex flex-col overflow-y-hidden overflow-x-visible;
  background:
    radial-gradient(circle at top right, rgba(13, 148, 136, 0.035), transparent 24%),
    linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(250,247,240,0.98) 100%);
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-toggle {
  @apply h-7 w-7 rounded-xl border border-transparent bg-transparent text-[#6e6458] flex items-center justify-center transition-colors duration-100 hover:border-[#ddd5c7] hover:bg-[#fffdf8];
}

.sidebar-search-toggle[aria-pressed='true'] {
  @apply border-[#cec2ad] bg-[#ece4d6] text-[#433b31];
}

.sidebar-search-toggle-icon {
  @apply w-4 h-4;
}

.sidebar-toolbar-pill {
  @apply h-7 rounded-xl border border-[#ddd5c7] bg-[#fffdf8] px-2.5 text-[11px] font-medium text-[#5f5548] transition-colors duration-100;
}

.sidebar-toolbar-pill:hover,
.sidebar-toolbar-pill:focus-visible {
  @apply border-[#cec2ad] bg-[#f7f1e5] text-[#2d261f];
}

.sidebar-toolbar-pill:disabled {
  @apply cursor-not-allowed border-[#ece4d6] bg-[#faf6ef] text-[#b1a89b];
}

.sidebar-search-bar {
  @apply sticky top-0 z-10 flex items-center gap-1.5 mx-2 px-3 py-2 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] transition-colors;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.56);
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 text-[#9a907f] shrink-0;
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm text-[#2d261f] placeholder-[#9f9484] outline-none border-none p-0;
}

.sidebar-search-clear {
  @apply w-5 h-5 rounded-lg text-[#9a907f] flex items-center justify-center transition-colors duration-100 hover:bg-[#f1ebde] hover:text-[#544a3d];
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-explore-nav {
  @apply mx-2 grid grid-cols-2 gap-2;
}

.sidebar-skills-link {
  @apply mx-2 flex items-center justify-center rounded-2xl border border-[#e8decd] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#5b5146] transition-[background-color,border-color,color,transform] duration-150 cursor-pointer;
}

.sidebar-explore-nav .sidebar-skills-link {
  @apply mx-0 justify-center;
}

.sidebar-skills-link.is-active {
  @apply border-[#99f6e4] bg-[#f0fdfa] text-[#134e4a] font-medium;
}

.sidebar-skills-link:hover,
.sidebar-skills-link:focus-visible {
  @apply bg-[#f7f4ed] text-[#2d261f];
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.desktop-refresh-button {
  @apply inline-flex items-center gap-1.5 rounded-full border border-[#ddd3c2] bg-[#fffdf8] px-3 py-1.5 text-[11px] font-semibold text-[#544a3d] transition-[background-color,border-color,color] duration-150 hover:border-[#c8b9a2] hover:bg-[#f6f2ea] hover:text-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60;
}

.desktop-refresh-button[data-busy='true'] {
  @apply border-[#e7d9b0] bg-[#fcf7e8] text-[#8a6a11];
}

.desktop-refresh-button-icon {
  @apply h-3.25 w-3.25;
}

.content-body {
  @apply flex-1 min-h-0 w-full flex flex-col gap-2 pt-0.5 pb-2 sm:pb-4 overflow-y-hidden overflow-x-visible;
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}

.content-header-subtitle {
  @apply m-0 text-[11px] leading-4 text-[#8f8577] truncate;
}

.content-status-strip {
  @apply flex min-h-0 flex-wrap items-center gap-1.5;
}

.content-status-pill {
  @apply inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium;
}

.content-status-pill-label {
  @apply uppercase tracking-[0.08em] text-[9px] font-semibold opacity-70;
}

.content-status-pill[data-tone='live'] {
  @apply border-[#cbe7e1] bg-[#edf9f6] text-[#0f766e];
}

.content-status-pill[data-tone='syncing'] {
  @apply border-[#d8ccba] bg-[#f7f1e5] text-[#6d6354];
}

.content-status-pill[data-tone='warning'] {
  @apply border-[#e7d9b0] bg-[#fcf7e8] text-[#8a6a11];
}

.content-status-pill[data-tone='danger'] {
  @apply border-[#f1cbc3] bg-[#fff0ec] text-[#c2410c];
}

.content-status-detail {
  @apply hidden sm:inline text-[11px] leading-4 text-[#8f8577] truncate;
}


.content-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-2;
}

.content-thread {
  @apply flex-1 min-h-0 overflow-hidden;
}

.composer-with-queue {
  @apply w-full sticky bottom-0 z-10 pt-2;
  background:
    linear-gradient(180deg, rgba(250,247,240,0) 0%, rgba(250,247,240,0.9) 22%, rgba(250,247,240,0.98) 100%);
  padding-bottom: max(0.35rem, env(safe-area-inset-bottom));
}

.new-thread-empty {
  @apply flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 px-3 sm:px-6;
}

.new-thread-hero {
  @apply m-0 text-[1.8rem] sm:text-[2.5rem] font-semibold leading-[1.04] text-[#1f2937];
}

.new-thread-folder-dropdown {
  @apply text-2xl sm:text-[2.5rem] text-[#73695d];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto text-2xl sm:text-[2.5rem] leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-value) {
  @apply leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-chevron) {
  @apply h-4 w-4 sm:h-5 sm:w-5 mt-0;
}

.new-thread-runtime-dropdown {
  @apply mt-3;
}

.new-thread-trending {
  @apply mt-4 w-full max-w-3xl;
}

.new-thread-trending-header {
  @apply mb-2 flex items-center justify-between gap-2;
}

.new-thread-trending-title {
  @apply m-0 text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.new-thread-trending-scope-dropdown {
  @apply min-w-40;
}

.new-thread-trending-scope-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-8 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700;
}

.new-thread-trending-empty {
  @apply m-0 text-sm text-zinc-500;
}

.new-thread-trending-list {
  @apply grid grid-cols-2 sm:grid-cols-3 gap-2;
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.new-thread-trending-tip {
  @apply flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-zinc-300 hover:bg-zinc-50;
  container-type: inline-size;
}

.new-thread-trending-tip-name {
  @apply w-full truncate text-sm font-medium text-zinc-900;
}

.new-thread-trending-tip-name-owner {
  @apply inline;
}

.new-thread-trending-tip-name-slash {
  @apply inline;
}

.new-thread-trending-tip-name-repo {
  @apply inline;
}

@container (max-width: 220px) {
  .new-thread-trending-tip-name-owner,
  .new-thread-trending-tip-name-slash {
    display: none;
  }
}

.new-thread-trending-tip-meta {
  @apply text-xs text-zinc-500;
}

.new-thread-trending-tip-description {
  @apply line-clamp-2 text-xs text-zinc-600;
}

.worktree-init-status {
  @apply mt-3 flex w-full max-w-xl flex-col gap-1 rounded-xl border px-3 py-2 text-sm;
}

.worktree-init-status.is-running {
  @apply border-[#ddd5c7] bg-[#f7f1e5] text-[#6d6354];
}

.worktree-init-status.is-error {
  @apply border-rose-300 bg-rose-50 text-rose-800;
}

.worktree-init-status-title {
  @apply font-medium;
}

.worktree-init-status-message {
  @apply break-all;
}

.sidebar-settings-area {
  @apply shrink-0 pt-2 px-2 pb-2 border-t border-[#e6dccb] bg-[#f7f4ed];
}

.sidebar-settings-button {
  @apply flex items-center gap-2 w-full rounded-2xl border border-transparent bg-transparent px-3 py-2 text-sm text-[#5b5146] transition-colors duration-100 hover:bg-[#ece4d6] hover:text-[#2d261f] cursor-pointer;
}

.sidebar-settings-icon {
  @apply w-4.5 h-4.5;
}

.sidebar-settings-panel {
  @apply mb-1 rounded-[24px] border border-[#e5dbca] bg-[#fffdf8] overflow-hidden;
}

.sidebar-settings-row {
  @apply flex items-center justify-between w-full px-3 py-2.5 text-sm text-[#544a3d] border-0 bg-transparent transition-colors duration-150 hover:bg-[#f7f4ed] cursor-pointer;
}

.sidebar-settings-row:disabled {
  @apply cursor-not-allowed text-[#b1a89b] hover:bg-transparent;
}

.sidebar-settings-row--select {
  @apply cursor-default items-center gap-2;
}

.sidebar-settings-language-dropdown {
  @apply min-w-0 max-w-52;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto rounded-xl border border-[#ddd5c7] bg-white px-2 py-1 text-xs text-[#544a3d];
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-32;
}

.sidebar-settings-row + .sidebar-settings-row {
  @apply border-t border-[#f1eadf];
}

.sidebar-settings-label {
  @apply text-left;
}

.sidebar-settings-value {
  @apply text-xs text-[#7b7062] bg-[#f1ebde] rounded-full px-2 py-0.5;
}

.sidebar-settings-toggle {
  @apply relative w-9 h-5 rounded-full bg-[#d8cfbf] transition-colors shrink-0;
}

.sidebar-settings-toggle::after {
  content: '';
  @apply absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm;
}

.sidebar-settings-toggle.is-on {
  @apply bg-[#1f2937];
}

.sidebar-settings-toggle.is-on::after {
  transform: translateX(16px);
}

.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: opacity 90ms ease;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
}

.sidebar-settings-rate-limits {
  @apply border-t border-[#e9dfce] px-2 pt-2;
}

.sidebar-settings-build-label {
  @apply border-t border-[#f1eadf] px-3 py-2 text-[11px] text-[#8f8577];
}

@media (max-width: 767px) {
  .sidebar-scrollable {
    @apply gap-1.5 px-1.5 pt-3 pb-2;
    padding-top: max(0.75rem, env(safe-area-inset-top));
  }

  .sidebar-settings-area {
    @apply px-1.5 pt-1.5;
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
  }

  .sidebar-thread-controls-host {
    @apply px-1.5;
  }

  .sidebar-search-bar,
  .sidebar-skills-link {
    @apply mx-1.5;
  }

  .content-body {
    @apply gap-1.5;
  }

  .content-grid {
    @apply gap-1.5;
  }

  .composer-with-queue {
    @apply pt-1.5;
    background:
      linear-gradient(180deg, rgba(250,247,240,0) 0%, rgba(250,247,240,0.94) 26%, rgba(250,247,240,1) 100%);
  }

  .new-thread-empty {
    @apply px-4;
  }

  .skip-to-content {
    left: 0.75rem;
    right: 0.75rem;
    top: max(0.5rem, env(safe-area-inset-top));
    text-align: center;
  }
}

.desktop-refresh-confirm-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-[#1f2937]/42 p-4 backdrop-blur-[2px];
}

.desktop-refresh-confirm-dialog {
  @apply w-full max-w-md rounded-[28px] border border-[#ddd5c7] bg-[#fffdf8] p-5 shadow-2xl shadow-[#1f2937]/15;
}

.desktop-refresh-confirm-kicker {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f8577];
}

.desktop-refresh-confirm-title {
  @apply mt-2 mb-0 text-lg font-semibold leading-7 text-[#1f2937];
}

.desktop-refresh-confirm-text {
  @apply mt-2 mb-0 text-sm leading-6 text-[#5c5247];
}

.desktop-refresh-confirm-actions {
  @apply mt-5 flex items-center justify-end gap-2;
}

.desktop-refresh-confirm-button {
  @apply inline-flex items-center justify-center rounded-full border border-[#d8cfbf] bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#544a3d] transition-colors duration-100 hover:border-[#bca98d] hover:bg-[#f7f1e5];
}

.desktop-refresh-confirm-button-primary {
  @apply border-[#1f2937] bg-[#1f2937] text-white hover:border-[#111827] hover:bg-[#111827];
}

.desktop-refresh-confirm-button-warning {
  @apply border-[#c2410c] bg-[#c2410c] hover:border-[#9a3412] hover:bg-[#9a3412];
}

@media (prefers-reduced-motion: reduce) {
  .settings-panel-enter-active,
  .settings-panel-leave-active,
  .sidebar-search-toggle,
  .sidebar-search-clear,
  .sidebar-skills-link,
  .desktop-refresh-button,
  .sidebar-settings-button,
  .sidebar-settings-row,
  .desktop-refresh-confirm-button {
    transition: none !important;
  }
}

</style>
