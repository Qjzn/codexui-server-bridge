<template>
  <section class="conversation-root">
    <div v-if="showBlockingLoading" class="conversation-loading" aria-hidden="true">
      <span class="conversation-loading-kicker">加载会话</span>
      <span class="conversation-loading-card conversation-loading-card-user">
        <span class="conversation-loading-line conversation-loading-line-short" />
      </span>
      <span class="conversation-loading-card">
        <span class="conversation-loading-line conversation-loading-line-wide" />
        <span class="conversation-loading-line conversation-loading-line-medium" />
        <span class="conversation-loading-line conversation-loading-line-short" />
      </span>
      <span class="conversation-loading-card">
        <span class="conversation-loading-line conversation-loading-line-wide" />
        <span class="conversation-loading-line conversation-loading-line-short" />
      </span>
    </div>

    <p
      v-else-if="!hasRenderableConversation"
      class="conversation-empty"
    >
      当前会话还没有消息。
    </p>

    <template v-else>
      <div v-if="showInlineLoading" class="conversation-inline-loading" aria-live="polite">
        <span class="conversation-inline-loading-bar" />
        <span class="conversation-inline-loading-text">正在同步最新消息...</span>
      </div>

      <ul ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li
        v-for="request in pendingRequests"
        :key="`server-request:${request.id}`"
        class="conversation-item conversation-item-request"
      >
        <div class="message-row">
          <div class="message-stack">
            <article class="request-card">
              <p class="request-title">{{ request.method }}</p>
              <p class="request-meta">Request #{{ request.id }} · {{ formatIsoTime(request.receivedAtIso) }}</p>

              <p v-if="readRequestReason(request)" class="request-reason">{{ readRequestReason(request) }}</p>

              <section v-if="request.method === 'item/commandExecution/requestApproval'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">允许</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">本次会话始终允许</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">拒绝</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">取消</button>
              </section>

              <section v-else-if="request.method === 'item/fileChange/requestApproval'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">允许</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">本次会话始终允许</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">拒绝</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">取消</button>
              </section>

              <section v-else-if="request.method === 'item/tool/requestUserInput'" class="request-user-input">
                <div
                  v-for="question in readToolQuestions(request)"
                  :key="`${request.id}:${question.id}`"
                  class="request-question"
                >
                  <p class="request-question-title">{{ question.header || question.question }}</p>
                  <p v-if="question.header && question.question" class="request-question-text">{{ question.question }}</p>
                  <select
                    class="request-select"
                    :value="readQuestionAnswer(request.id, question.id, question.options[0] || '')"
                    @change="onQuestionAnswerChange(request.id, question.id, $event)"
                  >
                    <option v-for="option in question.options" :key="`${request.id}:${question.id}:${option}`" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <input
                    v-if="question.isOther"
                    class="request-input"
                    type="text"
                    :value="readQuestionOtherAnswer(request.id, question.id)"
                    placeholder="其他答案"
                    @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
                  />
                </div>

                <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(request)">
                  提交答案
                </button>
              </section>

              <section v-else-if="request.method === 'item/tool/call'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(request.id)">返回失败</button>
                <button type="button" class="request-button" @click="onRespondToolCallSuccess(request.id)">返回成功（空结果）</button>
              </section>

              <section v-else class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(request.id)">返回空结果</button>
                <button type="button" class="request-button" @click="onRejectUnknownRequest(request.id)">拒绝请求</button>
              </section>
            </article>
          </div>
        </div>
      </li>

      <li
        v-for="(message, messageIndex) in messages"
        :key="message.id"
        class="conversation-item"
        :class="{ 'conversation-item-actionable': canShowMessageActions(message) }"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div v-if="isCommandMessage(message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <button
              type="button"
              class="cmd-row"
              :class="[commandStatusClass(message), { 'cmd-expanded': isCommandExpanded(message) }]"
              @click="toggleCommandExpand(message)"
            >
              <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(message) }">▶</span>
              <span class="cmd-status">{{ commandStatusLabel(message) }}</span>
              <code class="cmd-label">{{ message.commandExecution?.command || '(command)' }}</code>
            </button>
            <div
              class="cmd-output-wrap"
              :class="{ 'cmd-output-visible': isCommandExpanded(message), 'cmd-output-collapsing': isCommandCollapsing(message) }"
            >
              <div class="cmd-output-inner">
                <pre class="cmd-output">{{ message.commandExecution?.aggregatedOutput || '(no output)' }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <p v-if="messageRoleLabel(message, messageIndex)" class="message-eyebrow" :data-role="message.role">
              {{ messageRoleLabel(message, messageIndex) }}
            </p>
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img class="message-image-preview" :src="toRenderableImageUrl(imageUrl)" alt="Message image preview" loading="lazy" />
                  </button>
                </li>
              </ul>

              <div v-if="message.fileAttachments && message.fileAttachments.length > 0" class="message-file-attachments">
                <span v-for="att in message.fileAttachments" :key="att.path" class="message-file-chip">
                  <span class="message-file-chip-icon">📄</span>
                  <span class="message-file-link-wrap">
                    <a
                      class="message-file-link message-file-chip-name"
                      :href="toBrowseUrl(att.path)"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="att.path"
                      @contextmenu.prevent="onFileLinkContextMenu($event, att.path)"
                    >
                      {{ att.path }}
                    </a>
                  </span>
                </span>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role">
                <div v-if="message.messageType === 'worked'" class="worked-separator-wrap" aria-live="polite">
                  <button type="button" class="worked-separator" @click="toggleWorkedExpand(message)">
                    <span class="worked-separator-line" aria-hidden="true" />
                    <span class="worked-chevron" :class="{ 'worked-chevron-open': isWorkedExpanded(message) }">▶</span>
                    <p class="worked-separator-text">{{ message.text }}</p>
                    <span class="worked-separator-line" aria-hidden="true" />
                  </button>
                  <div v-if="isWorkedExpanded(message)" class="worked-details">
                    <div
                      v-for="cmd in getCommandsForWorked(messages, messages.indexOf(message))"
                      :key="`worked-cmd-${cmd.id}`"
                      class="worked-cmd-item"
                    >
                      <button
                        type="button"
                        class="cmd-row"
                        :class="[commandStatusClass(cmd), { 'cmd-expanded': isCommandExpanded(cmd) }]"
                        @click="toggleCommandExpand(cmd)"
                      >
                        <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(cmd) }">▶</span>
                        <span class="cmd-status">{{ commandStatusLabel(cmd) }}</span>
                        <code class="cmd-label">{{ cmd.commandExecution?.command || '(command)' }}</code>
                      </button>
                      <div
                        class="cmd-output-wrap"
                        :class="{ 'cmd-output-visible': isCommandExpanded(cmd), 'cmd-output-collapsing': isCommandCollapsing(cmd) }"
                      >
                        <div class="cmd-output-inner">
                          <pre class="cmd-output">{{ cmd.commandExecution?.aggregatedOutput || '(no output)' }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="message-text-flow">
                  <template v-for="(block, blockIndex) in parseMessageBlocks(message.text)" :key="`block-${blockIndex}`">
                    <p v-if="block.kind === 'text'" class="message-text">
                      <template v-for="(segment, segmentIndex) in parseInlineSegments(block.value)" :key="`seg-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                        <span v-else-if="segment.kind === 'file'" class="message-file-link-wrap">
                          <a
                            class="message-file-link"
                            :href="toBrowseUrl(segment.path)"
                            target="_blank"
                            rel="noopener noreferrer"
                            :title="segment.path"
                            @contextmenu.prevent="onFileLinkContextMenu($event, segment.path)"
                          >
                            {{ segment.displayPath }}
                          </a>
                        </span>
                        <a
                          v-else-if="segment.kind === 'url'"
                          class="message-file-link"
                          :href="segment.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.href"
                          @contextmenu.prevent="onUrlLinkContextMenu($event, segment.href)"
                        >
                          {{ segment.value }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </p>
                    <p v-else-if="isMarkdownImageFailed(message.id, blockIndex)" class="message-text">{{ block.markdown }}</p>
                    <button
                      v-else
                      class="message-image-button"
                      type="button"
                      @click="openImageModal(block.url)"
                    >
                      <img
                        class="message-image-preview message-markdown-image"
                        :src="block.url"
                        :alt="block.alt || '消息内图片'"
                        loading="lazy"
                        @error="onMarkdownImageError(message.id, blockIndex)"
                      />
                    </button>
                  </template>
                </div>
              </article>
            </article>

            <div v-if="canShowMessageActions(message)" class="message-actions">
              <button
                v-if="canCopyMessage(message)"
                class="message-action-button"
                type="button"
                title="复制消息内容"
                @click="onCopyMessage(message)"
              >
                <IconTablerCopy class="message-action-icon" />
                <span class="message-action-label">复制</span>
              </button>
              <button
                v-if="canRollbackMessage(message)"
                class="message-action-button"
                type="button"
                title="回滚到这条消息，并移除其后的当前轮次内容"
                @click="onRollback(message)"
              >
                <IconTablerArrowBackUp class="message-action-icon" />
                <span class="message-action-label">回滚</span>
              </button>
            </div>
          </div>
        </div>
      </li>
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <p class="live-overlay-label">{{ liveOverlay.activityLabel }}</p>
              <p
                v-if="liveOverlay.reasoningText"
                class="live-overlay-reasoning"
                ref="liveOverlayReasoningRef"
              >
                {{ liveOverlay.reasoningText }}
              </p>
              <p v-if="liveOverlay.errorText" class="live-overlay-error">{{ liveOverlay.errorText }}</p>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
      </ul>

      <button
        v-if="showJumpToLatestButton"
        class="conversation-jump-to-latest"
        :class="{ 'has-pending-updates': hasPendingBelowFoldUpdates }"
        type="button"
        :title="jumpToLatestTitle"
        @click="jumpToLatest"
      >
        <IconTablerArrowUp class="conversation-jump-to-latest-icon" />
        <span class="conversation-jump-to-latest-label">
          {{ hasPendingBelowFoldUpdates ? '最新输出' : '回到底部' }}
        </span>
        <span v-if="hasPendingBelowFoldUpdates" class="conversation-jump-to-latest-badge" />
      </button>
    </template>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="关闭图片预览" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="放大的消息图片" />
      </div>
    </div>

    <div
      v-if="isFileLinkContextMenuVisible"
      ref="fileLinkContextMenuRef"
      class="file-link-context-menu"
      :style="fileLinkContextMenuStyle"
      @click.stop
    >
      <button type="button" class="file-link-context-menu-item" @click="openFileLinkContextBrowse">
        打开链接
      </button>
      <button type="button" class="file-link-context-menu-item" @click="copyFileLinkContextLink">
        复制链接
      </button>
      <button
        v-if="fileLinkContextEditUrl"
        type="button"
        class="file-link-context-menu-item"
        @click="openFileLinkContextEdit"
      >
        编辑文件
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ThreadScrollState, UiLiveOverlay, UiMessage, UiServerRequest } from '../../types/codex'
import IconTablerX from '../icons/IconTablerX.vue'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsingCommandIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const prevCommandStatuses = ref<Record<string, string>>({})

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isCommandExpanded(message: UiMessage): boolean {
  if (message.commandExecution?.status === 'inProgress') return true
  if (collapsingCommandIds.value.has(message.id)) return true
  return expandedCommandIds.value.has(message.id)
}

function isCommandCollapsing(message: UiMessage): boolean {
  return collapsingCommandIds.value.has(message.id)
}

function toggleCommandExpand(message: UiMessage): void {
  if (message.commandExecution?.status === 'inProgress') return
  const next = new Set(expandedCommandIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedCommandIds.value = next
}

function toggleWorkedExpand(message: UiMessage): void {
  const next = new Set(expandedWorkedIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedWorkedIds.value = next
}

function isWorkedExpanded(message: UiMessage): boolean {
  return expandedWorkedIds.value.has(message.id)
}

function commandStatusLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  switch (ce.status) {
    case 'inProgress': return '⟳ 执行中'
    case 'completed': return ce.exitCode === 0 ? '✓ 已完成' : `✗ 退出 ${ce.exitCode ?? '?'}`
    case 'failed': return '✗ 执行失败'
    case 'declined': return '⊘ 已拒绝'
    case 'interrupted': return '⊘ 已中断'
    default: return ''
  }
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function scheduleCollapse(messageId: string): void {
  const nextCollapsing = new Set(collapsingCommandIds.value)
  nextCollapsing.add(messageId)
  collapsingCommandIds.value = nextCollapsing
  setTimeout(() => {
    const next = new Set(collapsingCommandIds.value)
    next.delete(messageId)
    collapsingCommandIds.value = next
  }, 1000)
}

function getCommandsForWorked(messages: UiMessage[], workedIndex: number): UiMessage[] {
  const result: UiMessage[] = []
  for (let i = workedIndex - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.messageType === 'commandExecution') result.unshift(m)
    else if (m.role === 'user' || m.messageType === 'worked') break
  }
  return result
}

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  activeThreadId: string
  cwd: string
  scrollState: ThreadScrollState | null
  isTurnInProgress?: boolean
  isRollingBack?: boolean
}>()

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
  rollback: [payload: { turnIndex: number; prependText?: string }]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const liveOverlayReasoningRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const fileLinkContextMenuRef = ref<HTMLElement | null>(null)
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const hasPendingBelowFoldUpdates = ref(false)
const BOTTOM_THRESHOLD_PX = 16
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'file'; value: string; path: string; displayPath: string; downloadName: string }
type MessageBlock =
  | { kind: 'text'; value: string }
  | { kind: 'image'; url: string; alt: string; markdown: string }

let scrollRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const failedMarkdownImageKeys = ref<Set<string>>(new Set())
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const hasRenderableConversation = computed(() => (
  props.messages.length > 0 ||
  props.pendingRequests.length > 0 ||
  props.liveOverlay !== null
))
const showBlockingLoading = computed(() => props.isLoading && !hasRenderableConversation.value)
const showInlineLoading = computed(() => props.isLoading && hasRenderableConversation.value)
const showJumpToLatestButton = computed(() => (
  hasRenderableConversation.value &&
  !showBlockingLoading.value &&
  !shouldLockToBottom()
))
const jumpToLatestTitle = computed(() => (
  hasPendingBelowFoldUpdates.value ? '跳到最新输出' : '回到底部'
))

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

type TextRange = {
  start: number
  end: number
}

function isFilePath(value: string): boolean {
  if (!value) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (value.startsWith('file://')) return true
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const hasPathSeparator = value.includes('/') || value.includes('\\')
  return looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || hasPathSeparator
}

function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/gu, '/')
}

function normalizeFileUrlToPath(pathValue: string): string {
  if (!pathValue.startsWith('file://')) return pathValue
  let stripped = pathValue.replace(/^file:\/\//u, '')
  try {
    stripped = decodeURIComponent(stripped)
  } catch {
    // Keep best-effort path if decoding fails.
  }
  if (/^\/[A-Za-z]:\//u.test(stripped)) {
    stripped = stripped.slice(1)
  }
  return stripped
}

function inferHomeFromCwd(cwd: string): string {
  const normalized = normalizePathSeparators(cwd)
  const userMatch = normalized.match(/^\/Users\/([^/]+)/u)
  if (userMatch) return `/Users/${userMatch[1]}`
  const homeMatch = normalized.match(/^\/home\/([^/]+)/u)
  if (homeMatch) return `/home/${homeMatch[1]}`
  return ''
}

function normalizePathDots(pathValue: string): string {
  const normalized = normalizePathSeparators(pathValue)
  if (!normalized) return normalized

  let root = ''
  let rest = normalized
  const driveMatch = rest.match(/^([A-Za-z]:)(\/.*)?$/u)
  if (driveMatch) {
    root = `${driveMatch[1]}/`
    rest = (driveMatch[2] ?? '').replace(/^\/+/u, '')
  } else if (rest.startsWith('/')) {
    root = '/'
    rest = rest.slice(1)
  }

  const parts = rest.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(part)
  }

  const joined = stack.join('/')
  if (root) return `${root}${joined}`.replace(/\/+$/u, '') || root
  return joined || normalized
}

