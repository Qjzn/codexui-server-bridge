<template>
  <section class="conversation-root">
    <p v-if="isLoading" class="conversation-loading">Loading messages...</p>

    <p
      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      No messages in this thread yet.
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
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
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">Accept</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">Accept for Session</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">Decline</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">Cancel</button>
              </section>

              <section v-else-if="request.method === 'item/fileChange/requestApproval'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">Accept</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">Accept for Session</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">Decline</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">Cancel</button>
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
                    placeholder="Other answer"
                    @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
                  />
                </div>

                <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(request)">
                  Submit Answers
                </button>
              </section>

              <section v-else-if="request.method === 'item/tool/call'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(request.id)">Fail Tool Call</button>
                <button type="button" class="request-button" @click="onRespondToolCallSuccess(request.id)">Success (Empty)</button>
              </section>

              <section v-else class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(request.id)">Return Empty Result</button>
                <button type="button" class="request-button" @click="onRejectUnknownRequest(request.id)">Reject Request</button>
              </section>
            </article>
          </div>
        </div>
      </li>

      <li
        v-for="message in messages"
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
                        :alt="block.alt || 'Embedded message image'"
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
                title="Copy message text"
                @click="onCopyMessage(message)"
              >
                <IconTablerCopy class="message-action-icon" />
                <span class="message-action-label">Copy</span>
              </button>
              <button
                v-if="canRollbackMessage(message)"
                class="message-action-button"
                type="button"
                title="Rollback to this message (remove this turn and all after it)"
                @click="onRollback(message)"
              >
                <IconTablerArrowBackUp class="message-action-icon" />
                <span class="message-action-label">Rollback</span>
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

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
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
        Open link
      </button>
      <button type="button" class="file-link-context-menu-item" @click="copyFileLinkContextLink">
        Copy link
      </button>
      <button
        v-if="fileLinkContextEditUrl"
        type="button"
        class="file-link-context-menu-item"
        @click="openFileLinkContextEdit"
      >
        Edit file
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ThreadScrollState, UiLiveOverlay, UiMessage, UiServerRequest } from '../../types/codex'
import IconTablerX from '../icons/IconTablerX.vue'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'
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
    case 'inProgress': return '⟳ Running'
    case 'completed': return ce.exitCode === 0 ? '✓ Completed' : `✗ Exit ${ce.exitCode ?? '?'}`
    case 'failed': return '✗ Failed'
    case 'declined': return '⊘ Declined'
    case 'interrupted': return '⊘ Interrupted'
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

