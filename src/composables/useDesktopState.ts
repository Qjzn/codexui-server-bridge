import { computed, ref } from 'vue'
import {
  autoCommitWorktreeChanges,
  archiveThread,
  forkThread,
  getAccountRateLimits,
  renameThread,
  getAvailableModelIds,
  getCurrentModelConfig,
  getPendingServerRequests,
  getSkillsList,
  getThreadDetail,
  getThreadRuntimeSnapshot,
  interruptThreadTurn,
  replyToServerRequest,
  rollbackThread,
  getThreadGroups,
  getWorkspaceRootsState,
  setCodexSpeedMode,
  setDefaultModel,
  setWorkspaceRootsState,
  getThreadTitleCache,
  persistThreadTitle,
  generateThreadTitle,
  resumeThread,
  rollbackWorktreeToMessage,
  startThread,
  subscribeCodexNotifications,
  startThreadTurn,
  type RpcConnectionState,
  type RpcNotification,
  type SkillInfo,
} from '../api/codexGateway'
import type {
  CommandExecutionData,
  ReasoningEffort,
  SpeedMode,
  ThreadScrollState,
  UiLiveOverlay,
  UiMessage,
  UiProjectGroup,
  UiRateLimitSnapshot,
  UiServerRequest,
  UiServerRequestReply,
  UiThread,
} from '../types/codex'
import { isAbortLikeError } from '../api/codexErrors'
import { normalizePathForUi, toProjectName } from '../pathUtils.js'

function flattenThreads(groups: UiProjectGroup[]): UiThread[] {
  return groups.flatMap((group) => group.threads)
}

function shouldRefreshMessagesFromNotification(method: string): boolean {
  return (
    method === 'turn/started' ||
    method === 'turn/completed' ||
    method === 'item/completed' ||
    method === 'error' ||
    method === 'server/request' ||
    method === 'server/request/resolved' ||
    method.startsWith('thread/')
  )
}

function shouldRefreshThreadListFromNotification(method: string): boolean {
  return (
    method === 'turn/completed' ||
    method === 'thread/name/updated' ||
    method.startsWith('thread/')
  )
}

function shouldUrgentlyRefreshFromNotification(method: string): boolean {
  return method === 'turn/completed' || method === 'item/completed' || method === 'error'
}

function shouldBoostSyncForNotification(method: string): boolean {
  return (
    method === 'turn/started' ||
    method === 'turn/completed' ||
    method === 'error' ||
    method.startsWith('item/') ||
    method.startsWith('thread/')
  )
}

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1'
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'
const SELECTED_MODEL_STORAGE_KEY = 'codex-web-local.selected-model-id.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const HIDDEN_THREAD_IDS_STORAGE_KEY = 'codex-web-local.hidden-thread-ids.v1'
const QUEUED_MESSAGES_STORAGE_KEY = 'codex-web-local.queued-messages.v1'
const EVENT_SYNC_DEBOUNCE_MS = 220
const BACKGROUND_SYNC_INTERVAL_MS = 4000
const ACTIVE_THREAD_DETAIL_SYNC_INTERVAL_MS = 4000
const ACTIVE_THREAD_DETAIL_SYNC_IDLE_MS = 9000
const ACTIVE_SYNC_BOOST_INTERVAL_MS = 1500
const ACTIVE_SYNC_BOOST_WINDOW_MS = 18000
const ACTIVE_SYNC_THREAD_LIST_INTERVAL_MS = 12000
const ACTIVE_SYNC_STALE_MS = 8000
const STALE_THREAD_ACTIVE_TURN_TTL_MS = 5 * 60 * 1000
const STALE_THREAD_ACTIVE_TURN_IMMEDIATE_MS = 20 * 60 * 1000
const OPTIMISTIC_EXECUTION_RECOVERY_GRACE_MS = 6000
const UNKNOWN_ACTIVE_TURN_ID = '__unknown_active_turn__'
const LIVE_DELTA_BATCH_MS = 48
const NOTIFICATION_STALE_MS = 10000
const THREAD_LIST_REFRESH_INTERVAL_MS = 30000
const RATE_LIMIT_REFRESH_DEBOUNCE_MS = 500
const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const GLOBAL_SERVER_REQUEST_SCOPE = '__global__'
const MODEL_FALLBACK_ID = 'gpt-5.2-codex'
const AUTO_COMMIT_MESSAGE_FALLBACK = 'Auto-commit from Codex rollback chat turn'

type FileAttachment = { label: string; path: string; fsPath: string }
type QueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: FileAttachment[]
}

type RealtimeConnectionState = RpcConnectionState

function loadReadStateMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(READ_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function saveReadStateMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(state))
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

function localizeActivityText(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''

  const directMap: Record<string, string> = {
    'Thinking': '思考中',
    'Running command': '执行命令',
    'Preparing context': '准备上下文',
    'Streaming reply': '生成回复',
    'Reading messages': '读取消息',
    'Syncing': '同步中',
    'Queued': '排队中',
    'Model': '模型',
    'Speed': '速度',
    'Fast': '快速',
    'Standard': '标准',
    'default': '默认',
    'minimal': '极低',
    'low': '低',
    'medium': '中',
    'high': '高',
    'xhigh': '极高',
    'none': '无',
  }

  if (directMap[normalized]) return directMap[normalized]

  const colonMatch = normalized.match(/^(Model|Thinking|Speed):\s*(.+)$/u)
  if (colonMatch) {
    const label = directMap[colonMatch[1]] ?? colonMatch[1]
    const rawValue = colonMatch[2].trim()
    const translatedValue = directMap[rawValue] ?? rawValue
    return `${label}：${translatedValue}`
  }

  return normalized
}

function normalizeThreadScrollState(value: unknown): ThreadScrollState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const rawState = value as Record<string, unknown>
  if (typeof rawState.scrollTop !== 'number' || !Number.isFinite(rawState.scrollTop)) return null
  if (typeof rawState.isAtBottom !== 'boolean') return null

  const normalized: ThreadScrollState = {
    scrollTop: Math.max(0, rawState.scrollTop),
    isAtBottom: rawState.isAtBottom,
  }

  if (typeof rawState.scrollRatio === 'number' && Number.isFinite(rawState.scrollRatio)) {
    normalized.scrollRatio = clamp(rawState.scrollRatio, 0, 1)
  }

  return normalized
}

function loadThreadScrollStateMap(): Record<string, ThreadScrollState> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(SCROLL_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, ThreadScrollState> = {}
    for (const [threadId, state] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalizedState = normalizeThreadScrollState(state)
      if (normalizedState) {
        normalizedMap[threadId] = normalizedState
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

function saveThreadScrollStateMap(state: Record<string, ThreadScrollState>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SCROLL_STATE_STORAGE_KEY, JSON.stringify(state))
}

function loadSelectedThreadId(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(SELECTED_THREAD_STORAGE_KEY)
  return raw ?? ''
}

function saveSelectedThreadId(threadId: string): void {
  if (typeof window === 'undefined') return
  if (!threadId) {
    window.localStorage.removeItem(SELECTED_THREAD_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_THREAD_STORAGE_KEY, threadId)
}

function loadSelectedModelId(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)?.trim() ?? ''
}

function saveSelectedModelId(modelId: string): void {
  if (typeof window === 'undefined') return
  const normalizedModelId = modelId.trim()
  if (!normalizedModelId) {
    window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, normalizedModelId)
}

function loadProjectOrder(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const order: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0) continue
      const normalizedItem = toProjectName(item)
      if (normalizedItem.length > 0 && !order.includes(normalizedItem)) {
        order.push(normalizedItem)
      }
    }
    return order
  } catch {
    return []
  }
}

function saveProjectOrder(order: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(order))
}

function loadProjectDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROJECT_DISPLAY_NAME_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const displayNames: Record<string, string> = {}
    for (const [projectName, displayName] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedProjectName = typeof projectName === 'string' ? toProjectName(projectName) : ''
      if (normalizedProjectName.length > 0 && typeof displayName === 'string') {
        displayNames[normalizedProjectName] = displayName
      }
    }
    return displayNames
  } catch {
    return {}
  }
}

function saveProjectDisplayNames(displayNames: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, JSON.stringify(displayNames))
}

function loadHiddenThreadIds(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(HIDDEN_THREAD_IDS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function saveHiddenThreadIds(threadIds: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(HIDDEN_THREAD_IDS_STORAGE_KEY, JSON.stringify(threadIds))
}

function normalizeQueuedMessage(value: unknown): QueuedMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (!id) return null

  const text = typeof row.text === 'string' ? row.text : ''
  const imageUrls = Array.isArray(row.imageUrls)
    ? row.imageUrls.filter((item): item is string => typeof item === 'string')
    : []
  const skills = Array.isArray(row.skills)
    ? row.skills
      .filter((item): item is { name: string; path: string } => (
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as Record<string, unknown>).name === 'string'
        && typeof (item as Record<string, unknown>).path === 'string'
      ))
      .map((item) => ({ name: item.name, path: item.path }))
    : []
  const fileAttachments = Array.isArray(row.fileAttachments)
    ? row.fileAttachments
      .filter((item): item is FileAttachment => (
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as Record<string, unknown>).label === 'string'
        && typeof (item as Record<string, unknown>).path === 'string'
        && typeof (item as Record<string, unknown>).fsPath === 'string'
      ))
      .map((item) => ({ label: item.label, path: item.path, fsPath: item.fsPath }))
    : []

  return {
    id,
    text,
    imageUrls,
    skills,
    fileAttachments,
  }
}

function loadQueuedMessagesMap(): Record<string, QueuedMessage[]> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(QUEUED_MESSAGES_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: Record<string, QueuedMessage[]> = {}
    for (const [threadId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId || !Array.isArray(rows)) continue
      const normalizedRows = rows
        .map((row) => normalizeQueuedMessage(row))
        .filter((row): row is QueuedMessage => row !== null)
      if (normalizedRows.length > 0) {
        next[threadId] = normalizedRows
      }
    }
    return next
  } catch {
    return {}
  }
}

function saveQueuedMessagesMap(queueByThreadId: Record<string, QueuedMessage[]>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(QUEUED_MESSAGES_STORAGE_KEY, JSON.stringify(queueByThreadId))
  } catch {
    // Keep in-memory queue state when storage is unavailable or quota-limited.
  }
}

function mergeProjectOrder(previousOrder: string[], incomingGroups: UiProjectGroup[]): string[] {
  const nextOrder: string[] = []

  for (const projectName of previousOrder) {
    if (!nextOrder.includes(projectName)) {
      nextOrder.push(projectName)
    }
  }

  for (const group of incomingGroups) {
    if (!nextOrder.includes(group.projectName)) {
      nextOrder.push(group.projectName)
    }
  }

  return areStringArraysEqual(previousOrder, nextOrder) ? previousOrder : nextOrder
}

function orderGroupsByProjectOrder(incoming: UiProjectGroup[], projectOrder: string[]): UiProjectGroup[] {
  const incomingByName = new Map(incoming.map((group) => [group.projectName, group]))
  const ordered: UiProjectGroup[] = projectOrder
    .map((projectName) => incomingByName.get(projectName) ?? null)
    .filter((group): group is UiProjectGroup => group !== null && group.threads.length > 0)

  for (const group of incoming) {
    if (!projectOrder.includes(group.projectName)) {
      ordered.push(group)
    }
  }

  return ordered
}

function areStringArraysEqual(first?: string[], second?: string[]): boolean {
  const left = Array.isArray(first) ? first : []
  const right = Array.isArray(second) ? second : []
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function reorderStringArray(items: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return items
  }

  if (fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function areCommandExecutionsEqual(first?: CommandExecutionData, second?: CommandExecutionData): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return (
    first.status === second.status &&
    first.aggregatedOutput === second.aggregatedOutput &&
    first.exitCode === second.exitCode &&
    first.durationMs === second.durationMs &&
    first.startedAtMs === second.startedAtMs
  )
}

function isUnsupportedChatGptModelError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('not supported when using codex with a chatgpt account') ||
    message.includes('model is not supported')
  )
}

function areMessageFieldsEqual(first: UiMessage, second: UiMessage): boolean {
  return (
    first.id === second.id &&
    first.role === second.role &&
    first.text === second.text &&
    areStringArraysEqual(first.images, second.images) &&
    first.messageType === second.messageType &&
    first.rawPayload === second.rawPayload &&
    first.isUnhandled === second.isUnhandled &&
    areCommandExecutionsEqual(first.commandExecution, second.commandExecution) &&
    first.turnIndex === second.turnIndex
  )
}