function resolveRelativePath(pathValue: string, cwd: string): string {
  const normalizedPath = normalizePathSeparators(normalizeFileUrlToPath(pathValue.trim()))
  if (!normalizedPath) return ''

  const looksLikeAbsolute = normalizedPath.startsWith('/') || /^[A-Za-z]:\//u.test(normalizedPath)
  if (looksLikeAbsolute) return normalizePathDots(normalizedPath)

  if (normalizedPath.startsWith('~/')) {
    const homeBase = inferHomeFromCwd(cwd)
    if (homeBase) {
      return normalizePathDots(`${homeBase}/${normalizedPath.slice(2)}`)
    }
  }

  const base = normalizePathSeparators(cwd.trim())
  if (!base) return normalizePathDots(normalizedPath)
  return normalizePathDots(`${base.replace(/\/+$/u, '')}/${normalizedPath}`)
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value.trim()
  const wrapped = trimLinkWrappers(pathValue)
  pathValue = wrapped.core.trim()
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  pathValue = normalizeFileUrlToPath(pathValue)
  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

const LEADING_LINK_WRAPPER_PATTERN = /^['"`“‘<(\[{（【《「『]/u
const TRAILING_LINK_WRAPPER_PATTERN = /['"`”’>)\]}）】》」』]$/u
const TRAILING_LINK_PUNCTUATION_PATTERN = /[.,;:!?，。；：！？]$/u
const TRAILING_LINK_DELIMITER_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
  ['（', '）'],
  ['【', '】'],
  ['《', '》'],
  ['「', '」'],
  ['『', '』'],
] as const

function trimLinkWrappers(value: string): { core: string; leading: string; trailing: string } {
  let core = value
  let leading = ''
  let trailing = ''

  while (LEADING_LINK_WRAPPER_PATTERN.test(core)) {
    leading += core[0]
    core = core.slice(1)
  }
  while (TRAILING_LINK_WRAPPER_PATTERN.test(core)) {
    trailing = core.slice(-1) + trailing
    core = core.slice(0, -1)
  }

  return { core, leading, trailing }
}

function countCharacter(value: string, character: string): number {
  let count = 0
  for (const part of value) {
    if (part === character) count += 1
  }
  return count
}

function hasUnbalancedTrailingDelimiter(value: string): boolean {
  if (!value) return false
  const lastCharacter = value.slice(-1)
  for (const [opening, closing] of TRAILING_LINK_DELIMITER_PAIRS) {
    if (lastCharacter !== closing) continue
    return countCharacter(value, closing) > countCharacter(value, opening)
  }
  return false
}

function splitTrailingLinkSuffix(value: string): { core: string; trailing: string } {
  let core = value
  let trailing = ''

  while (core.length > 0) {
    if (TRAILING_LINK_PUNCTUATION_PATTERN.test(core) || hasUnbalancedTrailingDelimiter(core)) {
      trailing = core.slice(-1) + trailing
      core = core.slice(0, -1)
      continue
    }
    break
  }

  return { core, trailing }
}

function toExternalHref(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (/^https?:\/\//iu.test(normalized)) return normalized
  if (/^mailto:/iu.test(normalized)) return normalized
  if (/^www\./iu.test(normalized)) return `https://${normalized}`
  return null
}

function parseMarkdownLinkToken(value: string): { label: string; target: string } | null {
  const trimmed = value.trim()
  const parsed = readMarkdownLinkAt(trimmed, 0)
  if (!parsed || parsed.end !== trimmed.length) return null
  const labelRaw = parsed.label.trim()
  const targetRaw = parsed.target.trim()
  const label = trimLinkWrappers(labelRaw).core.trim() || labelRaw
  const target = trimLinkWrappers(targetRaw).core.trim()
  if (!target) return null
  return { label, target }
}

function readMarkdownLinkAt(
  text: string,
  startIndex: number,
): { label: string; target: string; end: number } | null {
  if (text[startIndex] !== '[') return null
  const closeBracket = text.indexOf('](', startIndex + 1)
  if (closeBracket < 0) return null

  const label = text.slice(startIndex + 1, closeBracket)
  if (!label || label.includes('\n')) return null

  let cursor = closeBracket + 2
  let depth = 1
  while (cursor < text.length) {
    const char = text[cursor]
    if (char === '\n') return null
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        const target = text.slice(closeBracket + 2, cursor)
        if (!target.trim()) return null
        return { label, target, end: cursor + 1 }
      }
    }
    cursor += 1
  }

  return null
}

function splitPlainTextByLinks(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /https?:\/\/\S+|mailto:\S+|www\.\S+|file:\/\/\S+|\S*[\\/]\S+/gu
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    if (typeof match.index !== 'number') continue
    const start = match.index
    const end = start + match[0].length

    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    let token = match[0]
    const trailingSplit = splitTrailingLinkSuffix(token)
    token = trailingSplit.core
    const wrapped = trimLinkWrappers(token)
    token = wrapped.core
    const leading = wrapped.leading
    const trailing = wrapped.trailing + trailingSplit.trailing

    if (leading) {
      segments.push({ kind: 'text', value: leading })
    }

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      segments.push({ kind: 'bold', value: token.slice(2, -2) })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else {
      const externalHref = toExternalHref(token)
      if (externalHref) {
        segments.push({ kind: 'url', value: token, href: externalHref })
        if (trailing) {
          segments.push({ kind: 'text', value: trailing })
        }
      } else {
        const ref = parseFileReference(token)
        if (ref) {
          segments.push({
            kind: 'file',
            value: token,
            path: ref.path,
            displayPath: token,
            downloadName: getBasename(ref.path),
          })
          if (trailing) {
            segments.push({ kind: 'text', value: trailing })
          }
        } else {
          segments.push({ kind: 'text', value: match[0] })
        }
      }
    }

    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }

  return applyBoldMarkersAcrossTextSegments(segments)
}