function trimLinkWrappers(value: string): { core: string; leading: string; trailing: string } {
  let core = value
  let leading = ''
  let trailing = ''

  while (/^['"`“‘]/u.test(core)) {
    leading += core[0]
    core = core.slice(1)
  }
  while (/['"`”’]$/u.test(core)) {
    trailing = core.slice(-1) + trailing
    core = core.slice(0, -1)
  }

  return { core, leading, trailing }
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
  const pattern = /https?:\/\/\S+|file:\/\/\S+|\S*[\\/]\S+/gu
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    if (typeof match.index !== 'number') continue
    const start = match.index
    const end = start + match[0].length

    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    let token = match[0]
    let trailingPunctuation = ''
    while (/[.,;:]$/u.test(token)) {
      trailingPunctuation = token.slice(-1) + trailingPunctuation
      token = token.slice(0, -1)
    }
    const wrapped = trimLinkWrappers(token)
    token = wrapped.core
    const leading = wrapped.leading
    const trailing = wrapped.trailing + trailingPunctuation

    if (leading) {
      segments.push({ kind: 'text', value: leading })
    }

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      segments.push({ kind: 'bold', value: token.slice(2, -2) })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else if (/^https?:\/\//u.test(token)) {
      segments.push({ kind: 'url', value: token, href: token })
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

    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }

  return applyBoldMarkersAcrossTextSegments(segments)
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

    if (/^https?:\/\//u.test(target)) {
      segments.push({ kind: 'url', value: label || target, href: target })
    } else {
      const ref = parseFileReference(target)
      if (ref) {
        segments.push({
          kind: 'file',
          value: target,
          path: ref.path,
          displayPath: label || target,
          downloadName: getBasename(ref.path),
        })
      } else {
        segments.push({ kind: 'text', value: text.slice(openBracket, markdownToken.end) })
      }
    }

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
        if (/^https?:\/\//u.test(markdownLink.target)) {
          segments.push({
            kind: 'url',
            value: markdownLink.label || markdownLink.target,
            href: markdownLink.target,
          })
        } else {
          const markdownFileReference = parseFileReference(markdownLink.target)
          if (markdownFileReference) {
            segments.push({
              kind: 'file',
              value: markdownLink.target,
              path: markdownFileReference.path,
              displayPath: markdownLink.label || markdownLink.target,
              downloadName: getBasename(markdownFileReference.path),
            })
          } else {
            segments.push({ kind: 'code', value: token })
          }
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
  async (next) => {
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

    await scheduleScrollRestore()
  },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    await nextTick()
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
  @apply h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-2 sm:px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-2 sm:px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2 sm:gap-3;
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
  @apply flex flex-col w-full;
}

.request-card {
  @apply w-full max-w-180 rounded-xl border border-amber-300 bg-amber-50 px-3 sm:px-4 py-2 sm:py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap;
}

.request-actions {
  @apply flex flex-wrap gap-1.5 sm:gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
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
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.live-overlay-inline {
  @apply w-full max-w-180 px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap;
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
  @apply m-0 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
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
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-file-attachments {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600;
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
  @apply flex flex-col gap-2;
}

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap text-slate-800;
}

.message-bold-text {
  @apply font-semibold text-slate-900;
}

.message-markdown-image {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-inline-code {
  @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-slate-900 font-mono;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-file-link-wrap {
  @apply inline-block align-baseline;
}

.file-link-context-menu {
  @apply fixed z-50 min-w-28 rounded-md border border-zinc-200 bg-white p-1 shadow-lg;
}

.file-link-context-menu-item {
  @apply block w-full rounded px-2 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl bg-slate-200 px-3 sm:px-4 py-2 sm:py-3 max-w-[min(560px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
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
  @apply w-full flex items-center gap-3 bg-transparent border-none cursor-pointer p-0;
}

.worked-chevron {
  @apply text-[9px] text-zinc-400 transition-transform duration-200 flex-shrink-0;
}

.worked-chevron-open {
  transform: rotate(90deg);
}

.worked-separator-line {
  @apply h-px bg-zinc-300/80 flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal text-slate-800;
}

.worked-details {
  @apply flex flex-col gap-1.5 pt-2;
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
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
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
  @apply mt-1 inline-flex items-center gap-1 self-start;
}

.message-action-button {
  @apply opacity-0 inline-flex items-center gap-1 self-start rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 hover:border-zinc-300;
}

.message-action-icon {
  @apply w-3.5 h-3.5;
}

.message-action-label {
  @apply leading-none;
}

.cmd-row {
  @apply w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer transition text-left hover:bg-zinc-100;
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
  @apply text-[10px] text-zinc-400 transition-transform duration-150 flex-shrink-0;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-label {
  @apply text-xs font-mono text-zinc-700;
  flex: 0 0 auto;
  min-width: max-content;
}

.cmd-status {
  @apply text-[11px] font-medium flex-shrink-0;
}

.cmd-status-running .cmd-status {
  @apply text-amber-600;
}

.cmd-status-ok .cmd-status {
  @apply text-emerald-600;
}

.cmd-status-error .cmd-status {
  @apply text-rose-600;
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
  border-color: #e4e4e7;
}

.cmd-output-wrap.cmd-output-collapsing {
  grid-template-rows: 1fr;
  border-color: #e4e4e7;
}

.cmd-output-inner {
  overflow: hidden;
  min-height: 0;
}

.cmd-output {
  @apply m-0 px-3 py-2 text-xs font-mono text-zinc-200 max-h-60 overflow-x-auto overflow-y-auto;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}
</style>