function areMessageArraysEqual(first: UiMessage[], second: UiMessage[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

function mergeMessages(
  previous: UiMessage[],
  incoming: UiMessage[],
  options: { preserveMissing?: boolean } = {},
): UiMessage[] {
  const previousById = new Map(previous.map((message) => [message.id, message]))
  const incomingById = new Map(incoming.map((message) => [message.id, message]))

  const mergedIncoming = incoming.map((incomingMessage) => {
    const previousMessage = previousById.get(incomingMessage.id)
    if (previousMessage && areMessageFieldsEqual(previousMessage, incomingMessage)) {
      return previousMessage
    }
    return incomingMessage
  })

  if (options.preserveMissing !== true) {
    return areMessageArraysEqual(previous, mergedIncoming) ? previous : mergedIncoming
  }

  const mergedFromPrevious = previous.map((previousMessage) => {
    const nextMessage = incomingById.get(previousMessage.id)
    if (!nextMessage) {
      return previousMessage
    }
    if (areMessageFieldsEqual(previousMessage, nextMessage)) {
      return previousMessage
    }
    return nextMessage
  })

  const previousIdSet = new Set(previous.map((message) => message.id))
  const appended = mergedIncoming.filter((message) => !previousIdSet.has(message.id))
  const merged = [...mergedFromPrevious, ...appended]

  return areMessageArraysEqual(previous, merged) ? previous : merged
}

function normalizeMessageText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function removeRedundantLiveAgentMessages(previous: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const incomingAssistantTexts = new Set(
    incoming
      .filter((message) => message.role === 'assistant')
      .map((message) => normalizeMessageText(message.text))
      .filter((text) => text.length > 0),
  )

  if (incomingAssistantTexts.size === 0) {
    return previous
  }

  const next = previous.filter((message) => {
    if (message.messageType !== 'agentMessage.live') return true
    const normalized = normalizeMessageText(message.text)
    if (normalized.length === 0) return false
    return !incomingAssistantTexts.has(normalized)
  })

  return next.length === previous.length ? previous : next
}

function upsertMessage(previous: UiMessage[], nextMessage: UiMessage): UiMessage[] {
  const existingIndex = previous.findIndex((message) => message.id === nextMessage.id)
  if (existingIndex < 0) {
    return [...previous, nextMessage]
  }

  const existing = previous[existingIndex]
  if (areMessageFieldsEqual(existing, nextMessage)) {
    return previous
  }

  const next = [...previous]
  next.splice(existingIndex, 1, nextMessage)
  return next
}

type TurnSummaryState = {
  turnId: string
  durationMs: number
}

type TurnActivityState = {
  label: string
  details: string[]
}

type TurnErrorState = {
  message: string
}

type TurnStartedInfo = {
  threadId: string
  turnId: string
  startedAtMs: number
}

type TurnCompletedInfo = {
  threadId: string
  turnId: string
  completedAtMs: number
  startedAtMs?: number
}

type ThreadReadActiveState = {
  turnId: string
  firstObservedAtMs: number
  lastObservedAtMs: number
}

const WORKED_MESSAGE_TYPE = 'worked'

function parseIsoTimestamp(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function formatTurnDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '<1s'
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`)
  }

  const displaySeconds = seconds > 0 || parts.length === 0 ? seconds : 0
  parts.push(`${displaySeconds}s`)
  return parts.join(' ')
}

function areTurnSummariesEqual(first?: TurnSummaryState, second?: TurnSummaryState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return first.turnId === second.turnId && first.durationMs === second.durationMs
}

function areTurnActivitiesEqual(first?: TurnActivityState, second?: TurnActivityState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  if (first.label !== second.label) return false
  if (first.details.length !== second.details.length) return false
  for (let index = 0; index < first.details.length; index += 1) {
    if (first.details[index] !== second.details[index]) return false
  }
  return true
}

function buildTurnSummaryMessage(summary: TurnSummaryState): UiMessage {
  return {
    id: `turn-summary:${summary.turnId}`,
    role: 'system',
    text: `Worked for ${formatTurnDuration(summary.durationMs)}`,
    messageType: WORKED_MESSAGE_TYPE,
  }
}

function findLastAssistantMessageIndex(messages: UiMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return index
    }
  }
  return -1
}

function insertTurnSummaryMessage(messages: UiMessage[], summary: TurnSummaryState): UiMessage[] {
  const summaryMessage = buildTurnSummaryMessage(summary)
  const sanitizedMessages = messages.filter((message) => message.messageType !== WORKED_MESSAGE_TYPE)
  const insertIndex = findLastAssistantMessageIndex(sanitizedMessages)
  if (insertIndex < 0) {
    return [...sanitizedMessages, summaryMessage]
  }
  const next = [...sanitizedMessages]
  next.splice(insertIndex, 0, summaryMessage)
  return next
}

function omitKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function areThreadFieldsEqual(first: UiThread, second: UiThread): boolean {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.projectName === second.projectName &&
    first.cwd === second.cwd &&
    first.createdAtIso === second.createdAtIso &&
    first.updatedAtIso === second.updatedAtIso &&
    first.preview === second.preview &&
    first.unread === second.unread &&
    first.inProgress === second.inProgress
  )
}

function areThreadArraysEqual(first: UiThread[], second: UiThread[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

function areGroupArraysEqual(first: UiProjectGroup[], second: UiProjectGroup[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

function pruneThreadStateMap<T>(stateMap: Record<string, T>, threadIds: Set<string>): Record<string, T> {
  const nextEntries = Object.entries(stateMap).filter(([threadId]) => threadIds.has(threadId))
  if (nextEntries.length === Object.keys(stateMap).length) {
    return stateMap
  }
  return Object.fromEntries(nextEntries) as Record<string, T>
}

function mergeThreadGroups(
  previous: UiProjectGroup[],
  incoming: UiProjectGroup[],
): UiProjectGroup[] {
  const previousGroupsByName = new Map(previous.map((group) => [group.projectName, group]))
  const mergedGroups: UiProjectGroup[] = incoming.map((incomingGroup) => {
    const previousGroup = previousGroupsByName.get(incomingGroup.projectName)
    const previousThreadsById = new Map(previousGroup?.threads.map((thread) => [thread.id, thread]) ?? [])

    const mergedThreads = incomingGroup.threads.map((incomingThread) => {
      const previousThread = previousThreadsById.get(incomingThread.id)
      if (previousThread && areThreadFieldsEqual(previousThread, incomingThread)) {
        return previousThread
      }
      return incomingThread
    })

    if (
      previousGroup &&
      previousGroup.projectName === incomingGroup.projectName &&
      areThreadArraysEqual(previousGroup.threads, mergedThreads)
    ) {
      return previousGroup
    }

    return {
      projectName: incomingGroup.projectName,
      threads: mergedThreads,
    }
  })

  return areGroupArraysEqual(previous, mergedGroups) ? previous : mergedGroups
}

function mergeIncomingWithLocalInProgressThreads(
  previous: UiProjectGroup[],
  incoming: UiProjectGroup[],
  inProgressById: Record<string, boolean>,
): UiProjectGroup[] {
  const incomingThreadIds = new Set(flattenThreads(incoming).map((thread) => thread.id))
  const localInProgressThreads = flattenThreads(previous).filter(
    (thread) => inProgressById[thread.id] === true && !incomingThreadIds.has(thread.id),
  )

  if (localInProgressThreads.length === 0) {
    return incoming
  }

  const incomingByProjectName = new Map(incoming.map((group) => [group.projectName, group]))
  const merged: UiProjectGroup[] = incoming.map((group) => ({
    projectName: group.projectName,
    threads: [...group.threads],
  }))

  for (const thread of localInProgressThreads) {
    const existingGroup = incomingByProjectName.get(thread.projectName)
    if (existingGroup) {
      const mergedGroupIndex = merged.findIndex((group) => group.projectName === thread.projectName)
      if (mergedGroupIndex >= 0) {
        merged[mergedGroupIndex] = {
          projectName: merged[mergedGroupIndex].projectName,
          threads: [thread, ...merged[mergedGroupIndex].threads],
        }
      }
      continue
    }

    merged.push({
      projectName: thread.projectName,
      threads: [thread],
    })
  }

  return merged
}

function toProjectNameFromWorkspaceRoot(value: string): string {
  return toProjectName(value)
}

function toOptimisticThreadTitle(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return 'Untitled thread'
  return firstLine.slice(0, 80)
}

export function useDesktopState() {
  const projectGroups = ref<UiProjectGroup[]>([])
  const sourceGroups = ref<UiProjectGroup[]>([])
  const selectedThreadId = ref(loadSelectedThreadId())
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveAgentMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveReasoningTextByThreadId = ref<Record<string, string>>({})
  const liveCommandsByThreadId = ref<Record<string, UiMessage[]>>({})
  const inProgressById = ref<Record<string, boolean>>({})
  type PendingTurnRequest = {
    text: string
    imageUrls: string[]
    skills: Array<{ name: string; path: string }>
    fileAttachments: FileAttachment[]
    effort: ReasoningEffort | ''
    fallbackRetried: boolean
    createdAtMs: number
  }
  type BufferedAgentDelta = { threadId: string; messageId: string; delta: string }
  type BufferedCommandDelta = { threadId: string; itemId: string; delta: string }
  const queuedMessagesByThreadId = ref<Record<string, QueuedMessage[]>>(loadQueuedMessagesMap())
  const queueProcessingByThreadId = ref<Record<string, boolean>>({})
  const eventUnreadByThreadId = ref<Record<string, boolean>>({})
  const availableModelIds = ref<string[]>([])
  const selectedModelId = ref(loadSelectedModelId())
  const selectedReasoningEffort = ref<ReasoningEffort | ''>('medium')
  const selectedSpeedMode = ref<SpeedMode>('standard')
  const readStateByThreadId = ref<Record<string, string>>(loadReadStateMap())
  const scrollStateByThreadId = ref<Record<string, ThreadScrollState>>(loadThreadScrollStateMap())
  const projectOrder = ref<string[]>(loadProjectOrder())
  const projectDisplayNameById = ref<Record<string, string>>(loadProjectDisplayNames())
  const hiddenThreadIds = ref<string[]>(loadHiddenThreadIds())
  const loadedVersionByThreadId = ref<Record<string, string>>({})
  const loadedMessagesByThreadId = ref<Record<string, boolean>>({})
  const lastThreadDetailSyncAtById = ref<Record<string, number>>({})
  const resumedThreadById = ref<Record<string, boolean>>({})
  const turnSummaryByThreadId = ref<Record<string, TurnSummaryState>>({})
  const turnActivityByThreadId = ref<Record<string, TurnActivityState>>({})
  const turnErrorByThreadId = ref<Record<string, TurnErrorState>>({})
  const activeTurnIdByThreadId = ref<Record<string, string>>({})
  const lastExecutionSignalAtByThreadId = ref<Record<string, number>>({})
  const threadReadActiveStateByThreadId = ref<Record<string, ThreadReadActiveState>>({})
  const ignoredStaleActiveTurnByThreadId = ref<Record<string, string>>({})
  const pendingServerRequestsByThreadId = ref<Record<string, UiServerRequest[]>>({})
  const pendingTurnRequestByThreadId = ref<Record<string, PendingTurnRequest>>({})

  const threadTitleById = ref<Record<string, string>>({})

  const installedSkills = ref<SkillInfo[]>([])
  const accountRateLimitSnapshots = ref<UiRateLimitSnapshot[]>([])

  const isLoadingThreads = ref(false)
  const isLoadingMessages = ref(false)
  const isSendingMessage = ref(false)
  const isInterruptingTurn = ref(false)
  const isUpdatingSpeedMode = ref(false)
  const isRollingBack = ref(false)
  const error = ref('')
  const isPolling = ref(false)
  const notificationHealthTick = ref(Date.now())
  const realtimeConnectionState = ref<RealtimeConnectionState>('connecting')
  const lastSuccessfulSyncAtMs = ref(0)
  const hasLoadedThreads = ref(false)
  let stopNotificationStream: (() => void) | null = null
  let backgroundSyncTimer: number | null = null
  let activeSyncBoostTimer: number | null = null
  let liveDeltaFlushTimer: number | null = null
  let eventSyncTimer: number | null = null
  let syncAbortController: AbortController | null = null
  let threadSelectionAbortController: AbortController | null = null
  let foregroundMessageLoadId = 0
  let rateLimitRefreshTimer: number | null = null
  let rateLimitRefreshPromise: Promise<void> | null = null
  let hasRateLimitTrackingEnabled = false
  let lastNotificationAtMs = Date.now()
  let lastThreadListSyncAtMs = 0
  let activeSyncBoostUntilMs = 0
  let pendingThreadsRefresh = false
  const pendingThreadMessageRefresh = new Set<string>()
  let visibilitySyncTimer: number | null = null
  let stopVisibilitySync = (): void => {}
  let hasHydratedWorkspaceRootsState = false
  let activeReasoningItemId = ''
  let shouldAutoScrollOnNextAgentEvent = false
  const pendingTurnStartsById = new Map<string, TurnStartedInfo>()
  const fallbackRetryInFlightThreadIds = new Set<string>()
  const isWorktreeGitAutomationEnabled = ref(true)
  const bufferedAgentDeltaByKey = new Map<string, BufferedAgentDelta>()
  const bufferedCommandDeltaByKey = new Map<string, BufferedCommandDelta>()
  const bufferedReasoningDeltaByThreadId = new Map<string, string>()

  const sourceThreads = computed(() => flattenThreads(sourceGroups.value))
  const sourceThreadById = computed<Record<string, UiThread>>(() => {
    const next: Record<string, UiThread> = {}
    for (const thread of sourceThreads.value) {
      next[thread.id] = thread
    }
    return next
  })
  const allThreads = computed(() => flattenThreads(projectGroups.value))
  const selectedThread = computed(() =>
    allThreads.value.find((thread) => thread.id === selectedThreadId.value) ?? null,
  )
  const selectedThreadScrollState = computed<ThreadScrollState | null>(
    () => scrollStateByThreadId.value[selectedThreadId.value] ?? null,
  )
  const selectedThreadServerRequests = computed<UiServerRequest[]>(() => {
    const rows: UiServerRequest[] = []
    const selected = selectedThreadId.value
    if (selected && Array.isArray(pendingServerRequestsByThreadId.value[selected])) {
      rows.push(...pendingServerRequestsByThreadId.value[selected])
    }
    if (Array.isArray(pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])) {
      rows.push(...pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])
    }
    return rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
  })

  function pendingServerRequestStatusLabel(method: string): string {
    switch (method) {
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval':
        return '等待确认'
      case 'item/tool/requestUserInput':
        return '等待输入'
      case 'item/tool/call':
        return '等待处理'
      default:
        return '等待处理'
    }
  }

  function pendingServerRequestStatusDetails(request: UiServerRequest): string[] {
    const details: string[] = []
    switch (request.method) {
      case 'item/commandExecution/requestApproval':
        details.push('命令执行需要批准')
        break
      case 'item/fileChange/requestApproval':
        details.push('文件变更需要批准')
        break
      case 'item/tool/requestUserInput':
        details.push('需要补充输入')
        break
      case 'item/tool/call':
        details.push('工具调用等待处理')
        break
      default:
        details.push(sanitizeDisplayText(request.method))
        break
    }

    const reason = readString(asRecord(request.params)?.reason).trim()
    if (reason) {
      details.push(sanitizeDisplayText(reason))
    }

    details.push(`请求 #${String(request.id)}`)
    return details.filter((value, index, rows) => value.length > 0 && rows.indexOf(value) === index).slice(0, 3)
  }

  const selectedLiveOverlay = computed<UiLiveOverlay | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null

    const pendingRequest = selectedThreadServerRequests.value[0]
    if (pendingRequest) {
      return {
        activityLabel: pendingServerRequestStatusLabel(pendingRequest.method),
        activityDetails: pendingServerRequestStatusDetails(pendingRequest),
        reasoningText: '',
        errorText: '',
      }
    }

    const activity = turnActivityByThreadId.value[threadId]
    const reasoningText = (liveReasoningTextByThreadId.value[threadId] ?? '').trim()
    const errorText = (turnErrorByThreadId.value[threadId]?.message ?? '').trim()
    const isInProgress = isThreadExecutionActive(threadId)
    const hasFreshTransientSignal = hasFreshExecutionSignal(threadId, ACTIVE_SYNC_BOOST_WINDOW_MS)

    if (!isInProgress && !errorText && !hasFreshTransientSignal) return null
    if (!activity && !reasoningText && !errorText && !isInProgress) return null
    return {
      activityLabel: localizeActivityText(activity?.label || 'Thinking'),
      activityDetails: (activity?.details ?? []).map((line) => localizeActivityText(line)),
      reasoningText,
      errorText,
    }
  })
  const selectedThreadExecutionActive = computed(() => (
    selectedThreadId.value ? isThreadExecutionActive(selectedThreadId.value) : false
  ))
  const notificationStale = computed(() => {
    notificationHealthTick.value
    return Date.now() - lastNotificationAtMs >= NOTIFICATION_STALE_MS
  })
  const hasSyncDemand = computed(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return isLoadingMessages.value || isSendingMessage.value
    if (isLoadingMessages.value || isSendingMessage.value) return true
    if (isThreadExecutionActive(threadId)) return true
    if (eventUnreadByThreadId.value[threadId] === true) return true
    if ((pendingServerRequestsByThreadId.value[threadId] ?? []).length > 0) return true
    if ((pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE] ?? []).length > 0) return true
    return false
  })
  const syncLagging = computed(() => {
    notificationHealthTick.value
    if (!hasSyncDemand.value) return false
    const lastObservedActivityAt = Math.max(lastNotificationAtMs, lastSuccessfulSyncAtMs.value)
    if (lastObservedActivityAt <= 0) return true
    return Date.now() - lastObservedActivityAt >= ACTIVE_SYNC_STALE_MS
  })
  const messages = computed<UiMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const liveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
    const liveCommands = liveCommandsByThreadId.value[threadId] ?? []
    const combined = [...persisted, ...liveCommands, ...liveAgent]

    const summary = turnSummaryByThreadId.value[threadId]
    if (!summary) return combined
    return insertTurnSummaryMessage(combined, summary)
  })

  function setSelectedThreadId(nextThreadId: string): void {
    if (selectedThreadId.value === nextThreadId) return
    selectedThreadId.value = nextThreadId
    saveSelectedThreadId(nextThreadId)
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
  }

  function setSelectedModelId(modelId: string): void {
    selectedModelId.value = modelId.trim()
    saveSelectedModelId(selectedModelId.value)
  }

  function setWorktreeGitAutomationEnabled(enabled: boolean): void {
    isWorktreeGitAutomationEnabled.value = enabled
  }

  async function applyFallbackModelSelection(): Promise<void> {
    selectedModelId.value = MODEL_FALLBACK_ID
    saveSelectedModelId(selectedModelId.value)
    if (!availableModelIds.value.includes(MODEL_FALLBACK_ID)) {
      availableModelIds.value = [...availableModelIds.value, MODEL_FALLBACK_ID]
    }
    try {
      await setDefaultModel(MODEL_FALLBACK_ID)
    } catch {
      // Keep local selection even when persisting default model fails.
    }
  }

  function setPendingTurnRequest(threadId: string, request: PendingTurnRequest): void {
    pendingTurnRequestByThreadId.value = {
      ...pendingTurnRequestByThreadId.value,
      [threadId]: request,
    }
  }

  function clearPendingTurnRequest(threadId: string): void {
    if (!pendingTurnRequestByThreadId.value[threadId]) return
    pendingTurnRequestByThreadId.value = omitKey(pendingTurnRequestByThreadId.value, threadId)
  }

  async function autoCommitCompletedWorktreeTurn(threadId: string, commitMessage: string): Promise<void> {
    if (!isWorktreeGitAutomationEnabled.value) return
    const normalizedMessage = commitMessage.trim()
    if (!normalizedMessage) return
    const thread = allThreads.value.find((row) => row.id === threadId)
    if (!thread) return
    if (thread.hasWorktree !== true) return
    const cwd = thread.cwd.trim()
    if (!cwd) return
    await autoCommitWorktreeChanges(cwd, normalizedMessage)
    pendingThreadsRefresh = true
  }

  async function rollbackWorktreeGitToTurnMessage(threadId: string, turnIndex: number): Promise<void> {
    if (!isWorktreeGitAutomationEnabled.value) return
    const thread = allThreads.value.find((row) => row.id === threadId)
    if (!thread) return
    if (thread.hasWorktree !== true) return
    const cwd = thread.cwd.trim()
    if (!cwd) return

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const rollbackUserMessage = persisted.find((message) => message.role === 'user' && message.turnIndex === turnIndex)
    const rollbackMessageText = rollbackUserMessage?.text?.trim() ?? ''
    if (!rollbackMessageText) return

    try {
      await rollbackWorktreeToMessage(cwd, rollbackMessageText)
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : ''
      if (message.includes('No matching commit found')) {
        return
      }
      throw unknownError
    }
    pendingThreadsRefresh = true
  }

  async function retryPendingTurnWithFallback(threadId: string): Promise<void> {
    if (fallbackRetryInFlightThreadIds.has(threadId)) return
    const pending = pendingTurnRequestByThreadId.value[threadId]
    if (!pending || pending.fallbackRetried) return

    fallbackRetryInFlightThreadIds.add(threadId)
    setPendingTurnRequest(threadId, {
      ...pending,
      fallbackRetried: true,
    })

    try {
      await applyFallbackModelSelection()
      // Remove the failed user turn before replaying on fallback model to avoid duplicated user messages.
      try {
        const rolledBackMessages = await rollbackThread(threadId, 1)
        setPersistedMessagesForThread(threadId, rolledBackMessages)
        setLiveAgentMessagesForThread(threadId, [])
        clearLiveReasoningForThread(threadId)
        if (liveCommandsByThreadId.value[threadId]) {
          liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
        }
      } catch {
        // If rollback fails, continue with retry rather than dropping the turn.
      }
      setTurnErrorForThread(threadId, null)
      error.value = ''
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(threadId, {
        label: 'Thinking',
        details: buildPendingTurnDetails(MODEL_FALLBACK_ID, pending.effort),
      })
      setThreadInProgress(threadId, true)
      markThreadLiveExecutionSignal(threadId)

      if (resumedThreadById.value[threadId] !== true) {
        await resumeThread(threadId)
      }

      await startThreadTurn(
        threadId,
        pending.text,
        pending.imageUrls,
        MODEL_FALLBACK_ID,
        pending.effort || undefined,
        pending.skills.length > 0 ? pending.skills : undefined,
        pending.fileAttachments,
      )

      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }

      scheduleRateLimitRefresh()
      pendingThreadMessageRefresh.add(threadId)
      pendingThreadsRefresh = true
      scheduleEventSync(700)
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
    } finally {
      fallbackRetryInFlightThreadIds.delete(threadId)
    }
  }

  function setSelectedReasoningEffort(effort: ReasoningEffort | ''): void {
    if (effort && !REASONING_EFFORT_OPTIONS.includes(effort)) {
      return
    }
    selectedReasoningEffort.value = effort
  }

  async function updateSelectedSpeedMode(mode: SpeedMode): Promise<void> {
    const nextMode: SpeedMode = mode === 'fast' ? 'fast' : 'standard'
    if (isUpdatingSpeedMode.value || selectedSpeedMode.value === nextMode) {
      return
    }

    const previousMode = selectedSpeedMode.value
    selectedSpeedMode.value = nextMode
    isUpdatingSpeedMode.value = true
    error.value = ''

    try {
      await setCodexSpeedMode(nextMode)
    } catch (unknownError) {
      selectedSpeedMode.value = previousMode
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to update Fast mode'
    } finally {
      isUpdatingSpeedMode.value = false
    }
  }

  function buildPendingTurnDetails(modelId: string, effort: ReasoningEffort | ''): string[] {
    const modelLabel = modelId.trim() || 'default'
    const effortLabel = effort || 'default'
    const speedLabel = selectedSpeedMode.value === 'fast' ? 'Fast' : 'Standard'
    return [
      localizeActivityText(`Model: ${modelLabel}`),
      localizeActivityText(`Thinking: ${effortLabel}`),
      localizeActivityText(`Speed: ${speedLabel}`),
    ]
  }

  async function refreshModelPreferences(): Promise<void> {
    try {
      const [modelIds, currentConfig] = await Promise.all([
        getAvailableModelIds(),
        getCurrentModelConfig(),
      ])

      availableModelIds.value = modelIds

      const hasSelectedModel = selectedModelId.value.length > 0 && modelIds.includes(selectedModelId.value)
      if (!hasSelectedModel) {
        if (currentConfig.model && modelIds.includes(currentConfig.model)) {
          selectedModelId.value = currentConfig.model
        } else if (modelIds.length > 0) {
          selectedModelId.value = modelIds[0]
        } else {
          selectedModelId.value = ''
        }
        saveSelectedModelId(selectedModelId.value)
      }

      if (
        currentConfig.reasoningEffort &&
        REASONING_EFFORT_OPTIONS.includes(currentConfig.reasoningEffort)
      ) {
        selectedReasoningEffort.value = currentConfig.reasoningEffort
      }
      selectedSpeedMode.value = currentConfig.speedMode
    } catch {
      // Keep chat UI usable even if model metadata is temporarily unavailable.
    }
  }

  async function refreshRateLimits(): Promise<void> {
    hasRateLimitTrackingEnabled = true
    if (rateLimitRefreshPromise) {
      await rateLimitRefreshPromise
      return
    }

    rateLimitRefreshPromise = (async () => {
      try {
        accountRateLimitSnapshots.value = normalizeRateLimitSnapshotsPayload(await getAccountRateLimits())
      } catch {
        // Keep the last known rate-limit state if the endpoint is temporarily unavailable.
      } finally {
        rateLimitRefreshPromise = null
      }
    })()

    await rateLimitRefreshPromise
  }

  function scheduleRateLimitRefresh(): void {
    if (!hasRateLimitTrackingEnabled) {
      return
    }

    if (typeof window === 'undefined') {
      void refreshRateLimits()
      return
    }

    if (rateLimitRefreshTimer !== null) {
      window.clearTimeout(rateLimitRefreshTimer)
    }

    rateLimitRefreshTimer = window.setTimeout(() => {
      rateLimitRefreshTimer = null
      void refreshRateLimits()
    }, RATE_LIMIT_REFRESH_DEBOUNCE_MS)
  }

  function applyCachedTitlesToGroups(groups: UiProjectGroup[]): UiProjectGroup[] {
    const titles = threadTitleById.value
    if (Object.keys(titles).length === 0) return groups
    return groups.map((group) => ({
      projectName: group.projectName,
      threads: group.threads.map((thread) => {
        const cached = titles[thread.id]
        return cached ? { ...thread, title: cached } : thread
      }),
    }))
  }

  function applyThreadFlags(): void {
    const withTitles = applyCachedTitlesToGroups(sourceGroups.value)
    const flaggedGroups: UiProjectGroup[] = withTitles.map((group) => ({
      projectName: group.projectName,
      threads: group.threads.map((thread) => {
        const inProgress = isThreadExecutionActive(thread.id)
        const isSelected = selectedThreadId.value === thread.id
        const lastReadIso = readStateByThreadId.value[thread.id]
        const unreadByEvent = eventUnreadByThreadId.value[thread.id] === true
        const unread = !isSelected && !inProgress && (unreadByEvent || lastReadIso !== thread.updatedAtIso)

        return {
          ...thread,
          inProgress,
          unread,
        }
      }),
    }))
    projectGroups.value = mergeThreadGroups(projectGroups.value, flaggedGroups)
  }

  function insertOptimisticThread(threadId: string, cwd: string, firstMessageText: string): void {
    const nowIso = new Date().toISOString()
    const normalizedCwd = normalizePathForUi(cwd)
    const projectName = toProjectName(normalizedCwd)
    const optimisticTitle = toOptimisticThreadTitle(firstMessageText)
    const nextThread: UiThread = {
      id: threadId,
      title: optimisticTitle,
      projectName,
      cwd: normalizedCwd,
      hasWorktree: normalizedCwd.includes('/.codex/worktrees/') || normalizedCwd.includes('/.git/worktrees/'),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      preview: firstMessageText,
      unread: false,
      inProgress: false,
    }

    if (!threadTitleById.value[threadId]) {
      threadTitleById.value = {
        ...threadTitleById.value,
        [threadId]: optimisticTitle,
      }
    }

    const existingGroupIndex = sourceGroups.value.findIndex((group) => group.projectName === projectName)
    if (existingGroupIndex >= 0) {
      const existingGroup = sourceGroups.value[existingGroupIndex]
      const remainingThreads = existingGroup.threads.filter((thread) => thread.id !== threadId)
      const nextGroup: UiProjectGroup = {
        projectName,
        threads: [nextThread, ...remainingThreads],
      }
      const nextGroups = [...sourceGroups.value]
      nextGroups.splice(existingGroupIndex, 1, nextGroup)
      sourceGroups.value = nextGroups
    } else {
      sourceGroups.value = [{ projectName, threads: [nextThread] }, ...sourceGroups.value]
    }

    const nextProjectOrder = mergeProjectOrder(projectOrder.value, sourceGroups.value)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }
    applyThreadFlags()
  }

  function removeThreadFromSourceGroups(threadId: string): UiThread[] {
    const nextGroups = sourceGroups.value
      .map((group) => ({
        projectName: group.projectName,
        threads: group.threads.filter((thread) => thread.id !== threadId),
      }))
      .filter((group) => group.threads.length > 0)

    sourceGroups.value = nextGroups
    applyThreadFlags()
    const flatThreads = flattenThreads(projectGroups.value)
    pruneThreadScopedState(flatThreads)
    return flatThreads
  }

  function hideThreadLocally(threadId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    if (!hiddenThreadIds.value.includes(normalizedThreadId)) {
      hiddenThreadIds.value = [...hiddenThreadIds.value, normalizedThreadId]
      saveHiddenThreadIds(hiddenThreadIds.value)
    }

    const flatThreads = removeThreadFromSourceGroups(normalizedThreadId)
    if (selectedThreadId.value === normalizedThreadId) {
      setSelectedThreadId(flatThreads[0]?.id ?? '')
    }
  }

  function pruneThreadScopedState(flatThreads: UiThread[]): void {
    const activeThreadIds = new Set(flatThreads.map((thread) => thread.id))
    const nextReadState = pruneThreadStateMap(readStateByThreadId.value, activeThreadIds)
    if (nextReadState !== readStateByThreadId.value) {
      readStateByThreadId.value = nextReadState
      saveReadStateMap(nextReadState)
    }
    const nextScrollState = pruneThreadStateMap(scrollStateByThreadId.value, activeThreadIds)
    if (nextScrollState !== scrollStateByThreadId.value) {
      scrollStateByThreadId.value = nextScrollState
      saveThreadScrollStateMap(nextScrollState)
    }
    loadedMessagesByThreadId.value = pruneThreadStateMap(loadedMessagesByThreadId.value, activeThreadIds)
    loadedVersionByThreadId.value = pruneThreadStateMap(loadedVersionByThreadId.value, activeThreadIds)
    resumedThreadById.value = pruneThreadStateMap(resumedThreadById.value, activeThreadIds)
    persistedMessagesByThreadId.value = pruneThreadStateMap(persistedMessagesByThreadId.value, activeThreadIds)
    liveAgentMessagesByThreadId.value = pruneThreadStateMap(liveAgentMessagesByThreadId.value, activeThreadIds)
    liveReasoningTextByThreadId.value = pruneThreadStateMap(liveReasoningTextByThreadId.value, activeThreadIds)
    liveCommandsByThreadId.value = pruneThreadStateMap(liveCommandsByThreadId.value, activeThreadIds)
    turnSummaryByThreadId.value = pruneThreadStateMap(turnSummaryByThreadId.value, activeThreadIds)
    turnActivityByThreadId.value = pruneThreadStateMap(turnActivityByThreadId.value, activeThreadIds)
    turnErrorByThreadId.value = pruneThreadStateMap(turnErrorByThreadId.value, activeThreadIds)
    activeTurnIdByThreadId.value = pruneThreadStateMap(activeTurnIdByThreadId.value, activeThreadIds)
    lastExecutionSignalAtByThreadId.value = pruneThreadStateMap(lastExecutionSignalAtByThreadId.value, activeThreadIds)
    threadReadActiveStateByThreadId.value = pruneThreadStateMap(threadReadActiveStateByThreadId.value, activeThreadIds)
    ignoredStaleActiveTurnByThreadId.value = pruneThreadStateMap(ignoredStaleActiveTurnByThreadId.value, activeThreadIds)
    eventUnreadByThreadId.value = pruneThreadStateMap(eventUnreadByThreadId.value, activeThreadIds)
    inProgressById.value = pruneThreadStateMap(inProgressById.value, activeThreadIds)
    const nextQueuedMessages = pruneThreadStateMap(queuedMessagesByThreadId.value, activeThreadIds)
    if (nextQueuedMessages !== queuedMessagesByThreadId.value) {
      replaceQueuedMessagesState(nextQueuedMessages)
    }
    queueProcessingByThreadId.value = pruneThreadStateMap(queueProcessingByThreadId.value, activeThreadIds)
    const nextPending: Record<string, UiServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      if (threadId === GLOBAL_SERVER_REQUEST_SCOPE || activeThreadIds.has(threadId)) {
        nextPending[threadId] = requests
      }
    }
    pendingServerRequestsByThreadId.value = nextPending
  }

  function replaceQueuedMessagesState(nextState: Record<string, QueuedMessage[]>): void {
    queuedMessagesByThreadId.value = nextState
    saveQueuedMessagesMap(nextState)
  }

  function setQueuedMessagesForThread(threadId: string, queue: QueuedMessage[]): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return
    const nextState = queue.length > 0
      ? { ...queuedMessagesByThreadId.value, [normalizedThreadId]: queue }
      : omitKey(queuedMessagesByThreadId.value, normalizedThreadId)
    replaceQueuedMessagesState(nextState)
  }

  function removeQueuedMessageByThreadId(threadId: string, messageId: string): void {
    const normalizedThreadId = threadId.trim()
    const normalizedMessageId = messageId.trim()
    if (!normalizedThreadId || !normalizedMessageId) return
    const queue = queuedMessagesByThreadId.value[normalizedThreadId]
    if (!queue) return
    const next = queue.filter((message) => message.id !== normalizedMessageId)
    setQueuedMessagesForThread(normalizedThreadId, next)
  }

  function markThreadAsRead(threadId: string): void {
    const thread = sourceThreadById.value[threadId]
    if (!thread) return

    readStateByThreadId.value = {
      ...readStateByThreadId.value,
      [threadId]: thread.updatedAtIso,
    }
    saveReadStateMap(readStateByThreadId.value)
    if (eventUnreadByThreadId.value[threadId]) {
      eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, threadId)
    }
    applyThreadFlags()
  }

  function markAllThreadsAsRead(): void {
    const nextReadState = { ...readStateByThreadId.value }
    let hasChanged = false

    for (const thread of Object.values(sourceThreadById.value)) {
      const threadId = thread.id.trim()
      const updatedAtIso = thread.updatedAtIso.trim()
      if (!threadId || !updatedAtIso) continue
      if (nextReadState[threadId] === updatedAtIso && eventUnreadByThreadId.value[threadId] !== true) continue
      nextReadState[threadId] = updatedAtIso
      hasChanged = true
    }

    const hadEventUnread = Object.keys(eventUnreadByThreadId.value).length > 0
    if (!hasChanged && !hadEventUnread) return

    readStateByThreadId.value = nextReadState
    saveReadStateMap(nextReadState)
    if (hadEventUnread) {
      eventUnreadByThreadId.value = {}
    }
    applyThreadFlags()
  }

  function setTurnSummaryForThread(threadId: string, summary: TurnSummaryState | null): void {
    if (!threadId) return

    const previous = turnSummaryByThreadId.value[threadId]
    if (summary) {
      if (areTurnSummariesEqual(previous, summary)) return
      turnSummaryByThreadId.value = {
        ...turnSummaryByThreadId.value,
        [threadId]: summary,
      }
    } else {
      if (previous) {
        turnSummaryByThreadId.value = omitKey(turnSummaryByThreadId.value, threadId)
      }
    }
  }

  function setThreadInProgress(threadId: string, nextInProgress: boolean): void {
    if (!threadId) return
    const currentValue = inProgressById.value[threadId] === true
    if (currentValue === nextInProgress) return
    if (nextInProgress) {
      inProgressById.value = {
        ...inProgressById.value,
        [threadId]: true,
      }
    } else {
      inProgressById.value = omitKey(inProgressById.value, threadId)
    }
    applyThreadFlags()
  }

  function markThreadUnreadByEvent(threadId: string): void {
    if (!threadId) return
    if (threadId === selectedThreadId.value) return
    if (eventUnreadByThreadId.value[threadId] === true) return
    eventUnreadByThreadId.value = {
      ...eventUnreadByThreadId.value,
      [threadId]: true,
    }
    applyThreadFlags()
  }

  function setTurnActivityForThread(threadId: string, activity: TurnActivityState | null): void {
    if (!threadId) return

    const previous = turnActivityByThreadId.value[threadId]
    if (!activity) {
      if (previous) {
        turnActivityByThreadId.value = omitKey(turnActivityByThreadId.value, threadId)
      }
      return
    }

    const normalizedLabel = sanitizeDisplayText(activity.label) || 'Thinking'
    const incomingDetails = activity.details
      .map((line) => sanitizeDisplayText(line))
      .filter((line) => line.length > 0 && line !== normalizedLabel)
    const mergedDetails = Array.from(new Set([...(previous?.details ?? []), ...incomingDetails])).slice(-3)
    const nextActivity: TurnActivityState = {
      label: localizeActivityText(normalizedLabel),
      details: mergedDetails,
    }

    if (areTurnActivitiesEqual(previous, nextActivity)) return
    turnActivityByThreadId.value = {
      ...turnActivityByThreadId.value,
      [threadId]: nextActivity,
    }
  }

  function setTurnErrorForThread(threadId: string, message: string | null): void {
    if (!threadId) return

    const previous = turnErrorByThreadId.value[threadId]
    const normalizedMessage = message ? normalizeMessageText(message) : ''
    if (!normalizedMessage) {
      if (previous) {
        turnErrorByThreadId.value = omitKey(turnErrorByThreadId.value, threadId)
      }
      return
    }

    if (previous?.message === normalizedMessage) return

    turnErrorByThreadId.value = {
      ...turnErrorByThreadId.value,
      [threadId]: { message: normalizedMessage },
    }
  }

  function normalizeActiveTurnId(turnId: string): string {
    const normalizedTurnId = turnId.trim()
    return normalizedTurnId || UNKNOWN_ACTIVE_TURN_ID
  }

  function readErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const maybeMessage = (error as { message?: unknown }).message
      if (typeof maybeMessage === 'string') return maybeMessage
      const maybeError = (error as { error?: unknown }).error
      if (typeof maybeError === 'string') return maybeError
    }
    return ''
  }

  function isThreadMaterializingError(error: unknown): boolean {
    const message = readErrorMessage(error).toLowerCase()
    if (!message) return false
    return (
      message.includes('is not materialized yet') ||
      message.includes('includeturns is unavailable before first user message') ||
      message.includes('no rollout found for thread id') ||
      (message.includes('rollout') && message.includes('is empty'))
    )
  }

  function setThreadReadActiveState(threadId: string, nextState: ThreadReadActiveState | null): void {
    if (!threadId) return

    const previous = threadReadActiveStateByThreadId.value[threadId]
    if (!nextState) {
      if (!previous) return
      threadReadActiveStateByThreadId.value = omitKey(threadReadActiveStateByThreadId.value, threadId)
      return
    }

    if (
      previous &&
      previous.turnId === nextState.turnId &&
      previous.firstObservedAtMs === nextState.firstObservedAtMs &&
      previous.lastObservedAtMs === nextState.lastObservedAtMs
    ) {
      return
    }

    threadReadActiveStateByThreadId.value = {
      ...threadReadActiveStateByThreadId.value,
      [threadId]: nextState,
    }
  }

  function rememberIgnoredStaleActiveTurn(threadId: string, turnId: string): void {
    if (!threadId || !turnId) return
    if (ignoredStaleActiveTurnByThreadId.value[threadId] === turnId) return
    ignoredStaleActiveTurnByThreadId.value = {
      ...ignoredStaleActiveTurnByThreadId.value,
      [threadId]: turnId,
    }
  }

  function clearIgnoredStaleActiveTurn(threadId: string): void {
    if (!threadId || !(threadId in ignoredStaleActiveTurnByThreadId.value)) return
    ignoredStaleActiveTurnByThreadId.value = omitKey(ignoredStaleActiveTurnByThreadId.value, threadId)
  }

  function markThreadLiveExecutionSignal(threadId: string): void {
    if (!threadId) return
    const now = Date.now()
    const previous = lastExecutionSignalAtByThreadId.value[threadId] ?? 0
    if (now > previous) {
      lastExecutionSignalAtByThreadId.value = {
        ...lastExecutionSignalAtByThreadId.value,
        [threadId]: now,
      }
    }
    clearIgnoredStaleActiveTurn(threadId)
  }

  function clearThreadExecutionTracking(threadId: string): void {
    if (!threadId) return
    setThreadReadActiveState(threadId, null)
    clearIgnoredStaleActiveTurn(threadId)
    if (threadId in lastExecutionSignalAtByThreadId.value) {
      lastExecutionSignalAtByThreadId.value = omitKey(lastExecutionSignalAtByThreadId.value, threadId)
    }
  }

  function hasFreshExecutionSignal(threadId: string, maxAgeMs = ACTIVE_SYNC_STALE_MS): boolean {
    if (!threadId) return false
    const lastSignalAt = lastExecutionSignalAtByThreadId.value[threadId] ?? 0
    return lastSignalAt > 0 && Date.now() - lastSignalAt < maxAgeMs
  }

  function getThreadUpdatedAtMs(threadId: string): number {
    if (!threadId) return 0
    const updatedAtIso = sourceThreadById.value[threadId]?.updatedAtIso ?? ''
    if (!updatedAtIso) return 0
    const updatedAtMs = Date.parse(updatedAtIso)
    return Number.isFinite(updatedAtMs) ? updatedAtMs : 0
  }

  function hasStrongExecutionSignal(threadId: string): boolean {
    if (!threadId) return false
    if (hasQueuedThreadWork(threadId)) return true
    if (hasRunningLiveCommand(threadId)) return true
    if (hasPersistedRunningCommand(threadId)) return true
    return (pendingServerRequestsByThreadId.value[threadId] ?? []).length > 0
  }

  function hasAuthoritativeExecutionSignal(threadId: string): boolean {
    if (!threadId) return false
    if (sourceThreadById.value[threadId]?.inProgress === true) return true
    if (hasStrongExecutionSignal(threadId)) return true
    return hasFreshExecutionSignal(threadId, ACTIVE_SYNC_BOOST_WINDOW_MS)
  }

  function resolveThreadReadExecutionState(
    threadId: string,
    inProgress: boolean,
    activeTurnId: string,
  ): { inProgress: boolean; activeTurnId: string } {
    if (!threadId) {
      return { inProgress: false, activeTurnId: '' }
    }

    const normalizedActiveTurnId = activeTurnId.trim()
    if (!inProgress) {
      clearThreadExecutionTracking(threadId)
      return { inProgress: false, activeTurnId: '' }
    }

    if (hasStrongExecutionSignal(threadId)) {
      clearIgnoredStaleActiveTurn(threadId)
      return { inProgress: true, activeTurnId: normalizedActiveTurnId }
    }

    const activeTurnKey = normalizeActiveTurnId(normalizedActiveTurnId)
    if (ignoredStaleActiveTurnByThreadId.value[threadId] === activeTurnKey) {
      setThreadReadActiveState(threadId, null)
      return { inProgress: false, activeTurnId: '' }
    }

    const now = Date.now()
    const previousState = threadReadActiveStateByThreadId.value[threadId]
    const nextState =
      previousState && previousState.turnId === activeTurnKey
        ? {
            ...previousState,
            lastObservedAtMs: now,
          }
        : {
            turnId: activeTurnKey,
            firstObservedAtMs: now,
            lastObservedAtMs: now,
          }
    setThreadReadActiveState(threadId, nextState)

    const lastSignalAt = lastExecutionSignalAtByThreadId.value[threadId] ?? 0
    const lastMeaningfulActivityAt = Math.max(lastSignalAt, nextState.firstObservedAtMs)
    const threadUpdatedAtMs = getThreadUpdatedAtMs(threadId)
    const shouldTreatAsImmediatelyStale =
      lastSignalAt <= 0 &&
      threadUpdatedAtMs > 0 &&
      now - threadUpdatedAtMs >= STALE_THREAD_ACTIVE_TURN_IMMEDIATE_MS

    if (
      shouldTreatAsImmediatelyStale ||
      now - lastMeaningfulActivityAt >= STALE_THREAD_ACTIVE_TURN_TTL_MS
    ) {
      rememberIgnoredStaleActiveTurn(threadId, activeTurnKey)
      setThreadReadActiveState(threadId, null)
      return { inProgress: false, activeTurnId: '' }
    }

    return { inProgress: true, activeTurnId: normalizedActiveTurnId }
  }

  function hasRunningLiveCommand(threadId: string): boolean {
    return (liveCommandsByThreadId.value[threadId] ?? [])
      .some((message) => message.commandExecution?.status === 'inProgress')
  }

  function hasPersistedRunningCommand(threadId: string): boolean {
    return (persistedMessagesByThreadId.value[threadId] ?? [])
      .some((message) => message.commandExecution?.status === 'inProgress')
  }

  function hasQueuedThreadWork(threadId: string): boolean {
    if (!threadId) return false
    if (pendingTurnRequestByThreadId.value[threadId]) return true
    if (queueProcessingByThreadId.value[threadId] === true) return true
    return (queuedMessagesByThreadId.value[threadId] ?? []).length > 0
  }

  function hasPendingServerRequestSignal(threadId: string): boolean {
    if (!threadId) return false
    if ((pendingServerRequestsByThreadId.value[threadId] ?? []).length > 0) return true
    return (pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE] ?? []).length > 0
  }

  function isThreadExecutionActive(threadId: string): boolean {
    if (!threadId) return false
    const hasAuthoritativeSignal = hasAuthoritativeExecutionSignal(threadId)
    if (inProgressById.value[threadId] === true && hasAuthoritativeSignal) return true

    const activeTurnId = activeTurnIdByThreadId.value[threadId]
    if (typeof activeTurnId === 'string' && activeTurnId.trim().length > 0 && hasAuthoritativeSignal) return true

    if (hasRunningLiveCommand(threadId)) return true
    if (hasPersistedRunningCommand(threadId)) return true
    if (hasQueuedThreadWork(threadId)) return true

    if (turnActivityByThreadId.value[threadId] && hasFreshExecutionSignal(threadId, ACTIVE_SYNC_BOOST_WINDOW_MS)) {
      return true
    }

    const reasoningText = liveReasoningTextByThreadId.value[threadId] ?? ''
    if (reasoningText.trim().length > 0 && hasFreshExecutionSignal(threadId, ACTIVE_SYNC_BOOST_WINDOW_MS)) {
      return true
    }

    return false
  }

  function hasOptimisticOnlyExecutionState(threadId: string): boolean {
    if (!threadId || !isThreadExecutionActive(threadId)) return false
    if (sourceThreadById.value[threadId]?.inProgress === true) return false
    if (hasRunningLiveCommand(threadId) || hasPersistedRunningCommand(threadId)) return false
    if (hasPendingServerRequestSignal(threadId)) return false
    if (hasFreshExecutionSignal(threadId, OPTIMISTIC_EXECUTION_RECOVERY_GRACE_MS)) return false

    const pendingTurnRequest = pendingTurnRequestByThreadId.value[threadId]
    if (pendingTurnRequest) {
      return Date.now() - pendingTurnRequest.createdAtMs >= OPTIMISTIC_EXECUTION_RECOVERY_GRACE_MS
    }

    if (activeTurnIdByThreadId.value[threadId]) return true
    if (queueProcessingByThreadId.value[threadId] === true) return true
    return false
  }

  function reconcileLiveThreadState(threadId: string, inProgress: boolean): void {
    if (!threadId) return

    if (inProgress) {
      if (!turnActivityByThreadId.value[threadId]) {
        const hasRunningCommand =
          hasRunningLiveCommand(threadId) ||
          hasPersistedRunningCommand(threadId)
        setTurnActivityForThread(threadId, {
          label: hasRunningCommand ? 'Running command' : 'Thinking',
          details: [],
        })
      }
      return
    }

    setTurnActivityForThread(threadId, null)
    clearLiveReasoningForThread(threadId)
    if (liveCommandsByThreadId.value[threadId]) {
      liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
    }
  }

  function clearRecoveredIdleThreadState(threadId: string): void {
    if (!threadId) return
    clearPendingTurnRequest(threadId)
    clearThreadExecutionTracking(threadId)
    setThreadInProgress(threadId, false)
    reconcileLiveThreadState(threadId, false)
  }

  async function recoverThreadExecutionState(threadId: string): Promise<void> {
    if (!threadId || !isThreadExecutionActive(threadId)) return
    const shouldRecover =
      hasOptimisticOnlyExecutionState(threadId) ||
      notificationStale.value ||
      syncLagging.value ||
      realtimeConnectionState.value === 'reconnecting' ||
      realtimeConnectionState.value === 'disconnected'
    if (!shouldRecover) return

    try {
      if (hasOptimisticOnlyExecutionState(threadId) || hasPendingServerRequestSignal(threadId)) {
        await loadPendingServerRequestsFromBridge()
      }
      await loadMessages(threadId, { silent: true })
    } catch {
      if (
        !hasPersistedRunningCommand(threadId) &&
        !hasRunningLiveCommand(threadId) &&
        !hasFreshExecutionSignal(threadId, ACTIVE_SYNC_STALE_MS)
      ) {
        clearRecoveredIdleThreadState(threadId)
      }
    }
  }

  function currentThreadVersion(threadId: string): string {
    const thread = sourceThreadById.value[threadId]
    return thread?.updatedAtIso ?? ''
  }

  function noteSuccessfulSync(): void {
    const now = Date.now()
    lastSuccessfulSyncAtMs.value = now
    notificationHealthTick.value = now
  }

  function isDocumentVisible(): boolean {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  }

  function clearEventSyncTimer(): void {
    if (eventSyncTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(eventSyncTimer)
      eventSyncTimer = null
    }
  }

  function abortCurrentSync(): void {
    const controller = syncAbortController
    if (!controller) return
    if (!controller.signal.aborted) {
      controller.abort()
    }
    clearSyncAbortController(controller)
  }

  function scheduleEventSync(delayMs = EVENT_SYNC_DEBOUNCE_MS): void {
    if (typeof window === 'undefined') return
    if (eventSyncTimer !== null) {
      if (delayMs >= EVENT_SYNC_DEBOUNCE_MS) return
      clearEventSyncTimer()
    }
    eventSyncTimer = window.setTimeout(() => {
      eventSyncTimer = null
      void syncFromNotifications()
    }, Math.max(0, delayMs))
  }

  function queueSelectedThreadSync(options: { includeThreadList?: boolean; forceMessageRefresh?: boolean } = {}): void {
    if (options.includeThreadList !== false) {
      pendingThreadsRefresh = true
    }
    if (options.forceMessageRefresh === true && selectedThreadId.value) {
      pendingThreadMessageRefresh.add(selectedThreadId.value)
    }
  }

  function clearSyncAbortController(controller?: AbortController | null): void {
    if (!controller) {
      syncAbortController = null
      return
    }
    if (syncAbortController === controller) {
      syncAbortController = null
    }
  }

  function stopActiveSyncBoost(): void {
    if (activeSyncBoostTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(activeSyncBoostTimer)
      activeSyncBoostTimer = null
    }
  }

  function shouldRunActiveSyncBoost(now = Date.now()): boolean {
    const threadId = selectedThreadId.value
    if (!threadId) return false
    if (now < activeSyncBoostUntilMs) return true
    if (!isThreadExecutionActive(threadId)) return false
    const lastSignalAt = lastExecutionSignalAtByThreadId.value[threadId] ?? 0
    return lastSignalAt > 0 && now - lastSignalAt < ACTIVE_SYNC_BOOST_WINDOW_MS
  }

  function scheduleActiveSyncBoost(): void {
    if (typeof window === 'undefined' || activeSyncBoostTimer !== null) return
    activeSyncBoostTimer = window.setInterval(() => {
      const now = Date.now()
      notificationHealthTick.value = now

      if (!isDocumentVisible()) {
        stopActiveSyncBoost()
        return
      }

      if (!shouldRunActiveSyncBoost(now)) {
        stopActiveSyncBoost()
        return
      }

      const activeThreadId = selectedThreadId.value
      if (!activeThreadId) {
        stopActiveSyncBoost()
        return
      }

      const lastDetailSyncAt = lastThreadDetailSyncAtById.value[activeThreadId] ?? 0
      const shouldRefreshMessages =
        pendingThreadMessageRefresh.has(activeThreadId) ||
        now - lastDetailSyncAt >= ACTIVE_SYNC_BOOST_INTERVAL_MS
      const shouldRefreshThreads =
        pendingThreadsRefresh ||
        now - lastThreadListSyncAtMs >= ACTIVE_SYNC_THREAD_LIST_INTERVAL_MS

      if (shouldRefreshMessages || shouldRefreshThreads) {
        void syncThreadStatus({
          includeThreadList: shouldRefreshThreads,
          forceMessageRefresh: shouldRefreshMessages,
        })
      }

      if (now >= activeSyncBoostUntilMs && !isThreadExecutionActive(activeThreadId)) {
        stopActiveSyncBoost()
      }
    }, ACTIVE_SYNC_BOOST_INTERVAL_MS)
  }

  function markActiveSyncBoost(durationMs = ACTIVE_SYNC_BOOST_WINDOW_MS): void {
    activeSyncBoostUntilMs = Math.max(activeSyncBoostUntilMs, Date.now() + durationMs)
    if (!isDocumentVisible()) return
    scheduleActiveSyncBoost()
  }

  function clearBufferedLiveDeltas(): void {
    if (liveDeltaFlushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(liveDeltaFlushTimer)
      liveDeltaFlushTimer = null
    }
    bufferedAgentDeltaByKey.clear()
    bufferedCommandDeltaByKey.clear()
    bufferedReasoningDeltaByThreadId.clear()
  }

  function flushBufferedLiveDeltas(): void {
    if (liveDeltaFlushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(liveDeltaFlushTimer)
      liveDeltaFlushTimer = null
    }

    if (
      bufferedAgentDeltaByKey.size === 0 &&
      bufferedCommandDeltaByKey.size === 0 &&
      bufferedReasoningDeltaByThreadId.size === 0
    ) {
      return
    }

    const agentEntries = Array.from(bufferedAgentDeltaByKey.values())
    const commandEntries = Array.from(bufferedCommandDeltaByKey.values())
    const reasoningEntries = Array.from(bufferedReasoningDeltaByThreadId.entries())
    bufferedAgentDeltaByKey.clear()
    bufferedCommandDeltaByKey.clear()
    bufferedReasoningDeltaByThreadId.clear()
    const activeThreadIds = new Set<string>()

    for (const [threadId, delta] of reasoningEntries) {
      activeThreadIds.add(threadId)
      const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
      setLiveReasoningText(threadId, `${previous}${delta}`)
    }

    const agentEntriesByThread = new Map<string, BufferedAgentDelta[]>()
    for (const entry of agentEntries) {
      activeThreadIds.add(entry.threadId)
      const rows = agentEntriesByThread.get(entry.threadId) ?? []
      rows.push(entry)
      agentEntriesByThread.set(entry.threadId, rows)
    }
    for (const [threadId, rows] of agentEntriesByThread) {
      let nextMessages = liveAgentMessagesByThreadId.value[threadId] ?? []
      for (const row of rows) {
        const existing = nextMessages.find((message) => message.id === row.messageId)
        nextMessages = upsertMessage(nextMessages, {
          id: row.messageId,
          role: 'assistant',
          text: `${existing?.text ?? ''}${row.delta}`,
          messageType: 'agentMessage.live',
        })
      }
      setLiveAgentMessagesForThread(threadId, nextMessages)
    }

    const commandEntriesByThread = new Map<string, BufferedCommandDelta[]>()
    for (const entry of commandEntries) {
      activeThreadIds.add(entry.threadId)
      const rows = commandEntriesByThread.get(entry.threadId) ?? []
      rows.push(entry)
      commandEntriesByThread.set(entry.threadId, rows)
    }
    for (const [threadId, rows] of commandEntriesByThread) {
      let nextMessages = liveCommandsByThreadId.value[threadId] ?? []
      for (const row of rows) {
        const current = nextMessages.find((message) => message.id === row.itemId)
        if (!current?.commandExecution) continue
        nextMessages = upsertMessage(nextMessages, {
          ...current,
          commandExecution: {
            ...current.commandExecution,
            aggregatedOutput: `${current.commandExecution.aggregatedOutput}${row.delta}`,
          },
        })
      }
      if (nextMessages !== liveCommandsByThreadId.value[threadId]) {
        liveCommandsByThreadId.value = { ...liveCommandsByThreadId.value, [threadId]: nextMessages }
      }
    }

    for (const threadId of activeThreadIds) {
      markThreadLiveExecutionSignal(threadId)
    }
  }

  function scheduleLiveDeltaFlush(): void {
    if (typeof window === 'undefined') {
      flushBufferedLiveDeltas()
      return
    }
    if (liveDeltaFlushTimer !== null) return
    liveDeltaFlushTimer = window.setTimeout(() => {
      liveDeltaFlushTimer = null
      flushBufferedLiveDeltas()
    }, LIVE_DELTA_BATCH_MS)
  }

  function bufferLiveAgentDelta(threadId: string, messageId: string, delta: string): void {
    if (!threadId || !messageId || !delta) return
    const key = `${threadId}:${messageId}`
    const current = bufferedAgentDeltaByKey.get(key)
    if (current) {
      current.delta += delta
    } else {
      bufferedAgentDeltaByKey.set(key, { threadId, messageId, delta })
    }
    scheduleLiveDeltaFlush()
  }

  function bufferLiveReasoningDelta(threadId: string, delta: string): void {
    if (!threadId || !delta) return
    bufferedReasoningDeltaByThreadId.set(threadId, `${bufferedReasoningDeltaByThreadId.get(threadId) ?? ''}${delta}`)
    scheduleLiveDeltaFlush()
  }

  function bufferLiveCommandDelta(threadId: string, itemId: string, delta: string): void {
    if (!threadId || !itemId || !delta) return
    const key = `${threadId}:${itemId}`
    const current = bufferedCommandDeltaByKey.get(key)
    if (current) {
      current.delta += delta
    } else {
      bufferedCommandDeltaByKey.set(key, { threadId, itemId, delta })
    }
    scheduleLiveDeltaFlush()
  }

  function setThreadScrollState(threadId: string, nextState: ThreadScrollState): void {
    if (!threadId) return

    const normalizedState: ThreadScrollState = {
      scrollTop: Math.max(0, nextState.scrollTop),
      isAtBottom: nextState.isAtBottom === true,
    }
    if (typeof nextState.scrollRatio === 'number' && Number.isFinite(nextState.scrollRatio)) {
      normalizedState.scrollRatio = clamp(nextState.scrollRatio, 0, 1)
    }

    const previousState = scrollStateByThreadId.value[threadId]
    if (
      previousState &&
      previousState.scrollTop === normalizedState.scrollTop &&
      previousState.isAtBottom === normalizedState.isAtBottom &&
      previousState.scrollRatio === normalizedState.scrollRatio
    ) {
      return
    }

    scrollStateByThreadId.value = {
      ...scrollStateByThreadId.value,
      [threadId]: normalizedState,
    }
    saveThreadScrollStateMap(scrollStateByThreadId.value)
  }

  function shouldKeepThreadPinnedToBottom(threadId: string): boolean {
    if (!threadId || !shouldAutoScrollOnNextAgentEvent) return false
    const scrollState = scrollStateByThreadId.value[threadId]
    return !scrollState || scrollState.isAtBottom === true
  }

  function setPersistedMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    persistedMessagesByThreadId.value = {
      ...persistedMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function setLiveAgentMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    liveAgentMessagesByThreadId.value = {
      ...liveAgentMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function upsertLiveAgentMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, nextMessage)
    setLiveAgentMessagesForThread(threadId, next)
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    if (!threadId) return
    const normalized = text.trim()
    const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
    if (normalized.length === 0) {
      if (!previous) return
      liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
      return
    }
    if (previous === normalized) return
    liveReasoningTextByThreadId.value = {
      ...liveReasoningTextByThreadId.value,
      [threadId]: normalized,
    }
  }

  function clearLiveReasoningForThread(threadId: string): void {
    if (!threadId) return
    if (!(threadId in liveReasoningTextByThreadId.value)) return
    liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  }

  function readString(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  function getRateLimitSnapshotKey(snapshot: UiRateLimitSnapshot): string {
    return snapshot.limitId?.trim() || snapshot.limitName?.trim() || '__default__'
  }

  function normalizeRateLimitWindow(value: unknown): UiRateLimitSnapshot['primary'] {
    const record = asRecord(value)
    if (!record) return null

    return {
      usedPercent: clamp(readNumber(record.usedPercent) ?? 0, 0, 100),
      windowDurationMins: readNumber(record.windowDurationMins),
      resetsAt: readNumber(record.resetsAt),
    }
  }

  function normalizeRateLimitSnapshot(value: unknown): UiRateLimitSnapshot | null {
    const record = asRecord(value)
    if (!record) return null

    const credits = asRecord(record.credits)
    return {
      limitId: readString(record.limitId) || null,
      limitName: readString(record.limitName) || null,
      primary: normalizeRateLimitWindow(record.primary),
      secondary: normalizeRateLimitWindow(record.secondary),
      credits: credits
        ? {
            hasCredits: credits.hasCredits === true,
            unlimited: credits.unlimited === true,
            balance: readString(credits.balance) || null,
          }
        : null,
      planType: readString(record.planType) || null,
    }
  }

  function normalizeRateLimitSnapshotsPayload(value: unknown): UiRateLimitSnapshot[] {
    const record = asRecord(value)
    if (!record) return []

    const next: UiRateLimitSnapshot[] = []
    const seen = new Set<string>()
    const pushSnapshot = (snapshot: UiRateLimitSnapshot | null): void => {
      if (!snapshot) return
      const key = getRateLimitSnapshotKey(snapshot)
      if (seen.has(key)) return
      seen.add(key)
      next.push(snapshot)
    }

    pushSnapshot(normalizeRateLimitSnapshot(record.rateLimits))

    const byLimitId = asRecord(record.rateLimitsByLimitId)
    if (byLimitId) {
      for (const snapshot of Object.values(byLimitId)) {
        pushSnapshot(normalizeRateLimitSnapshot(snapshot))
      }
    }

    return next
  }

  function extractThreadIdFromNotification(notification: RpcNotification): string {
    const params = asRecord(notification.params)
    if (!params) return ''

    const directThreadId = readString(params.threadId)
    if (directThreadId) return directThreadId
    const snakeThreadId = readString(params.thread_id)
    if (snakeThreadId) return snakeThreadId

    const conversationId = readString(params.conversationId)
    if (conversationId) return conversationId
    const snakeConversationId = readString(params.conversation_id)
    if (snakeConversationId) return snakeConversationId

    const thread = asRecord(params.thread)
    const nestedThreadId = readString(thread?.id)
    if (nestedThreadId) return nestedThreadId

    const turn = asRecord(params.turn)
    const turnThreadId = readString(turn?.threadId)
    if (turnThreadId) return turnThreadId
    const turnSnakeThreadId = readString(turn?.thread_id)
    if (turnSnakeThreadId) return turnSnakeThreadId

    return ''
  }

  function readTurnErrorMessage(notification: RpcNotification): string {
    if (notification.method !== 'turn/completed') return ''
    const params = asRecord(notification.params)
    const turn = asRecord(params?.turn)
    if (!turn || turn.status !== 'failed') return ''
    const errorPayload = asRecord(turn.error)
    return readString(errorPayload?.message)
  }

  function readNotificationErrorMessage(notification: RpcNotification): string {
    if (notification.method !== 'error') return ''
    const params = asRecord(notification.params)
    return (
      readString(params?.message) ||
      readString(asRecord(params?.error)?.message)
    )
  }

  function normalizeServerRequest(params: unknown): UiServerRequest | null {
    const row = asRecord(params)
    if (!row) return null

    const id = row.id
    const method = readString(row.method)
    const requestParams = row.params
    if (typeof id !== 'number' || !Number.isInteger(id) || !method) {
      return null
    }

    const requestParamRecord = asRecord(requestParams)
    const threadId = readString(requestParamRecord?.threadId) || GLOBAL_SERVER_REQUEST_SCOPE
    const turnId = readString(requestParamRecord?.turnId)
    const itemId = readString(requestParamRecord?.itemId)
    const receivedAtIso = readString(row.receivedAtIso) || new Date().toISOString()

    return {
      id,
      method,
      threadId,
      turnId,
      itemId,
      receivedAtIso,
      params: requestParams ?? null,
    }
  }

  function setPendingServerRequestsForThread(threadId: string, requests: UiServerRequest[]): void {
    const normalizedThreadId = threadId.trim() || GLOBAL_SERVER_REQUEST_SCOPE
    const sorted = [...requests].sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
    if (sorted.length === 0) {
      if (!pendingServerRequestsByThreadId.value[normalizedThreadId]) return
      pendingServerRequestsByThreadId.value = omitKey(pendingServerRequestsByThreadId.value, normalizedThreadId)
      return
    }
    pendingServerRequestsByThreadId.value = {
      ...pendingServerRequestsByThreadId.value,
      [normalizedThreadId]: sorted,
    }
  }

  function upsertPendingServerRequest(request: UiServerRequest): void {
    const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
    const current = pendingServerRequestsByThreadId.value[threadId] ?? []
    const index = current.findIndex((row) => row.id === request.id)
    const nextRows = [...current]
    if (index >= 0) {
      nextRows.splice(index, 1, request)
    } else {
      nextRows.push(request)
    }

    pendingServerRequestsByThreadId.value = {
      ...pendingServerRequestsByThreadId.value,
      [threadId]: nextRows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
    }
  }

  function removePendingServerRequestById(requestId: number): void {
    const next: Record<string, UiServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      const filtered = requests.filter((request) => request.id !== requestId)
      if (filtered.length > 0) {
        next[threadId] = filtered
      }
    }
    pendingServerRequestsByThreadId.value = next
  }

  function handleServerRequestNotification(notification: RpcNotification): boolean {
    if (notification.method === 'server/request') {
      const request = normalizeServerRequest(notification.params)
      if (!request) return true
      upsertPendingServerRequest(request)
      return true
    }

    if (notification.method === 'server/request/resolved') {
      const row = asRecord(notification.params)
      const id = row?.id
      if (typeof id === 'number' && Number.isInteger(id)) {
        removePendingServerRequestById(id)
      }
      return true
    }

    return false
  }

  function sanitizeDisplayText(value: string): string {
    return localizeActivityText(value)
  }

  function readTurnActivity(notification: RpcNotification): { threadId: string; activity: TurnActivityState } | null {
    const threadId = extractThreadIdFromNotification(notification)
    if (!threadId) return null

    if (notification.method === 'turn/started') {
      return {
        threadId,
        activity: {
          label: 'Thinking',
          details: [],
        },
      }
    }

    if (notification.method === 'item/started') {
      const params = asRecord(notification.params)
      const item = asRecord(params?.item)
      const itemType = readString(item?.type).toLowerCase()
      if (itemType === 'reasoning') {
        return {
          threadId,
          activity: {
            label: 'Thinking',
            details: [],
          },
        }
      }
      if (itemType === 'agentmessage') {
        return {
          threadId,
          activity: {
            label: 'Writing response',
            details: [],
          },
        }
      }
      if (itemType === 'commandexecution') {
        const cmd = readString(item?.command)
        return {
          threadId,
          activity: {
            label: 'Running command',
            details: cmd ? [cmd] : [],
          },
        }
      }
    }

    if (notification.method === 'item/commandExecution/outputDelta') {
      return {
        threadId,
        activity: {
          label: 'Running command',
          details: [],
        },
      }
    }

    if (
      notification.method === 'item/reasoning/summaryTextDelta' ||
      notification.method === 'item/reasoning/summaryPartAdded'
    ) {
      return {
        threadId,
        activity: {
          label: 'Thinking',
          details: [],
        },
      }
    }

    if (notification.method === 'item/agentMessage/delta') {
      return {
        threadId,
        activity: {
          label: 'Writing response',
          details: [],
        },
      }
    }

    return null
  }

  function readTurnStartedInfo(notification: RpcNotification): TurnStartedInfo | null {
    if (notification.method !== 'turn/started') {
      return null
    }

    const params = asRecord(notification.params)
    if (!params) return null
    const threadId = extractThreadIdFromNotification(notification)
    if (!threadId) return null

    const turnPayload = asRecord(params.turn)
    const turnId =
      readString(turnPayload?.id) ||
      readString(params.turnId) ||
      `${threadId}:unknown`
    if (!turnId) return null

    const startedAtMs =
      parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
      parseIsoTimestamp(readString(params.startedAt)) ??
      parseIsoTimestamp(notification.atIso) ??
      Date.now()

    return {
      threadId,
      turnId,
      startedAtMs,
    }
  }

  function readTurnCompletedInfo(notification: RpcNotification): TurnCompletedInfo | null {
    if (notification.method !== 'turn/completed') {
      return null
    }

    const params = asRecord(notification.params)
    if (!params) return null
    const threadId = extractThreadIdFromNotification(notification)
    if (!threadId) return null

    const turnPayload = asRecord(params.turn)
    const turnId =
      readString(turnPayload?.id) ||
      readString(params.turnId) ||
      `${threadId}:unknown`
    if (!turnId) return null

    const completedAtMs =
      parseIsoTimestamp(readString(turnPayload?.completedAt)) ??
      parseIsoTimestamp(readString(params.completedAt)) ??
      parseIsoTimestamp(notification.atIso) ??
      Date.now()

    const startedAtMs =
      parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
      parseIsoTimestamp(readString(params.startedAt)) ??
      undefined

    return {
      threadId,
      turnId,
      completedAtMs,
      startedAtMs,
    }
  }

  function liveReasoningMessageId(reasoningItemId: string): string {
    return `${reasoningItemId}:live-reasoning`
  }

  function readReasoningStartedItemId(notification: RpcNotification): string {
    const params = asRecord(notification.params)
    if (!params) return ''

    if (notification.method === 'item/started') {
      const item = asRecord(params.item)
      if (!item || item.type !== 'reasoning') return ''
      return readString(item.id)
    }

    return ''
  }

  function readReasoningDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
    const params = asRecord(notification.params)
    if (!params) return null

    // Канонический источник дельт для UI — уже нормализованный item/*.
    if (notification.method === 'item/reasoning/summaryTextDelta') {
      const itemId = readString(params.itemId)
      const delta = readString(params.delta)
      if (!itemId || !delta) return null
      return { messageId: liveReasoningMessageId(itemId), delta }
    }

    return null
  }

  function readReasoningSectionBreakMessageId(notification: RpcNotification): string {
    const params = asRecord(notification.params)
    if (!params) return ''

    // Канонический source для section break — item/*
    if (notification.method === 'item/reasoning/summaryPartAdded') {
      const itemId = readString(params.itemId)
      if (!itemId) return ''
      return liveReasoningMessageId(itemId)
    }

    return ''
  }

  function readReasoningCompletedId(notification: RpcNotification): string {
    const params = asRecord(notification.params)
    if (!params) return ''

    if (notification.method === 'item/completed') {
      const item = asRecord(params.item)
      if (!item || item.type !== 'reasoning') return ''
      return liveReasoningMessageId(readString(item.id))
    }

    return ''
  }

  function readAgentMessageStartedId(notification: RpcNotification): string {
    const params = asRecord(notification.params)
    if (!params) return ''

    if (notification.method === 'item/started') {
      const item = asRecord(params.item)
      if (!item || item.type !== 'agentMessage') return ''
      return readString(item.id)
    }

    return ''
  }

  function readAgentMessageDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
    const params = asRecord(notification.params)
    if (!params) return null

    // Канонический live-канал агентского текста.
    if (notification.method === 'item/agentMessage/delta') {
      const messageId = readString(params.itemId)
      const delta = readString(params.delta)
      if (!messageId || !delta) return null
      return { messageId, delta }
    }

    return null
  }

  function readAgentMessageCompleted(notification: RpcNotification): UiMessage | null {
    const params = asRecord(notification.params)
    if (!params) return null

    if (notification.method === 'item/completed') {
      const item = asRecord(params.item)
      if (!item || item.type !== 'agentMessage') return null
      const id = readString(item.id)
      const text = readString(item.text)
      if (!id || !text) return null
      return {
        id,
        role: 'assistant',
        text,
        messageType: 'agentMessage.live',
      }
    }

    return null
  }

  function readCommandExecutionStarted(notification: RpcNotification): UiMessage | null {
    if (notification.method !== 'item/started') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || item.type !== 'commandExecution') return null
    const id = readString(item.id)
    const command = readString(item.command)
    if (!id) return null
    const cwd = typeof item.cwd === 'string' ? item.cwd : null
    return {
      id,
      role: 'system',
      text: command,
      messageType: 'commandExecution',
      commandExecution: {
        command,
        cwd,
        status: 'inProgress',
        aggregatedOutput: '',
        exitCode: null,
        durationMs: 0,
        startedAtMs: Date.now(),
      },
    }
  }

  function readCommandOutputDelta(notification: RpcNotification): { itemId: string; delta: string } | null {
    if (notification.method !== 'item/commandExecution/outputDelta') return null
    const params = asRecord(notification.params)
    if (!params) return null
    const itemId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!itemId || !delta) return null
    return { itemId, delta }
  }

  function readCommandExecutionCompleted(notification: RpcNotification): UiMessage | null {
    if (notification.method !== 'item/completed') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || item.type !== 'commandExecution') return null
    const id = readString(item.id)
    const command = readString(item.command)
    if (!id) return null
    const cwd = typeof item.cwd === 'string' ? item.cwd : null
    const statusRaw = readString(item.status)
    const status: CommandExecutionData['status'] =
      statusRaw === 'failed' ? 'failed' : statusRaw === 'declined' ? 'declined' : statusRaw === 'interrupted' ? 'interrupted' : 'completed'
    const aggregatedOutput = typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : ''
    const exitCode = typeof item.exitCode === 'number' ? item.exitCode : null
    const durationMs = typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) ? Math.max(0, item.durationMs) : null
    return {
      id,
      role: 'system',
      text: command,
      messageType: 'commandExecution',
      commandExecution: { command, cwd, status, aggregatedOutput, exitCode, durationMs, startedAtMs: null },
    }
  }

  function upsertLiveCommand(threadId: string, msg: UiMessage): void {
    const previous = liveCommandsByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, msg)
    if (next === previous) return
    liveCommandsByThreadId.value = { ...liveCommandsByThreadId.value, [threadId]: next }
  }

  function removeLiveCommandsPersistedIn(threadId: string, persistedMessages: UiMessage[]): void {
    const current = liveCommandsByThreadId.value[threadId]
    if (!current || current.length === 0) return
    const persistedIds = new Set(persistedMessages.map((m) => m.id))
    const next = current.filter((m) => !persistedIds.has(m.id))
    if (next.length === current.length) return
    if (next.length === 0) {
      liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
    } else {
      liveCommandsByThreadId.value = { ...liveCommandsByThreadId.value, [threadId]: next }
    }
  }

  function isAgentContentEvent(notification: RpcNotification): boolean {
    if (notification.method === 'item/agentMessage/delta') {
      return true
    }

    const params = asRecord(notification.params)
    if (!params) return false

    if (notification.method === 'item/completed') {
      const item = asRecord(params.item)
      return item?.type === 'agentMessage'
    }

    return false
  }

  function applyRealtimeUpdates(notification: RpcNotification): void {
    if (notification.method === 'item/completed' || notification.method === 'turn/completed') {
      flushBufferedLiveDeltas()
    }

    if (handleServerRequestNotification(notification)) {
      return
    }

    if (notification.method === 'account/rateLimits/updated') {
      scheduleRateLimitRefresh()
    }

    if (shouldBoostSyncForNotification(notification.method)) {
      markActiveSyncBoost()
    }

    if (notification.method === 'thread/name/updated') {
      const params = asRecord(notification.params)
      const threadId = readString(params?.threadId)
      const threadName = readString(params?.threadName)
      if (threadId && threadName) {
        threadTitleById.value = { ...threadTitleById.value, [threadId]: threadName }
        applyThreadFlags()
        void persistThreadTitle(threadId, threadName)
      }
    }

    const turnActivity = readTurnActivity(notification)
    if (turnActivity) {
      markThreadLiveExecutionSignal(turnActivity.threadId)
      setTurnActivityForThread(turnActivity.threadId, turnActivity.activity)
    }

    const startedTurn = readTurnStartedInfo(notification)
    if (startedTurn) {
      markThreadLiveExecutionSignal(startedTurn.threadId)
      pendingTurnStartsById.set(startedTurn.turnId, startedTurn)
      activeTurnIdByThreadId.value = {
        ...activeTurnIdByThreadId.value,
        [startedTurn.threadId]: startedTurn.turnId,
      }
      setTurnSummaryForThread(startedTurn.threadId, null)
      setTurnErrorForThread(startedTurn.threadId, null)
      setThreadInProgress(startedTurn.threadId, true)
      if (eventUnreadByThreadId.value[startedTurn.threadId]) {
        eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, startedTurn.threadId)
      }
    }

    const completedTurn = readTurnCompletedInfo(notification)
    const turnErrorMessage = readTurnErrorMessage(notification)
    const completedThreadId = completedTurn?.threadId ?? extractThreadIdFromNotification(notification)
    const shouldRetryWithFallback =
      Boolean(completedThreadId) &&
      Boolean(turnErrorMessage) &&
      selectedModelId.value !== MODEL_FALLBACK_ID &&
      isUnsupportedChatGptModelError(new Error(turnErrorMessage))
    if (completedTurn) {
      const pendingTurnRequest = pendingTurnRequestByThreadId.value[completedTurn.threadId]
      const startedTurnState = pendingTurnStartsById.get(completedTurn.turnId)
      if (startedTurnState) {
        pendingTurnStartsById.delete(completedTurn.turnId)
      }

      const rawDurationMs =
        readNumber(asRecord(notification.params)?.durationMs) ??
        readNumber(asRecord(asRecord(notification.params)?.turn)?.durationMs) ??
        (typeof completedTurn.startedAtMs === 'number'
          ? completedTurn.completedAtMs - completedTurn.startedAtMs
          : null) ??
        (startedTurnState ? completedTurn.completedAtMs - startedTurnState.startedAtMs : null)

      const durationMs = typeof rawDurationMs === 'number' ? Math.max(0, rawDurationMs) : 0
      setTurnSummaryForThread(completedTurn.threadId, {
        turnId: completedTurn.turnId,
        durationMs,
      })
      clearThreadExecutionTracking(completedTurn.threadId)
      if (activeTurnIdByThreadId.value[completedTurn.threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, completedTurn.threadId)
      }
      setThreadInProgress(completedTurn.threadId, false)
      setTurnActivityForThread(completedTurn.threadId, null)
      markThreadUnreadByEvent(completedTurn.threadId)
      if (!shouldRetryWithFallback) {
        clearPendingTurnRequest(completedTurn.threadId)
        void processQueuedMessages(completedTurn.threadId)
      }
      if (!turnErrorMessage && !shouldRetryWithFallback) {
        const commitMessage = pendingTurnRequest?.text?.trim() || AUTO_COMMIT_MESSAGE_FALLBACK
        void autoCommitCompletedWorktreeTurn(completedTurn.threadId, commitMessage).catch(() => {
          // Keep chat flow resilient when auto-commit fails.
        })
      }
    }

    if (turnErrorMessage) {
      const failedThreadId = completedTurn?.threadId || extractThreadIdFromNotification(notification)
      if (failedThreadId) {
        setTurnErrorForThread(failedThreadId, turnErrorMessage)
      }
      error.value = turnErrorMessage
      if (failedThreadId && shouldRetryWithFallback) {
        void retryPendingTurnWithFallback(failedThreadId)
      }
    } else if (completedTurn) {
      setTurnErrorForThread(completedTurn.threadId, null)
    }

    const notificationErrorMessage = readNotificationErrorMessage(notification)
    if (notificationErrorMessage) {
      const errorThreadId = extractThreadIdFromNotification(notification)
      if (errorThreadId) {
        setTurnErrorForThread(errorThreadId, notificationErrorMessage)
      }
      error.value = notificationErrorMessage
      if (selectedModelId.value !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(new Error(notificationErrorMessage))) {
        if (errorThreadId) {
          void retryPendingTurnWithFallback(errorThreadId)
        } else {
          void applyFallbackModelSelection()
        }
      }
    }

    const notificationThreadId = extractThreadIdFromNotification(notification)
    if (!notificationThreadId || notificationThreadId !== selectedThreadId.value) return

    const startedAgentMessageId = readAgentMessageStartedId(notification)
    if (startedAgentMessageId) {
      markThreadLiveExecutionSignal(notificationThreadId)
      activeReasoningItemId = ''
    }

    const liveAgentMessageDelta = readAgentMessageDelta(notification)
    if (liveAgentMessageDelta) {
      markThreadLiveExecutionSignal(notificationThreadId)
      bufferLiveAgentDelta(notificationThreadId, liveAgentMessageDelta.messageId, liveAgentMessageDelta.delta)
    }

    const completedAgentMessage = readAgentMessageCompleted(notification)
    if (completedAgentMessage) {
      markThreadLiveExecutionSignal(notificationThreadId)
      upsertLiveAgentMessage(notificationThreadId, completedAgentMessage)
    }

    const startedReasoningItemId = readReasoningStartedItemId(notification)
    if (startedReasoningItemId) {
      markThreadLiveExecutionSignal(notificationThreadId)
      activeReasoningItemId = startedReasoningItemId
    }

    const liveReasoningDelta = readReasoningDelta(notification)
    if (liveReasoningDelta) {
      markThreadLiveExecutionSignal(notificationThreadId)
      bufferLiveReasoningDelta(notificationThreadId, liveReasoningDelta.delta)
    }

    const sectionBreakMessageId = readReasoningSectionBreakMessageId(notification)
    if (sectionBreakMessageId) {
      markThreadLiveExecutionSignal(notificationThreadId)
      const current = liveReasoningTextByThreadId.value[notificationThreadId] ?? ''
      if (current.trim().length > 0 && !current.endsWith('\n\n')) {
        setLiveReasoningText(notificationThreadId, `${current}\n\n`)
      }
    }

    const completedReasoningMessageId = readReasoningCompletedId(notification)
    if (completedReasoningMessageId) {
      markThreadLiveExecutionSignal(notificationThreadId)
      if (completedReasoningMessageId === liveReasoningMessageId(activeReasoningItemId)) {
        activeReasoningItemId = ''
      }
    }

    const commandStarted = readCommandExecutionStarted(notification)
    if (commandStarted) {
      markThreadLiveExecutionSignal(notificationThreadId)
      upsertLiveCommand(notificationThreadId, commandStarted)
      setTurnActivityForThread(notificationThreadId, { label: 'Running command', details: [commandStarted.commandExecution?.command ?? ''] })
    }

    const commandDelta = readCommandOutputDelta(notification)
    if (commandDelta) {
      markThreadLiveExecutionSignal(notificationThreadId)
      bufferLiveCommandDelta(notificationThreadId, commandDelta.itemId, commandDelta.delta)
    }

    const commandCompleted = readCommandExecutionCompleted(notification)
    if (commandCompleted) {
      markThreadLiveExecutionSignal(notificationThreadId)
      upsertLiveCommand(notificationThreadId, commandCompleted)
    }

    if (isAgentContentEvent(notification)) {
      markThreadLiveExecutionSignal(notificationThreadId)
      if (shouldKeepThreadPinnedToBottom(selectedThreadId.value)) {
        setThreadScrollState(selectedThreadId.value, {
          scrollTop: 0,
          isAtBottom: true,
          scrollRatio: 1,
        })
      }
      activeReasoningItemId = ''
      clearLiveReasoningForThread(notificationThreadId)
    }

    if (notification.method === 'turn/completed') {
      activeReasoningItemId = ''
      shouldAutoScrollOnNextAgentEvent = false
      clearLiveReasoningForThread(notificationThreadId)
      if (liveCommandsByThreadId.value[notificationThreadId]) {
        liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, notificationThreadId)
      }
      const completedThreadId = extractThreadIdFromNotification(notification)
      if (completedThreadId) {
        setThreadInProgress(completedThreadId, false)
        setTurnActivityForThread(completedThreadId, null)
        markThreadUnreadByEvent(completedThreadId)
        if (!shouldRetryWithFallback) {
          clearPendingTurnRequest(completedThreadId)
          void processQueuedMessages(completedThreadId)
        }
      }
    }

  }

  function queueEventDrivenSync(notification: RpcNotification): void {
    const threadId = extractThreadIdFromNotification(notification)
    const method = notification.method
    const urgentRefresh = shouldUrgentlyRefreshFromNotification(method)
    const shouldRefreshMessages =
      shouldRefreshMessagesFromNotification(method) &&
      !(
        threadId &&
        pendingTurnRequestByThreadId.value[threadId] &&
        loadedMessagesByThreadId.value[threadId] !== true &&
        (
          method === 'turn/started' ||
          method === 'thread/started' ||
          method === 'thread/status/changed'
        )
      )
    const shouldRefreshThreads = shouldRefreshThreadListFromNotification(method)

    if (threadId && shouldRefreshMessages) {
      pendingThreadMessageRefresh.add(threadId)
    }

    if (shouldRefreshThreads) {
      pendingThreadsRefresh = true
    }

    if (!shouldRefreshMessages && !shouldRefreshThreads) return
    if (urgentRefresh && isPolling.value) {
      abortCurrentSync()
    }
    scheduleEventSync(urgentRefresh ? 0 : EVENT_SYNC_DEBOUNCE_MS)
  }

  async function hydrateWorkspaceRootsStateIfNeeded(groups: UiProjectGroup[]): Promise<void> {
    if (hasHydratedWorkspaceRootsState) return
    hasHydratedWorkspaceRootsState = true

    try {
      const rootsState = await getWorkspaceRootsState()
      const hydratedOrder: string[] = []
      for (const rootPath of rootsState.order) {
        const projectName = toProjectNameFromWorkspaceRoot(rootPath)
        if (hydratedOrder.includes(projectName)) continue
        hydratedOrder.push(projectName)
      }

      if (hydratedOrder.length > 0) {
        const mergedOrder = mergeProjectOrder(hydratedOrder, groups)
        if (!areStringArraysEqual(projectOrder.value, mergedOrder)) {
          projectOrder.value = mergedOrder
          saveProjectOrder(projectOrder.value)
        }
      }

      if (Object.keys(rootsState.labels).length > 0) {
        const nextLabels = { ...projectDisplayNameById.value }
        let changed = false
        for (const [rootPath, label] of Object.entries(rootsState.labels)) {
          const projectName = toProjectNameFromWorkspaceRoot(rootPath)
          if (nextLabels[projectName] === label) continue
          nextLabels[projectName] = label
          changed = true
        }
        if (changed) {
          projectDisplayNameById.value = nextLabels
          saveProjectDisplayNames(nextLabels)
        }
      }
    } catch {
      // Keep local storage fallback when global state is unavailable.
    }
  }

  async function loadThreadTitleCacheIfNeeded(): Promise<void> {
    if (Object.keys(threadTitleById.value).length > 0) return
    try {
      const cache = await getThreadTitleCache()
      if (Object.keys(cache.titles).length > 0) {
        threadTitleById.value = cache.titles
      }
    } catch {
      // Title cache is optional; keep UI functional.
    }
  }

  async function requestThreadTitleGeneration(threadId: string, prompt: string, cwd: string | null): Promise<void> {
    if (threadTitleById.value[threadId]) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    const truncated = trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed
    try {
      const title = await generateThreadTitle(truncated, cwd)
      if (!title || threadTitleById.value[threadId]) return
      threadTitleById.value = { ...threadTitleById.value, [threadId]: title }
      applyThreadFlags()
      void persistThreadTitle(threadId, title)
    } catch {
      // Title generation is best-effort.
    }
  }

  async function loadThreads(options: { signal?: AbortSignal } = {}) {
    if (!hasLoadedThreads.value) {
      isLoadingThreads.value = true
    }

    try {
      const [groups] = await Promise.all([getThreadGroups({ signal: options.signal }), loadThreadTitleCacheIfNeeded()])
      const hiddenThreadIdSet = new Set(hiddenThreadIds.value)
      const visibleGroups = hiddenThreadIdSet.size === 0
        ? groups
        : groups
          .map((group) => ({
            projectName: group.projectName,
            threads: group.threads.filter((thread) => !hiddenThreadIdSet.has(thread.id)),
          }))
          .filter((group) => group.threads.length > 0)
      await hydrateWorkspaceRootsStateIfNeeded(visibleGroups)

      const nextProjectOrder = mergeProjectOrder(projectOrder.value, visibleGroups)
      if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
        projectOrder.value = nextProjectOrder
        saveProjectOrder(projectOrder.value)
      }

      const orderedGroups = orderGroupsByProjectOrder(visibleGroups, projectOrder.value)
      const executionStateByThreadId = Object.fromEntries(
        sourceThreads.value.map((thread) => [thread.id, isThreadExecutionActive(thread.id)]),
      ) as Record<string, boolean>
      const mergedWithInProgress = mergeIncomingWithLocalInProgressThreads(
        sourceGroups.value,
        orderedGroups,
        executionStateByThreadId,
      )
      sourceGroups.value = mergeThreadGroups(sourceGroups.value, mergedWithInProgress)
      inProgressById.value = pruneThreadStateMap(
        inProgressById.value,
        new Set(flattenThreads(sourceGroups.value).map((thread) => thread.id)),
      )
      lastThreadListSyncAtMs = Date.now()
      noteSuccessfulSync()
      applyThreadFlags()
      hasLoadedThreads.value = true

      const flatThreads = flattenThreads(projectGroups.value)
      pruneThreadScopedState(flatThreads)

      const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)

      if (!currentExists) {
        setSelectedThreadId(flatThreads[0]?.id ?? '')
      }
    } finally {
      isLoadingThreads.value = false
    }
  }

  async function loadMessages(threadId: string, options: { silent?: boolean; signal?: AbortSignal } = {}) {
    if (!threadId) {
      return
    }

    flushBufferedLiveDeltas()

    const alreadyLoaded = loadedMessagesByThreadId.value[threadId] === true
    const shouldShowLoading = options.silent !== true && !alreadyLoaded
    const loadId = shouldShowLoading ? ++foregroundMessageLoadId : 0
    if (shouldShowLoading) {
      isLoadingMessages.value = true
    }

    try {
      if (resumedThreadById.value[threadId] !== true) {
        await resumeThread(threadId, { signal: options.signal })
        resumedThreadById.value = {
          ...resumedThreadById.value,
          [threadId]: true,
        }
      }

      const snapshot = await getThreadRuntimeSnapshot(threadId, { signal: options.signal })
      const nextMessages = snapshot.messages
      const inProgress = snapshot.inProgress
      const activeTurnId = snapshot.activeTurnId
      const normalizedPendingRequests = snapshot.pendingServerRequests
        .map((row) => normalizeServerRequest(row))
        .filter((request): request is UiServerRequest => request !== null)
      setPendingServerRequestsForThread(threadId, normalizedPendingRequests)
      const previousPersisted = persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
        // Silent recovery should only preserve local gaps while the server still reports an active turn.
        preserveMissing: options.silent === true && inProgress,
      })
      setPersistedMessagesForThread(threadId, mergedMessages)
      if (inProgress && hasPersistedRunningCommand(threadId)) {
        markThreadLiveExecutionSignal(threadId)
      }

      const previousLiveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
      const nextLiveAgent = inProgress
        ? removeRedundantLiveAgentMessages(previousLiveAgent, nextMessages)
        : []
      setLiveAgentMessagesForThread(threadId, nextLiveAgent)
      removeLiveCommandsPersistedIn(threadId, nextMessages)

      loadedMessagesByThreadId.value = {
        ...loadedMessagesByThreadId.value,
        [threadId]: true,
      }
      noteSuccessfulSync()
      lastThreadDetailSyncAtById.value = {
        ...lastThreadDetailSyncAtById.value,
        [threadId]: Date.now(),
      }

      const version = snapshot.updatedAtIso || currentThreadVersion(threadId)
      if (version) {
        loadedVersionByThreadId.value = {
          ...loadedVersionByThreadId.value,
          [threadId]: version,
        }
      }
      const resolvedExecutionState = resolveThreadReadExecutionState(threadId, inProgress, activeTurnId)
      setThreadInProgress(threadId, resolvedExecutionState.inProgress)
      reconcileLiveThreadState(threadId, resolvedExecutionState.inProgress)
      if (
        !resolvedExecutionState.inProgress &&
        !hasPersistedRunningCommand(threadId) &&
        !hasRunningLiveCommand(threadId)
      ) {
        clearPendingTurnRequest(threadId)
      }
      if (resolvedExecutionState.activeTurnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: resolvedExecutionState.activeTurnId,
        }
      } else if (activeTurnIdByThreadId.value[threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
      }
      applyThreadFlags()
      markThreadAsRead(threadId)
      if (!resolvedExecutionState.inProgress && normalizedPendingRequests.length === 0) {
        void processQueuedMessages(threadId)
      }
    } catch (error) {
      if (isThreadMaterializingError(error)) {
        lastThreadDetailSyncAtById.value = {
          ...lastThreadDetailSyncAtById.value,
          [threadId]: Date.now(),
        }
        if (pendingTurnRequestByThreadId.value[threadId]) {
          markThreadLiveExecutionSignal(threadId)
          pendingThreadMessageRefresh.add(threadId)
          scheduleEventSync(900)
        }
        return
      }
      throw error
    } finally {
      if (shouldShowLoading && foregroundMessageLoadId === loadId) {
        isLoadingMessages.value = false
      }
    }
  }

  async function refreshSkills(): Promise<void> {
    try {
      const selectedCwd = selectedThread.value?.cwd?.trim() ?? ''
      installedSkills.value = await getSkillsList(selectedCwd ? [selectedCwd] : undefined)
    } catch {
      // keep previous skills on failure
    }
  }

  async function refreshAll(options: { loadMessages?: boolean; loadSkills?: boolean } = {}) {
    error.value = ''

    try {
      const threadsPromise = loadThreads()
      await Promise.all([
        threadsPromise,
        refreshModelPreferences(),
      ])
      if (options.loadSkills !== false) {
        await refreshSkills()
      }
      if (options.loadMessages !== false) {
        await loadMessages(selectedThreadId.value)
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function selectThread(threadId: string) {
    const normalizedThreadId = threadId.trim()
    setSelectedThreadId(normalizedThreadId)

    threadSelectionAbortController?.abort()
    threadSelectionAbortController = null

    if (!normalizedThreadId) {
      isLoadingMessages.value = false
      return
    }

    const abortController = new AbortController()
    threadSelectionAbortController = abortController

    try {
      await loadMessages(normalizedThreadId, { signal: abortController.signal })
      if (threadSelectionAbortController !== abortController) return
      void refreshSkills()
      if (normalizedThreadId && isThreadExecutionActive(normalizedThreadId)) {
        markActiveSyncBoost()
      }
    } catch (unknownError) {
      if (isAbortLikeError(unknownError)) return
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    } finally {
      if (threadSelectionAbortController === abortController) {
        threadSelectionAbortController = null
      }
    }
  }

  async function archiveThreadById(threadId: string) {
    try {
      await archiveThread(threadId)
      await loadThreads()

      if (selectedThreadId.value === threadId) {
        await loadMessages(selectedThreadId.value)
      }
    } catch (unknownError) {
      if (isThreadMaterializingError(unknownError)) {
        hideThreadLocally(threadId)
        return
      }
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  function dismissThreadLocally(threadId: string): void {
    hideThreadLocally(threadId)
  }

  async function renameThreadById(threadId: string, threadName: string) {
    const normalizedName = threadName.trim()
    if (!threadId || !normalizedName) return

    try {
      await renameThread(threadId, normalizedName)
      threadTitleById.value = { ...threadTitleById.value, [threadId]: normalizedName }
      applyThreadFlags()
      void persistThreadTitle(threadId, normalizedName)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function forkThreadById(threadId: string): Promise<string> {
    const sourceThreadId = threadId.trim()
    if (!sourceThreadId) return ''

    const sourceThread = sourceThreadById.value[sourceThreadId]
    const sourceCwd = sourceThread?.cwd?.trim() ?? ''
    const sourceTitle = sourceThread?.title?.trim() ?? 'Forked chat'
    const selectedModel = selectedModelId.value.trim()
    error.value = ''

    try {
      const nextThreadId = await forkThread(sourceThreadId, sourceCwd || undefined, selectedModel || undefined)
      if (!nextThreadId) return ''

      insertOptimisticThread(nextThreadId, sourceCwd, sourceTitle)
      resumedThreadById.value = {
        ...resumedThreadById.value,
        [nextThreadId]: true,
      }
      setSelectedThreadId(nextThreadId)
      await loadThreads()
      await loadMessages(nextThreadId)
      return nextThreadId
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      return ''
    }
  }

  async function sendMessageToSelectedThread(
    text: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    mode: 'steer' | 'queue' = 'steer',
    fileAttachments: FileAttachment[] = [],
    queueInsertIndex?: number,
  ): Promise<void> {
    if (isUpdatingSpeedMode.value) return

    const threadId = selectedThreadId.value
    const nextText = text.trim()
    if (!threadId || (!nextText && imageUrls.length === 0 && fileAttachments.length === 0)) return

    await recoverThreadExecutionState(threadId)

    const isInProgress = inProgressById.value[threadId] === true

    if (isInProgress && mode === 'queue') {
      const queue = queuedMessagesByThreadId.value[threadId] ?? []
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const nextQueue = [...queue]
      const insertIndex = typeof queueInsertIndex === 'number'
        ? Math.max(0, Math.min(queueInsertIndex, nextQueue.length))
        : nextQueue.length
      nextQueue.splice(insertIndex, 0, { id, text: nextText, imageUrls, skills, fileAttachments })
      setQueuedMessagesForThread(threadId, nextQueue)
      return
    }

    if (isInProgress) {
      shouldAutoScrollOnNextAgentEvent = true
      markActiveSyncBoost()
      try {
        await startTurnForThread(threadId, nextText, imageUrls, skills, fileAttachments)
      } catch (unknownError) {
        const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        setTurnErrorForThread(threadId, errorMessage)
        error.value = errorMessage
        throw unknownError
      }
      return
    }

    error.value = ''
    shouldAutoScrollOnNextAgentEvent = true
    markActiveSyncBoost()
    setTurnSummaryForThread(threadId, null)
    setTurnActivityForThread(
      threadId,
      { label: 'Thinking', details: buildPendingTurnDetails(selectedModelId.value, selectedReasoningEffort.value) },
    )
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)

    try {
      await startTurnForThread(threadId, nextText, imageUrls, skills, fileAttachments)
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      throw unknownError
    }
  }

  async function sendMessageToNewThread(
    text: string,
    cwd: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<string> {
    if (isUpdatingSpeedMode.value) return ''

    const nextText = text.trim()
    const targetCwd = cwd.trim()
    const selectedModel = selectedModelId.value.trim()
    if (!nextText && imageUrls.length === 0 && fileAttachments.length === 0) return ''

    isSendingMessage.value = true
    error.value = ''
    let threadId = ''

    try {
      try {
        threadId = await startThread(targetCwd || undefined, selectedModel || undefined)
      } catch (unknownError) {
        if (selectedModel && selectedModel !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(unknownError)) {
          await applyFallbackModelSelection()
          threadId = await startThread(targetCwd || undefined, MODEL_FALLBACK_ID)
        } else {
          throw unknownError
        }
      }
      if (!threadId) return ''

      insertOptimisticThread(threadId, targetCwd, nextText || '[Image]')
      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }
      setSelectedThreadId(threadId)
      shouldAutoScrollOnNextAgentEvent = true
      markActiveSyncBoost()
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(
        threadId,
        { label: 'Thinking', details: buildPendingTurnDetails(selectedModelId.value, selectedReasoningEffort.value) },
      )
      setTurnErrorForThread(threadId, null)
      setThreadInProgress(threadId, true)
      const capturedThreadId = threadId
      const capturedCwd = targetCwd || null
      const capturedPrompt = nextText
      void startTurnForThread(threadId, nextText, imageUrls, skills, fileAttachments)
        .catch((unknownError) => {
          shouldAutoScrollOnNextAgentEvent = false
          setThreadInProgress(threadId, false)
          setTurnActivityForThread(threadId, null)
          const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
          setTurnErrorForThread(threadId, errorMessage)
          error.value = errorMessage
        })
        .finally(() => {
          isSendingMessage.value = false
        })
      void requestThreadTitleGeneration(capturedThreadId, capturedPrompt, capturedCwd)
      return threadId
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      if (threadId) {
        setThreadInProgress(threadId, false)
        setTurnActivityForThread(threadId, null)
      }
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      if (threadId) {
        setTurnErrorForThread(threadId, errorMessage)
      }
      error.value = errorMessage
      isSendingMessage.value = false
      throw unknownError
    }
  }

  async function startTurnForThread(
    threadId: string,
    nextText: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<void> {
    const modelId = selectedModelId.value.trim()
    const reasoningEffort = selectedReasoningEffort.value
    const normalizedText = nextText.trim()
    const normalizedSkills = skills.map((skill) => ({ name: skill.name, path: skill.path }))
    const normalizedFileAttachments = fileAttachments.map((file) => ({ ...file }))
    markActiveSyncBoost()

    setPendingTurnRequest(threadId, {
      text: normalizedText,
      imageUrls: [...imageUrls],
      skills: normalizedSkills,
      fileAttachments: normalizedFileAttachments,
      effort: reasoningEffort,
      fallbackRetried: false,
      createdAtMs: Date.now(),
    })

    try {
      if (resumedThreadById.value[threadId] !== true) {
        await resumeThread(threadId)
      }

      let startedTurnId = ''
      try {
        startedTurnId = await startThreadTurn(
          threadId,
          nextText,
          imageUrls,
          modelId || undefined,
          reasoningEffort || undefined,
          skills.length > 0 ? skills : undefined,
          fileAttachments,
        )
      } catch (unknownError) {
        if (modelId && modelId !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(unknownError)) {
          await applyFallbackModelSelection()
          setPendingTurnRequest(threadId, {
            text: normalizedText,
            imageUrls: [...imageUrls],
            skills: normalizedSkills,
            fileAttachments: normalizedFileAttachments,
            effort: reasoningEffort,
            fallbackRetried: true,
            createdAtMs: Date.now(),
          })
          startedTurnId = await startThreadTurn(
            threadId,
            nextText,
            imageUrls,
            MODEL_FALLBACK_ID,
            reasoningEffort || undefined,
            skills.length > 0 ? skills : undefined,
            fileAttachments,
          )
        } else {
          throw unknownError
        }
      }

      if (startedTurnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: startedTurnId,
        }
      }
      markThreadLiveExecutionSignal(threadId)

      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }

      pendingThreadMessageRefresh.add(threadId)
      pendingThreadsRefresh = true
      scheduleEventSync(700)
    } catch (unknownError) {
      clearPendingTurnRequest(threadId)
      throw unknownError
    }
  }

  async function processQueuedMessages(threadId: string): Promise<void> {
    if (queueProcessingByThreadId.value[threadId] === true) return
    if (inProgressById.value[threadId] === true) return
    if (pendingTurnRequestByThreadId.value[threadId]) return
    if (hasPendingServerRequestSignal(threadId)) return
    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue || queue.length === 0) return
    queueProcessingByThreadId.value = {
      ...queueProcessingByThreadId.value,
      [threadId]: true,
    }
    const [next] = queue
    isSendingMessage.value = true
    error.value = ''
    shouldAutoScrollOnNextAgentEvent = true
    setTurnSummaryForThread(threadId, null)
    setTurnActivityForThread(threadId, { label: 'Thinking', details: buildPendingTurnDetails(selectedModelId.value, selectedReasoningEffort.value) })
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)
    markThreadLiveExecutionSignal(threadId)
    markActiveSyncBoost()
    try {
      await startTurnForThread(threadId, next.text, next.imageUrls, next.skills, next.fileAttachments)
      removeQueuedMessageByThreadId(threadId, next.id)
    } catch {
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
    } finally {
      queueProcessingByThreadId.value = omitKey(queueProcessingByThreadId.value, threadId)
      isSendingMessage.value = false
    }
  }

  async function interruptSelectedThreadTurn(): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (inProgressById.value[threadId] !== true) return
    let turnId = activeTurnIdByThreadId.value[threadId]
    if (!turnId) {
      const { activeTurnId } = await getThreadDetail(threadId)
      turnId = activeTurnId
      if (turnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: turnId,
        }
      }
    }
    if (!turnId) {
      throw new Error('Could not determine active turn id for interrupt')
    }

    isInterruptingTurn.value = true
    error.value = ''
    try {
      await interruptThreadTurn(threadId, turnId)
      clearThreadExecutionTracking(threadId)
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      if (activeTurnIdByThreadId.value[threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
      }
      pendingThreadMessageRefresh.add(threadId)
      pendingThreadsRefresh = true
      await syncFromNotifications()
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to interrupt active turn'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    } finally {
      isInterruptingTurn.value = false
    }
  }

  async function rollbackSelectedThread(turnIndex: number): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (isRollingBack.value) return

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const maxTurnIndex = persisted.reduce((max, m) => (typeof m.turnIndex === 'number' && m.turnIndex > max ? m.turnIndex : max), -1)
    if (maxTurnIndex < 0 || turnIndex > maxTurnIndex) return
    const numTurns = maxTurnIndex - turnIndex + 1
    if (numTurns < 1) return

    isRollingBack.value = true
    error.value = ''
    try {
      await rollbackWorktreeGitToTurnMessage(threadId, turnIndex)
      const nextMessages = await rollbackThread(threadId, numTurns)
      setPersistedMessagesForThread(threadId, nextMessages)
      setLiveAgentMessagesForThread(threadId, [])
      clearLiveReasoningForThread(threadId)
      if (liveCommandsByThreadId.value[threadId]) {
        liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
      }
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      pendingThreadsRefresh = true
      await syncFromNotifications()
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to rollback thread'
    } finally {
      isRollingBack.value = false
    }
  }

  function renameProject(projectName: string, displayName: string): void {
    if (projectName.length === 0) return

    const currentValue = projectDisplayNameById.value[projectName] ?? ''
    if (currentValue === displayName) return

    projectDisplayNameById.value = {
      ...projectDisplayNameById.value,
      [projectName]: displayName,
    }
    saveProjectDisplayNames(projectDisplayNameById.value)
  }

  function removeProject(projectName: string): void {
    if (projectName.length === 0) return

    const nextProjectOrder = projectOrder.value.filter((name) => name !== projectName)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }

    sourceGroups.value = sourceGroups.value.filter((group) => group.projectName !== projectName)

    if (projectDisplayNameById.value[projectName] !== undefined) {
      const nextDisplayNames = { ...projectDisplayNameById.value }
      delete nextDisplayNames[projectName]
      projectDisplayNameById.value = nextDisplayNames
      saveProjectDisplayNames(nextDisplayNames)
    }

    applyThreadFlags()

    const flatThreads = flattenThreads(projectGroups.value)
    pruneThreadScopedState(flatThreads)

    const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)
    if (!currentExists) {
      setSelectedThreadId(flatThreads[0]?.id ?? '')
    }

    void persistProjectOrderToWorkspaceRoots()
  }

  function reorderProject(projectName: string, toIndex: number): void {
    if (projectName.length === 0) return
    if (sourceGroups.value.length === 0) return

    const visibleOrder = sourceGroups.value.map((group) => group.projectName)
    const fromIndex = visibleOrder.indexOf(projectName)
    if (fromIndex === -1) return

    const clampedToIndex = Math.max(0, Math.min(toIndex, visibleOrder.length - 1))
    const reorderedVisibleOrder = reorderStringArray(visibleOrder, fromIndex, clampedToIndex)
    if (reorderedVisibleOrder === visibleOrder) return

    const normalizedProjectOrder = mergeProjectOrder(reorderedVisibleOrder, sourceGroups.value)
    projectOrder.value = normalizedProjectOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  function pinProjectToTop(projectName: string): void {
    const normalizedName = projectName.trim()
    if (!normalizedName) return
    const nextOrder = [normalizedName, ...projectOrder.value.filter((name) => name !== normalizedName)]
    if (areStringArraysEqual(projectOrder.value, nextOrder)) return
    projectOrder.value = nextOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  async function persistProjectOrderToWorkspaceRoots(): Promise<void> {
    try {
      const rootsState = await getWorkspaceRootsState()
      const rootByProjectName = new Map<string, string>()
      for (const rootPath of rootsState.order) {
        const projectName = toProjectNameFromWorkspaceRoot(rootPath)
        if (!rootByProjectName.has(projectName)) {
          rootByProjectName.set(projectName, rootPath)
        }
      }
      for (const group of sourceGroups.value) {
        const cwd = group.threads[0]?.cwd?.trim() ?? ''
        if (!cwd) continue
        rootByProjectName.set(group.projectName, cwd)
      }

      const nextOrder: string[] = []
      for (const projectName of projectOrder.value) {
        const rootPath = rootByProjectName.get(projectName)
        if (rootPath && !nextOrder.includes(rootPath)) {
          nextOrder.push(rootPath)
        }
      }
      for (const rootPath of rootsState.order) {
        if (!nextOrder.includes(rootPath)) {
          nextOrder.push(rootPath)
        }
      }

      const nextActive = rootsState.active.filter((rootPath) => nextOrder.includes(rootPath))
      if (nextActive.length === 0 && nextOrder.length > 0) {
        nextActive.push(nextOrder[0])
      }

      await setWorkspaceRootsState({
        order: nextOrder,
        labels: rootsState.labels,
        active: nextActive,
      })
    } catch {
      // Keep local project order when global state persistence is unavailable.
    }
  }

  async function syncThreadStatus(
    options: { includeThreadList?: boolean; forceMessageRefresh?: boolean; urgent?: boolean } = {},
  ): Promise<void> {
    const forceMessageRefresh = options.forceMessageRefresh === true
    const includeThreadList = options.includeThreadList !== false
    const urgent = options.urgent === true

    if (isPolling.value) {
      queueSelectedThreadSync({
        includeThreadList,
        forceMessageRefresh,
      })
      if (urgent) {
        abortCurrentSync()
      }
      scheduleEventSync(urgent ? 0 : EVENT_SYNC_DEBOUNCE_MS)
      return
    }

    isPolling.value = true
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    syncAbortController = controller
    let wasAborted = false

    try {
      if (includeThreadList) {
        await loadThreads({ signal: controller?.signal })
      }

      if (includeThreadList || forceMessageRefresh || Object.keys(pendingServerRequestsByThreadId.value).length > 0) {
        await loadPendingServerRequestsFromBridge()
      }

      if (!selectedThreadId.value) return

      const threadId = selectedThreadId.value
      const currentVersion = currentThreadVersion(threadId)
      const loadedVersion = loadedVersionByThreadId.value[threadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion

      if (forceMessageRefresh || hasVersionChange) {
        await loadMessages(threadId, { silent: true, signal: controller?.signal })
      }
    } catch (error) {
      wasAborted = isAbortLikeError(error)
      // ignore poll failures and keep last known state
    } finally {
      clearSyncAbortController(controller)
      isPolling.value = false
      if (wasAborted) {
        scheduleEventSync(0)
        return
      }
      if (pendingThreadsRefresh || pendingThreadMessageRefresh.size > 0) {
        scheduleEventSync(0)
      }
    }
  }

  function scheduleBackgroundSync(): void {
    if (typeof window === 'undefined' || backgroundSyncTimer !== null) return
    backgroundSyncTimer = window.setInterval(() => {
      const now = Date.now()
      notificationHealthTick.value = now
      const activeThreadId = selectedThreadId.value
      const isInProgress = activeThreadId ? isThreadExecutionActive(activeThreadId) : false
      const lastDetailSyncAt = activeThreadId ? (lastThreadDetailSyncAtById.value[activeThreadId] ?? 0) : 0
      const notificationStale = now - lastNotificationAtMs >= NOTIFICATION_STALE_MS
      const shouldRefreshMessages =
        Boolean(activeThreadId) &&
        (
          isInProgress ||
          hasOptimisticOnlyExecutionState(activeThreadId) ||
          now - lastDetailSyncAt >= ACTIVE_THREAD_DETAIL_SYNC_IDLE_MS
        ) &&
        (
          hasOptimisticOnlyExecutionState(activeThreadId) ||
          notificationStale ||
          now - lastDetailSyncAt >= ACTIVE_THREAD_DETAIL_SYNC_INTERVAL_MS
        )
      const shouldRefreshThreads =
        now - lastThreadListSyncAtMs >= THREAD_LIST_REFRESH_INTERVAL_MS &&
        (notificationStale || isInProgress || !activeThreadId)

      if (!shouldRefreshThreads && !shouldRefreshMessages) {
        return
      }

      void syncThreadStatus({
        includeThreadList: shouldRefreshThreads,
        forceMessageRefresh: shouldRefreshMessages,
      })
    }, BACKGROUND_SYNC_INTERVAL_MS)
  }

  function scheduleVisibilitySync(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    if (stopVisibilitySync) {
      stopVisibilitySync()
    }

    const scheduleResumeSync = (): void => {
      if (document.hidden) return
      if (visibilitySyncTimer !== null) {
        window.clearTimeout(visibilitySyncTimer)
      }
      visibilitySyncTimer = window.setTimeout(() => {
        visibilitySyncTimer = null
        markActiveSyncBoost()
        void syncThreadStatus({
          includeThreadList: true,
          forceMessageRefresh: true,
          urgent: true,
        })
      }, 140)
    }

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        clearVisibilitySyncTimer()
        stopActiveSyncBoost()
        return
      }
      scheduleResumeSync()
    }

    const onWindowFocus = (): void => {
      scheduleResumeSync()
    }

    const onPageShow = (): void => {
      scheduleResumeSync()
    }

    stopVisibilitySync = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('pageshow', onPageShow)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('pageshow', onPageShow)
  }

  function clearVisibilitySyncTimer(): void {
    if (visibilitySyncTimer !== null) {
      window.clearTimeout(visibilitySyncTimer)
      visibilitySyncTimer = null
    }
  }

  async function syncFromNotifications(): Promise<void> {
    if (isPolling.value) {
      scheduleEventSync()
      return
    }

    isPolling.value = true
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    syncAbortController = controller

    const shouldRefreshThreads = pendingThreadsRefresh
    const threadIdsToRefresh = new Set(pendingThreadMessageRefresh)
    pendingThreadsRefresh = false
    pendingThreadMessageRefresh.clear()
    let wasAborted = false

    try {
      if (shouldRefreshThreads) {
        await loadThreads({ signal: controller?.signal })
      }

      const activeThreadId = selectedThreadId.value
      if (!activeThreadId) return

      const isActiveDirty = threadIdsToRefresh.has(activeThreadId)
      const currentVersion = currentThreadVersion(activeThreadId)
      const loadedVersion = loadedVersionByThreadId.value[activeThreadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion

      if (isActiveDirty || hasVersionChange || shouldRefreshThreads) {
        await loadMessages(activeThreadId, { silent: true, signal: controller?.signal })
      }
    } catch (error) {
      wasAborted = isAbortLikeError(error)
      // Keep UI stable on transient event sync failures.
    } finally {
      clearSyncAbortController(controller)
      isPolling.value = false

      if (wasAborted) {
        scheduleEventSync(0)
        return
      }

      if (pendingThreadsRefresh || pendingThreadMessageRefresh.size > 0) {
        scheduleEventSync()
      }
    }
  }

  function startPolling(): void {
    if (typeof window === 'undefined') return

    if (stopNotificationStream) return
    realtimeConnectionState.value = 'connecting'
    void loadPendingServerRequestsFromBridge()
    scheduleBackgroundSync()
    scheduleVisibilitySync()
    stopNotificationStream = subscribeCodexNotifications(
      (notification) => {
        lastNotificationAtMs = Date.now()
        notificationHealthTick.value = lastNotificationAtMs
        applyRealtimeUpdates(notification)
        queueEventDrivenSync(notification)
      },
      {
        onConnectionStateChange: (state) => {
          const previousState = realtimeConnectionState.value
          realtimeConnectionState.value = state
          notificationHealthTick.value = Date.now()
          queueSelectedThreadSync({
            includeThreadList: true,
            forceMessageRefresh: hasSyncDemand.value,
          })
          if (!isDocumentVisible()) {
            return
          }
          if (state === 'reconnecting' || state === 'disconnected') {
            return
          }
          if (state === 'connected' && previousState !== 'connected' && hasSyncDemand.value) {
            markActiveSyncBoost()
            void syncThreadStatus({
              includeThreadList: true,
              forceMessageRefresh: true,
              urgent: true,
            })
          }
        },
      },
    )
  }

  async function loadPendingServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await getPendingServerRequests()
      const nextPending: Record<string, UiServerRequest[]> = {}
      for (const row of rows) {
        const request = normalizeServerRequest(row)
        if (request) {
          const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
          const current = nextPending[threadId] ?? []
          nextPending[threadId] = [...current, request]
        }
      }
      pendingServerRequestsByThreadId.value = nextPending
      applyThreadFlags()
    } catch {
      // Keep UI usable when pending request endpoint is temporarily unavailable.
    }
  }

  async function respondToPendingServerRequest(reply: UiServerRequestReply): Promise<void> {
    try {
      await replyToServerRequest(reply.id, {
        result: reply.result,
        error: reply.error,
      })
      removePendingServerRequestById(reply.id)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to reply to server request'
    }
  }

  function stopPolling(): void {
    if (stopNotificationStream) {
      stopNotificationStream()
      stopNotificationStream = null
    }
    if (backgroundSyncTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(backgroundSyncTimer)
      backgroundSyncTimer = null
    }
    stopActiveSyncBoost()
    clearBufferedLiveDeltas()

    pendingThreadsRefresh = false
    pendingThreadMessageRefresh.clear()
    pendingTurnStartsById.clear()
    clearEventSyncTimer()
    abortCurrentSync()
    isPolling.value = false
    if (rateLimitRefreshTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(rateLimitRefreshTimer)
      rateLimitRefreshTimer = null
    }
    clearVisibilitySyncTimer()
    stopVisibilitySync()
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
    lastNotificationAtMs = Date.now()
    notificationHealthTick.value = lastNotificationAtMs
    realtimeConnectionState.value = 'disconnected'
    lastSuccessfulSyncAtMs.value = 0
    activeSyncBoostUntilMs = 0
    persistedMessagesByThreadId.value = {}
    liveAgentMessagesByThreadId.value = {}
    liveReasoningTextByThreadId.value = {}
    liveCommandsByThreadId.value = {}
    turnActivityByThreadId.value = {}
    turnSummaryByThreadId.value = {}
    turnErrorByThreadId.value = {}
    activeTurnIdByThreadId.value = {}
    lastExecutionSignalAtByThreadId.value = {}
    threadReadActiveStateByThreadId.value = {}
    ignoredStaleActiveTurnByThreadId.value = {}
    lastThreadDetailSyncAtById.value = {}
    queueProcessingByThreadId.value = {}
  }

  const selectedThreadQueuedMessages = computed<QueuedMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []
    return queuedMessagesByThreadId.value[threadId] ?? []
  })

  const selectedThreadQueueProcessing = computed<boolean>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return false
    return queueProcessingByThreadId.value[threadId] === true
  })

  function removeQueuedMessage(messageId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    removeQueuedMessageByThreadId(threadId, messageId)
  }

  async function quoteQueuedMessage(messageId: string): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue) return
    const msg = queue.find((m) => m.id === messageId)
    if (!msg) return
    try {
      await sendMessageToSelectedThread(msg.text, msg.imageUrls, msg.skills, 'steer', msg.fileAttachments)
      removeQueuedMessageByThreadId(threadId, messageId)
    } catch {
      // Keep the queued message so the user can retry or edit it.
    }
  }

  return {
    projectGroups,
    projectDisplayNameById,
    selectedThread,
    selectedThreadScrollState,
    selectedThreadServerRequests,
    selectedLiveOverlay,
    selectedThreadExecutionActive,
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
    renameThreadById,
    forkThreadById,
    sendMessageToSelectedThread,
    sendMessageToNewThread,
    interruptSelectedThreadTurn,
    rollbackSelectedThread,
    isRollingBack,
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
  }
}