function pushMarkdownLinkSegment(
  segments: InlineSegment[],
  label: string,
  target: string,
  fallbackText: string,
): boolean {
  const externalHref = toExternalHref(target)
  if (externalHref) {
    segments.push({ kind: 'url', value: label || target, href: externalHref })
    return true
  }

  const ref = parseFileReference(target)
  if (ref) {
    segments.push({
      kind: 'file',
      value: target,
      path: ref.path,
      displayPath: label || target,
      downloadName: getBasename(ref.path),
    })
    return true
  }

  if (fallbackText) {
    segments.push({ kind: 'text', value: fallbackText })
    return true
  }

  return false
}

function applyBoldMarkersAcrossTextSegments(segments: InlineSegment[]): InlineSegment[] {
  const output: InlineSegment[] = []
  let inBold = false
  let boldBuffer = ''

  const pushText = (value: string): void => {
    if (!value) return
    output.push({ kind: 'text', value })
  }

  for (const segment of segments) {
    if (segment.kind !== 'text') {
      if (inBold) {
        pushText(`**${boldBuffer}`)
        inBold = false
        boldBuffer = ''
      }
      output.push(segment)
      continue
    }

    let remaining = segment.value
    while (remaining.length > 0) {
      const markerIndex = remaining.indexOf('**')
      if (markerIndex < 0) {
        if (inBold) boldBuffer += remaining
        else pushText(remaining)
        break
      }

      const before = remaining.slice(0, markerIndex)
      if (inBold) boldBuffer += before
      else pushText(before)

      remaining = remaining.slice(markerIndex + 2)
      if (inBold) {
        if (boldBuffer.length > 0) output.push({ kind: 'bold', value: boldBuffer })
        else pushText('****')
        boldBuffer = ''
        inBold = false
      } else {
        inBold = true
      }
    }
  }

  if (inBold) {
    pushText(`**${boldBuffer}`)
  }

  return output
}
function splitTextByFileUrls(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const openBracket = text.indexOf('[', cursor)
    if (openBracket < 0) break
    const markdownToken = readMarkdownLinkAt(text, openBracket)
    if (!markdownToken) {
      cursor = openBracket + 1
      continue
    }

    if (openBracket > cursor) {
      segments.push(...splitPlainTextByLinks(text.slice(cursor, openBracket)))
    }

    const label = trimLinkWrappers(markdownToken.label.trim()).core.trim() || markdownToken.label.trim()
    const target = trimLinkWrappers(markdownToken.target.trim()).core.trim()
    pushMarkdownLinkSegment(segments, label, target, text.slice(openBracket, markdownToken.end))

    cursor = markdownToken.end
  }

  if (cursor < text.length) {
    segments.push(...splitPlainTextByLinks(text.slice(cursor)))
  }

  return segments
}

function collectMarkdownLinkRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []
  let cursor = 0

  while (cursor < text.length) {
    const openBracket = text.indexOf('[', cursor)
    if (openBracket < 0) break
    const markdownToken = readMarkdownLinkAt(text, openBracket)
    if (!markdownToken) {
      cursor = openBracket + 1
      continue
    }
    ranges.push({ start: openBracket, end: markdownToken.end })
    cursor = markdownToken.end
  }

  return ranges
}

function isIndexInsideRanges(index: number, ranges: TextRange[]): boolean {
  for (const range of ranges) {
    if (index < range.start) return false
    if (index < range.end) return true
  }
  return false
}

function parseInlineSegments(text: string): InlineSegment[] {
  if (!text.includes('`')) return splitTextByFileUrls(text)
  const markdownLinkRanges = collectMarkdownLinkRanges(text)

  const segments: InlineSegment[] = []
  let cursor = 0
  let textStart = 0

  while (cursor < text.length) {
    if (text[cursor] !== '`' || isIndexInsideRanges(cursor, markdownLinkRanges)) {
      cursor += 1
      continue
    }

    let openLength = 1
    while (cursor + openLength < text.length && text[cursor + openLength] === '`') {
      openLength += 1
    }
    const delimiter = '`'.repeat(openLength)

    let searchFrom = cursor + openLength
    let closingStart = -1
    while (searchFrom < text.length) {
      const candidate = text.indexOf(delimiter, searchFrom)
      if (candidate < 0) break
      if (isIndexInsideRanges(candidate, markdownLinkRanges)) {
        searchFrom = candidate + 1
        continue
      }

      const hasBacktickBefore = candidate > 0 && text[candidate - 1] === '`'
      const hasBacktickAfter =
        candidate + openLength < text.length && text[candidate + openLength] === '`'
      const hasNewLineInside = text.slice(cursor + openLength, candidate).includes('\n')

      if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
        closingStart = candidate
        break
      }
      searchFrom = candidate + 1
    }

    if (closingStart < 0) {
      cursor += openLength
      continue
    }

    if (cursor > textStart) {
      segments.push(...splitTextByFileUrls(text.slice(textStart, cursor)))
    }

    const token = text.slice(cursor + openLength, closingStart)
    if (token.length > 0) {
      const markdownLink = parseMarkdownLinkToken(token)
      if (markdownLink) {
        const pushed = pushMarkdownLinkSegment(segments, markdownLink.label, markdownLink.target, '')
        if (!pushed) {
          segments.push({ kind: 'code', value: token })
        }
      } else {
        const fileReference = parseFileReference(token)
        if (fileReference) {
          const displayPath = fileReference.line
            ? `${fileReference.path}:${String(fileReference.line)}`
            : fileReference.path
          segments.push({
            kind: 'file',
            value: token,
            path: fileReference.path,
            displayPath,
            downloadName: getBasename(fileReference.path),
          })
        } else {
          segments.push({ kind: 'code', value: token })
        }
      }
    } else {
      segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
    }

    cursor = closingStart + openLength
    textStart = cursor
  }

  if (textStart < text.length) {
    segments.push(...splitTextByFileUrls(text.slice(textStart)))
  }

  return segments
}

function toRenderableImageUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/codex-local-image?')
  ) {
    return normalized
  }

  if (normalized.startsWith('file://')) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  const looksLikeUnixAbsolute = normalized.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(normalized)
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  return normalized
}

function toBrowseUrl(pathValue: string): string {
  const normalized = pathValue.trim()
  if (!normalized) return '#'
  const looksLikeAbsolutePath = (candidate: string): boolean => (
    candidate.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(candidate)
  )

  const parsed = parseFileReference(normalized)
  const candidatePath = parsed?.path ?? normalized
  const resolved = resolveRelativePath(candidatePath, props.cwd)

  if (looksLikeAbsolutePath(resolved)) {
    const normalizedResolved = resolved.startsWith('/') ? resolved : `/${resolved}`
    return `/codex-local-browse${encodeURI(normalizedResolved)}`
  }

  return '#'
}

function toEditUrl(pathValue: string): string {
  const normalized = pathValue.trim()
  if (!normalized) return '#'
  const parsed = parseFileReference(normalized)
  const candidatePath = parsed?.path ?? normalized
  const resolved = resolveRelativePath(candidatePath, props.cwd)
  const looksLikeAbsolutePath = (candidate: string): boolean => (
    candidate.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(candidate)
  )
  if (!looksLikeAbsolutePath(resolved)) return '#'
  const normalizedResolved = resolved.startsWith('/') ? resolved : `/${resolved}`
  return `/codex-local-edit${encodeURI(normalizedResolved)}`
}

const fileLinkContextMenuStyle = computed(() => ({
  left: `${String(fileLinkContextMenuX.value)}px`,
  top: `${String(fileLinkContextMenuY.value)}px`,
}))

function onFileLinkContextMenu(event: MouseEvent, pathValue: string): void {
  const browseUrl = toBrowseUrl(pathValue)
  if (browseUrl === '#') return
  fileLinkContextBrowseUrl.value = browseUrl
  const editUrl = toEditUrl(pathValue)
  fileLinkContextEditUrl.value = editUrl === '#' ? '' : editUrl
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function onUrlLinkContextMenu(event: MouseEvent, href: string): void {
  const normalizedHref = href.trim()
  if (!normalizedHref) return
  fileLinkContextBrowseUrl.value = normalizedHref
  fileLinkContextEditUrl.value = ''
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function closeFileLinkContextMenu(): void {
  if (!isFileLinkContextMenuVisible.value) return
  isFileLinkContextMenuVisible.value = false
}

function openFileLinkContextBrowse(): void {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function openFileLinkContextEdit(): void {
  const href = fileLinkContextEditUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function copyFileLinkContextLink(): Promise<void> {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  try {
    await navigator.clipboard.writeText(href)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = href
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function onWindowPointerDownForFileLinkContextMenu(event: PointerEvent): void {
  if (!isFileLinkContextMenuVisible.value) return
  const menu = fileLinkContextMenuRef.value
  if (!menu) {
    closeFileLinkContextMenu()
    return
  }
  const target = event.target
  if (target instanceof Node && menu.contains(target)) return
  closeFileLinkContextMenu()
}

function onWindowBlurForFileLinkContextMenu(): void {
  closeFileLinkContextMenu()
}

function onWindowKeydownForFileLinkContextMenu(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeFileLinkContextMenu()
}

function parseMessageBlocks(text: string): MessageBlock[] {
  if (!text.includes('![') || !text.includes('](')) {
    return [{ kind: 'text', value: text }]
  }

  const blocks: MessageBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match
    if (typeof match.index !== 'number') continue

    const start = match.index
    const end = start + fullMatch.length
    const imageUrl = toRenderableImageUrl(urlRaw.trim())
    if (!imageUrl) continue

    if (start > cursor) {
      blocks.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown: fullMatch })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push({ kind: 'text', value: text.slice(cursor) })
  }

  return blocks.length > 0 ? blocks : [{ kind: 'text', value: text }]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = params?.reason
  return typeof reason === 'string' ? reason.trim() : ''
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => option?.label)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onRespondApproval(requestId: number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0] || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}

function canRollbackMessage(message: UiMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant') return false
  if (typeof message.turnIndex !== 'number') return false
  if (props.isTurnInProgress || props.isRollingBack) return false
  return true
}

function canCopyMessage(message: UiMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant') return false
  return message.text.trim().length > 0
}

function canShowMessageActions(message: UiMessage): boolean {
  return canCopyMessage(message) || canRollbackMessage(message)
}

function findPreviousVisibleMessage(index: number): UiMessage | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = props.messages[cursor]
    if (!candidate || isCommandMessage(candidate)) continue
    return candidate
  }
  return null
}

function messageRoleLabel(message: UiMessage, index: number): string {
  const previousMessage = findPreviousVisibleMessage(index)
  if (
    previousMessage &&
    previousMessage.role === message.role &&
    previousMessage.messageType !== 'worked' &&
    message.messageType !== 'worked'
  ) {
    return ''
  }

  if (message.role === 'user') return '你'
  if (message.role === 'assistant') return 'Codex'
  if (message.role === 'system') return '系统'
  return ''
}

async function onCopyMessage(message: UiMessage): Promise<void> {
  if (!canCopyMessage(message)) return
  const text = message.text.trim()
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function onRollback(message: UiMessage): void {
  if (!canRollbackMessage(message)) return
  const prependText = message.role === 'user' ? message.text.trim() : ''
  emit('rollback', {
    turnIndex: message.turnIndex!,
    prependText: prependText.length > 0 ? prependText : undefined,
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function emitScrollState(container: HTMLElement): void {
  if (!props.activeThreadId) return
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0 ? Math.min(Math.max(container.scrollTop / maxScrollTop, 0), 1) : 1
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state: {
      scrollTop: container.scrollTop,
      isAtBottom: isAtBottom(container),
      scrollRatio,
    },
  })
}

function markBelowFoldUpdate(): void {
  if (shouldLockToBottom()) return
  hasPendingBelowFoldUpdates.value = true
}

function clearBelowFoldUpdates(): void {
  hasPendingBelowFoldUpdates.value = false
}

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  const savedState = props.scrollState
  if (!savedState || savedState.isAtBottom) {
    enforceBottomState()
    return
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  container.scrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  emitScrollState(container)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
  emitScrollState(container)
  clearBelowFoldUpdates()
}

function shouldLockToBottom(): boolean {
  const savedState = props.scrollState
  return !savedState || savedState.isAtBottom === true
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleScrollRestore(): Promise<void> {
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    applySavedScrollState()
    bindPendingImageHandlers()
    scheduleBottomLock()
  })
}

watch(
  () => props.messages,
  async (next, previous) => {
    if (props.isLoading) return

    for (const m of next) {
      if (m.messageType !== 'commandExecution' || !m.commandExecution) continue
      const prev = prevCommandStatuses.value[m.id]
      const cur = m.commandExecution.status
      if (prev === 'inProgress' && cur !== 'inProgress') {
        scheduleCollapse(m.id)
      }
      prevCommandStatuses.value[m.id] = cur
    }

    if (previous.length > 0) {
      markBelowFoldUpdate()
    }

    await scheduleScrollRestore()
  },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    markBelowFoldUpdate()
    await nextTick()
    if (!shouldLockToBottom()) return
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.activeThreadId,
  () => {
    modalImageUrl.value = ''
    closeFileLinkContextMenu()
    failedMarkdownImageKeys.value = new Set()
    clearBelowFoldUpdates()
  },
  { flush: 'post' },
)

watch(isFileLinkContextMenuVisible, (isVisible) => {
  if (isVisible) {
    window.addEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu, { capture: true })
    window.addEventListener('blur', onWindowBlurForFileLinkContextMenu)
    window.addEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
    return
  }

  window.removeEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu, { capture: true })
  window.removeEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.removeEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  emitScrollState(container)
  if (isAtBottom(container)) {
    clearBelowFoldUpdates()
  }
}

function jumpToLatest(): void {
  enforceBottomState()
  scheduleBottomLock(4)
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = toRenderableImageUrl(imageUrl)
}

function markdownImageKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${String(blockIndex)}`
}

function onMarkdownImageError(messageId: string, blockIndex: number): void {
  const next = new Set(failedMarkdownImageKeys.value)
  next.add(markdownImageKey(messageId, blockIndex))
  failedMarkdownImageKeys.value = next
}

function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
  return failedMarkdownImageKeys.value.has(markdownImageKey(messageId, blockIndex))
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

function alignLiveOverlayReasoningToBottom(): void {
  const reasoning = liveOverlayReasoningRef.value
  if (!reasoning) return
  reasoning.scrollTop = reasoning.scrollHeight
}

watch(
  () => props.liveOverlay?.reasoningText,
  async (reasoningText) => {
    if (!reasoningText) return
    await nextTick()
    alignLiveOverlayReasoningToBottom()
  },
)

onBeforeUnmount(() => {
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
  window.removeEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu, { capture: true })
  window.removeEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.removeEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply relative h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply flex flex-col gap-2.5 px-2 sm:px-5 py-2.5;
}

.conversation-loading-kicker {
  @apply text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f8577];
}

.conversation-loading-card {
  @apply block max-w-[min(72ch,100%)] rounded-[26px] border border-[#ece5d8] bg-white/90 px-4 py-4 shadow-[0_10px_26px_-22px_rgba(31,41,55,0.55)];
  position: relative;
  overflow: hidden;
}

.conversation-loading-card-user {
  @apply ml-auto bg-[#e9e3d7];
}

.conversation-loading-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%);
  transform: translateX(-100%);
  animation: conversation-skeleton-sweep 1.25s ease-in-out infinite;
}

.conversation-loading-line {
  @apply block h-3 rounded-full bg-[#efe7da];
}

.conversation-loading-line + .conversation-loading-line {
  @apply mt-2;
}

.conversation-loading-line-wide {
  width: 92%;
}

.conversation-loading-line-medium {
  width: 72%;
}

.conversation-loading-line-short {
  width: 48%;
}

.conversation-empty {
  @apply m-0 px-2 sm:px-5 py-2.5 text-sm text-[#8f8577];
}

.conversation-inline-loading {
  @apply sticky top-0 z-10 mx-2 sm:mx-5 mb-1.5 mt-1.5 flex items-center gap-2.5 rounded-full border border-[#ddd5c7] bg-[#fffcf7]/94 px-3 py-1.5 text-xs text-[#7b7062] shadow-sm backdrop-blur;
}

.conversation-inline-loading-bar {
  @apply block h-1.5 w-20 overflow-hidden rounded-full bg-[#ece4d6];
  position: relative;
}

.conversation-inline-loading-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 42%;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.15) 0%, rgba(15, 118, 110, 0.95) 100%);
  animation: conversation-loading-slide 1.1s ease-in-out infinite;
}

.conversation-inline-loading-text {
  @apply font-medium tracking-[0.01em];
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-5 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2.5 sm:gap-3;
  padding-bottom: max(0.875rem, env(safe-area-inset-bottom));
}

.conversation-jump-to-latest {
  @apply absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#d8cfbf] bg-[#fffdf8]/96 px-3 py-2 text-xs font-semibold text-[#544a3d] shadow-lg shadow-[#1f2937]/10 backdrop-blur transition hover:-translate-y-0.5 hover:border-[#bca98d] hover:text-[#1f2937];
  bottom: max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem));
}

.conversation-jump-to-latest.has-pending-updates {
  @apply border-[#b8ddd6] bg-[#eef8f5]/95 text-[#0f766e];
}

.conversation-jump-to-latest-icon {
  @apply h-4 w-4;
  transform: rotate(180deg);
}

.conversation-jump-to-latest-label {
  @apply hidden sm:inline;
}

.conversation-jump-to-latest-badge {
  @apply h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.16)];
}

@keyframes conversation-loading-slide {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(220%);
  }
}

@keyframes conversation-skeleton-sweep {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

.conversation-item {
  @apply m-0 w-full flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full max-w-180 mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.message-stack {
  @apply flex flex-col w-full gap-0.5;
}

.request-card {
  @apply w-full max-w-180 rounded-[22px] border border-[#ead9b5] bg-[#fff7e7] px-3 sm:px-3.5 py-2.5 sm:py-3 flex flex-col gap-1.5 shadow-[0_10px_26px_-22px_rgba(194,65,12,0.35)];
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-[#8a4a0d];
}

.request-meta {
  @apply m-0 text-xs leading-4 text-[#ad6b28];
}

.request-reason {
  @apply m-0 text-sm leading-5 text-[#6a3a0b] whitespace-pre-wrap;
}

.request-actions {
  @apply flex flex-wrap gap-1.5 sm:gap-2;
}

.request-button {
  @apply rounded-xl border border-[#e2c486] bg-white px-3 py-1.5 text-xs text-[#7d4911] hover:bg-[#fff0c9] transition;
}

.request-button-primary {
  @apply border-[#c56a12] bg-[#c56a12] text-white hover:bg-[#ab5b0f];
}

.request-user-input {
  @apply flex flex-col gap-2.5;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-select {
  @apply h-8 rounded-xl border border-[#e2c486] bg-white px-2 text-sm text-[#7d4911];
}

.request-input {
  @apply h-8 rounded-xl border border-[#e2c486] bg-white px-2 text-sm text-[#7d4911] placeholder:text-[#c28a4a];
}

.live-overlay-inline {
  @apply w-full max-w-180 rounded-[24px] border border-[#cfe6e0] bg-[#f4fbf9] px-3.5 py-2.5 flex flex-col gap-1.5 shadow-[0_10px_26px_-22px_rgba(15,118,110,0.45)];
}

.live-overlay-label {
  @apply m-0 text-[11px] uppercase tracking-[0.16em] font-semibold text-[#0f766e];
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-[#33564f] whitespace-pre-wrap;
  display: block;
  max-height: calc(1.25rem * 5);
  overflow: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(to top, black 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, black 75%, transparent 100%);
}

.live-overlay-reasoning::-webkit-scrollbar {
  display: none;
}

.live-overlay-error {
  @apply m-0 text-sm leading-5 text-[#c2410c] whitespace-pre-wrap;
}

.message-body {
  @apply flex flex-col max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-image-list {
  @apply list-none m-0 mb-1.5 p-0 flex flex-wrap gap-1.5;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-2xl overflow-hidden border border-[#ddd5c7] bg-white p-0 transition hover:border-[#bca98d];
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-file-attachments {
  @apply mb-1.5 flex flex-wrap gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-full border border-[#ddd5c7] bg-[#f7f1e5] px-2.5 py-1 text-xs text-[#6d6354];
}

.message-file-chip-icon {
  @apply text-[10px] leading-none;
}

.message-file-chip-name {
  @apply truncate max-w-40 font-mono;
}

.message-card {
  @apply max-w-[min(76ch,100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text-flow {
  @apply flex flex-col gap-1.5;
}

.message-text {
  @apply m-0 text-sm leading-[1.65] whitespace-pre-wrap text-[#2b241d];
}

.message-bold-text {
  @apply font-semibold text-[#1f2937];
}

.message-markdown-image {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-inline-code {
  @apply rounded-xl border border-[#dfd7ca] bg-[#f5f1e8] px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-[#2d261f] font-mono;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-file-link-wrap {
  @apply inline-block align-baseline;
}

.file-link-context-menu {
  @apply fixed z-50 min-w-28 rounded-2xl border border-[#ddd5c7] bg-[#fffcf7] p-1.5 shadow-lg;
}

.file-link-context-menu-item {
  @apply block w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-[#544a3d] hover:bg-[#f1ebde];
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-eyebrow {
  @apply mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8577];
}

.message-eyebrow[data-role='user'] {
  @apply text-[#73695d];
}

.message-eyebrow[data-role='assistant'] {
  @apply text-[#0f766e];
}

.message-eyebrow[data-role='system'] {
  @apply text-[#8a6a11];
}

.message-card[data-role='user'] {
  @apply rounded-[22px] border border-[#d8cfbf] bg-[#ebe4d8] px-3 sm:px-3.5 py-2 sm:py-2.5 max-w-[min(560px,100%)] shadow-[0_10px_24px_-24px_rgba(31,41,55,0.8)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'] {
  @apply rounded-[24px] border border-[#ece5d8] bg-white/88 px-3.5 py-2.5 shadow-[0_10px_26px_-22px_rgba(31,41,55,0.55)];
}

.message-card[data-role='system'] {
  @apply rounded-[20px] border border-[#e8dfcf] bg-[#f7f2e8] px-3.5 py-2.5;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator-wrap {
  @apply w-full flex flex-col gap-0;
}

.worked-separator {
  @apply w-full flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0;
}

.worked-chevron {
  @apply text-[9px] text-zinc-400 transition-transform duration-200 flex-shrink-0;
}

.worked-chevron-open {
  transform: rotate(90deg);
}

.worked-separator-line {
  @apply h-px bg-[#d6ccbd] flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-5 font-medium text-[#5b5146];
}

.worked-details {
  @apply flex flex-col gap-1.5 pt-1.5;
}

.worked-cmd-item {
  @apply flex flex-col;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-2 sm:p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-[#ddd5c7] flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}

.conversation-item-actionable:hover .message-action-button {
  @apply opacity-100;
}

.message-actions {
  @apply mt-0.5 inline-flex items-center gap-1 self-start;
}

.message-action-button {
  @apply opacity-0 inline-flex items-center gap-1 self-start rounded-full border border-[#ddd5c7] bg-[#fffcf7] px-2.5 py-1 text-xs text-[#7b7062] transition hover:bg-[#f1ebde] hover:text-[#544a3d] hover:border-[#cdbfa9];
}

.message-action-icon {
  @apply w-3.5 h-3.5;
}

.message-action-label {
  @apply leading-none;
}

.cmd-row {
  @apply w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-[16px] border border-[#ddd5c7] bg-[#f8f4ec] cursor-pointer transition text-left hover:bg-[#f1ebde];
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}

.cmd-row.cmd-expanded {
  @apply rounded-b-none border-b-0;
}

.cmd-chevron {
  @apply text-[10px] text-[#8f8577] transition-transform duration-150 flex-shrink-0;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-label {
  @apply text-xs font-mono text-[#544a3d];
  flex: 0 0 auto;
  min-width: max-content;
}

.cmd-status {
  @apply text-[11px] font-medium flex-shrink-0;
}

.cmd-status-running .cmd-status {
  @apply text-[#0f766e];
}

.cmd-status-ok .cmd-status {
  @apply text-[#0f766e];
}

.cmd-status-error .cmd-status {
  @apply text-[#c2410c];
}

.cmd-output-wrap {
  @apply rounded-b-lg bg-zinc-900;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out, border-color 300ms ease-out;
  border: 1px solid transparent;
  border-top: none;
}

.cmd-output-wrap.cmd-output-visible {
  grid-template-rows: 1fr;
  border-color: #d8cfbf;
}

.cmd-output-wrap.cmd-output-collapsing {
  grid-template-rows: 1fr;
  border-color: #d8cfbf;
}

.cmd-output-inner {
  overflow: hidden;
  min-height: 0;
}

.cmd-output {
  @apply m-0 px-2.5 py-2 text-xs font-mono text-zinc-200 max-h-56 overflow-x-auto overflow-y-auto;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}
</style>
