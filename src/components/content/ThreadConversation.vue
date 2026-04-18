<template>
  <section class="conversation-root" :class="{ 'conversation-root--switching': isThreadSwitchingState }">
    <div v-if="showLoadingIndicator" class="conversation-status-loading" aria-live="polite">
      <span class="conversation-status-loading-dot" />
      <span class="conversation-status-loading-text">{{ loadingIndicatorText }}</span>
    </div>

    <div
      v-if="!hasRenderableConversation && !props.isLoading"
      class="conversation-empty-state"
    >
      <p class="conversation-empty">当前会话还没有消息。</p>
      <div v-if="showEmptyThreadActions" class="conversation-empty-actions">
        <button type="button" class="conversation-empty-action conversation-empty-action-primary" @click="emit('returnToNewThread')">
          返回新会话
        </button>
        <button type="button" class="conversation-empty-action" @click="emit('dismissEmptyThread')">
          移除此空会话
        </button>
      </div>
    </div>

    <template v-else>
      <ul ref="conversationListRef" class="conversation-list" :class="{ 'conversation-list--switching': isThreadSwitchingState }">
      <li
        v-if="hasHiddenEarlierMessages"
        class="conversation-item conversation-item-load-more"
      >
        <button
          type="button"
          class="conversation-load-more-button"
          :disabled="isRevealingOlderMessages"
          @click="onRevealOlderMessages"
        >
          <span class="conversation-load-more-title">
            {{ isRevealingOlderMessages ? '正在加载更早消息...' : `继续查看更多（剩余 ${hiddenEarlierMessageCount} 条）` }}
          </span>
          <span class="conversation-load-more-hint">滑到顶部也会继续加载</span>
        </button>
      </li>
      <li
        v-for="request in pendingRequests"
        :key="`server-request:${request.id}`"
        :ref="(el) => setPendingRequestMeasureRef(request.id, el)"
        :data-pending-request-id="String(request.id)"
        class="conversation-item conversation-item-request"
      >
        <div class="message-row">
          <div class="message-stack">
            <article class="request-card">
              <p class="request-title">{{ requestMethodLabel(request.method) }}</p>
              <p class="request-meta">请求 #{{ request.id }} · {{ formatIsoTime(request.receivedAtIso) }}</p>

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
        v-if="virtualTopSpacerHeight > 0"
        class="conversation-spacer"
        aria-hidden="true"
        :style="{ height: `${String(virtualTopSpacerHeight)}px` }"
      />
      <li
        v-for="entry in virtualizedMessages"
        :key="entry.message.id"
        :ref="(el) => setMessageMeasureRef(entry.message.id, el)"
        class="conversation-item"
        :class="{ 'conversation-item-actionable': canShowMessageActions(entry.message) }"
        :data-role="entry.message.role"
        :data-message-type="entry.message.messageType || ''"
      >
        <div v-if="isCommandMessage(entry.message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <button
              type="button"
              class="cmd-row"
              :class="[commandStatusClass(entry.message), { 'cmd-expanded': isCommandExpanded(entry.message) }]"
              @click="toggleCommandExpand(entry.message)"
            >
              <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(entry.message) }">▶</span>
              <span class="cmd-status">{{ commandStatusLabel(entry.message) }}</span>
              <span v-if="commandDurationLabel(entry.message)" class="cmd-duration">{{ commandDurationLabel(entry.message) }}</span>
              <code class="cmd-label">{{ entry.message.commandExecution?.command || '（命令）' }}</code>
            </button>
            <div
              class="cmd-output-wrap"
              :class="{ 'cmd-output-visible': isCommandExpanded(entry.message), 'cmd-output-collapsing': isCommandCollapsing(entry.message) }"
            >
              <div class="cmd-output-inner">
                <pre class="cmd-output">{{ entry.message.commandExecution?.aggregatedOutput || '（无输出）' }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="message-row"
          :data-role="entry.message.role"
          :data-message-type="entry.message.messageType || ''"
        >
          <div class="message-stack" :data-role="entry.message.role">
            <p
              v-if="messageRoleLabel(entry.message, entry.messageIndex)"
              class="message-eyebrow"
              :data-role="entry.message.role"
            >
              {{ messageRoleLabel(entry.message, entry.messageIndex) }}
            </p>
            <article class="message-body" :data-role="entry.message.role">
              <ul
                v-if="entry.message.images && entry.message.images.length > 0"
                class="message-image-list"
                :data-role="entry.message.role"
              >
                <li v-for="imageUrl in entry.message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img class="message-image-preview" :src="toRenderableImageUrl(imageUrl)" alt="消息图片预览" loading="lazy" />
                  </button>
                </li>
              </ul>

              <div
                v-if="entry.message.fileAttachments && entry.message.fileAttachments.length > 0"
                class="message-file-attachments"
              >
                <span v-for="att in entry.message.fileAttachments" :key="att.path" class="message-file-chip">
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

              <article v-if="entry.message.text.length > 0" class="message-card" :data-role="entry.message.role">
                <div v-if="entry.message.messageType === 'worked'" class="worked-separator-wrap" aria-live="polite">
                  <button type="button" class="worked-separator" @click="toggleWorkedExpand(entry.message)">
                    <span class="worked-separator-line" aria-hidden="true" />
                    <span class="worked-chevron" :class="{ 'worked-chevron-open': isWorkedExpanded(entry.message) }">▶</span>
                    <p class="worked-separator-text">{{ entry.message.text }}</p>
                    <span class="worked-separator-line" aria-hidden="true" />
                  </button>
                  <div v-if="isWorkedExpanded(entry.message)" class="worked-details">
                    <div
                      v-for="cmd in getWorkedCommands(entry.message.id)"
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
                        <span v-if="commandDurationLabel(cmd)" class="cmd-duration">{{ commandDurationLabel(cmd) }}</span>
                        <code class="cmd-label">{{ cmd.commandExecution?.command || '（命令）' }}</code>
                      </button>
                      <div
                        class="cmd-output-wrap"
                        :class="{ 'cmd-output-visible': isCommandExpanded(cmd), 'cmd-output-collapsing': isCommandCollapsing(cmd) }"
                      >
                        <div class="cmd-output-inner">
                          <pre class="cmd-output">{{ cmd.commandExecution?.aggregatedOutput || '（无输出）' }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="message-text-flow">
                  <template
                    v-for="(block, blockIndex) in getPreparedMessageBlocks(entry.message)"
                    :key="`block-${blockIndex}`"
                  >
                    <p v-if="block.kind === 'text'" class="message-text">
                      <template v-for="(segment, segmentIndex) in block.segments" :key="`seg-${blockIndex}-${segmentIndex}`">
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
                    <p v-else-if="isMarkdownImageFailed(entry.message.id, blockIndex)" class="message-text">{{ block.markdown }}</p>
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
                        @error="onMarkdownImageError(entry.message.id, blockIndex)"
                      />
                    </button>
                  </template>
                </div>
              </article>
            </article>

            <div v-if="canShowMessageActions(entry.message)" class="message-actions">
              <button
                v-if="canCopyMessage(entry.message)"
                class="message-action-button"
                type="button"
                title="复制消息内容"
                @click="onCopyMessage(entry.message)"
              >
                <IconTablerCopy class="message-action-icon" />
                <span class="message-action-label">复制</span>
              </button>
              <button
                v-if="canRollbackMessage(entry.message)"
                class="message-action-button"
                type="button"
                title="回滚到这条消息，并移除其后的当前轮次内容"
                @click="onRollback(entry.message)"
              >
                <IconTablerArrowBackUp class="message-action-icon" />
                <span class="message-action-label">回滚</span>
              </button>
            </div>
          </div>
        </div>
      </li>
      <li
        v-if="virtualBottomSpacerHeight > 0"
        class="conversation-spacer"
        aria-hidden="true"
        :style="{ height: `${String(virtualBottomSpacerHeight)}px` }"
      />
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article
              v-if="shouldRenderDetailedLiveOverlay"
              class="live-overlay-inline"
              aria-live="polite"
            >
              <div class="live-overlay-head">
                <span class="live-overlay-indicator" aria-hidden="true">
                  <span class="live-overlay-indicator-ring" />
                  <span class="live-overlay-indicator-core" />
                </span>
                <div class="live-overlay-heading">
                  <p class="live-overlay-label">{{ liveOverlayPrimaryLabel(liveOverlay) }}</p>
                  <span class="live-overlay-dots" aria-hidden="true">
                    <span class="live-overlay-dot" />
                    <span class="live-overlay-dot" />
                    <span class="live-overlay-dot" />
                  </span>
                </div>
              </div>
              <div
                v-if="!liveOverlayCommandMessage && liveOverlay.activityDetails.length > 0"
                class="live-overlay-detail-list"
              >
                <span
                  v-for="detail in liveOverlayDetails(liveOverlay)"
                  :key="detail"
                  class="live-overlay-detail-chip"
                >
                  {{ detail }}
                </span>
              </div>
              <section v-if="liveOverlayCommandMessage" class="live-overlay-command-panel">
                <div class="cmd-row cmd-status-running live-overlay-command-row">
                  <span class="cmd-status">{{ commandStatusLabel(liveOverlayCommandMessage) }}</span>
                  <span v-if="commandDurationLabel(liveOverlayCommandMessage)" class="cmd-duration">
                    {{ commandDurationLabel(liveOverlayCommandMessage) }}
                  </span>
                  <code class="cmd-label">{{ liveOverlayCommandMessage.commandExecution?.command || '（命令）' }}</code>
                </div>
                <div v-if="liveOverlayCommandOutput" class="live-overlay-command-output-wrap">
                  <pre class="cmd-output live-overlay-command-output">{{ liveOverlayCommandOutput }}</pre>
                </div>
              </section>
              <p
                v-else-if="liveOverlay.reasoningText"
                class="live-overlay-reasoning"
                ref="liveOverlayReasoningRef"
              >
                {{ liveOverlay.reasoningText }}
              </p>
              <p v-else class="live-overlay-hint">
                {{ liveOverlayHint(liveOverlay) }}
              </p>
              <section v-if="overlayPrimaryPendingRequest" class="live-overlay-actions">
                <template v-if="isApprovalRequestMethod(overlayPrimaryPendingRequest.method)">
                  <button
                    type="button"
                    class="live-overlay-action live-overlay-action-primary"
                    @click="onRespondApproval(overlayPrimaryPendingRequest.id, 'accept')"
                  >
                    允许
                  </button>
                  <button
                    type="button"
                    class="live-overlay-action"
                    @click="onRespondApproval(overlayPrimaryPendingRequest.id, 'acceptForSession')"
                  >
                    始终允许
                  </button>
                  <button
                    type="button"
                    class="live-overlay-action"
                    @click="onRespondApproval(overlayPrimaryPendingRequest.id, 'decline')"
                  >
                    拒绝
                  </button>
                  <button
                    type="button"
                    class="live-overlay-action"
                    @click="onRespondApproval(overlayPrimaryPendingRequest.id, 'cancel')"
                  >
                    取消
                  </button>
                </template>
                <template v-else-if="overlayPrimaryPendingRequest.method === 'item/tool/call'">
                  <button
                    type="button"
                    class="live-overlay-action live-overlay-action-primary"
                    @click="onRespondToolCallFailure(overlayPrimaryPendingRequest.id)"
                  >
                    返回失败
                  </button>
                  <button
                    type="button"
                    class="live-overlay-action"
                    @click="onRespondToolCallSuccess(overlayPrimaryPendingRequest.id)"
                  >
                    返回成功
                  </button>
                  <button
                    type="button"
                    class="live-overlay-action"
                    @click="scrollToPendingRequests"
                  >
                    查看详情
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="live-overlay-action live-overlay-action-primary"
                    @click="scrollToPendingRequests"
                  >
                    {{ overlayPrimaryPendingRequest.method === 'item/tool/requestUserInput' ? '去填写' : '查看请求' }}
                  </button>
                </template>
              </section>
              <p v-if="pendingRequests.length > 1" class="live-overlay-request-count">
                还有 {{ pendingRequests.length - 1 }} 个待处理请求
              </p>
              <p v-if="liveOverlay.errorText" class="live-overlay-error">{{ liveOverlay.errorText }}</p>
            </article>
            <article
              v-else
              class="live-overlay-inline live-overlay-inline-compact"
              aria-live="polite"
            >
              <div class="live-overlay-compact-main">
                <span class="live-overlay-indicator" aria-hidden="true">
                  <span class="live-overlay-indicator-ring" />
                  <span class="live-overlay-indicator-core" />
                </span>
                <div class="live-overlay-compact-copy">
                  <div class="live-overlay-compact-head">
                    <p class="live-overlay-compact-label">{{ liveOverlayPrimaryLabel(liveOverlay) }}</p>
                    <span class="live-overlay-dots" aria-hidden="true">
                      <span class="live-overlay-dot" />
                      <span class="live-overlay-dot" />
                      <span class="live-overlay-dot" />
                    </span>
                  </div>
                  <p class="live-overlay-compact-hint">{{ liveOverlayCompactHint(liveOverlay) }}</p>
                </div>
              </div>
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
import type { ComponentPublicInstance } from 'vue'
import type { ThreadScrollState, UiLiveOverlay, UiMessage, UiServerRequest } from '../../types/codex'
import IconTablerX from '../icons/IconTablerX.vue'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsingCommandIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const prevCommandStatuses = ref<Record<string, string>>({})
const commandElapsedNowMs = ref(Date.now())
const observedCommandStartedAtById = ref<Record<string, number>>({})
let commandElapsedTimer: number | null = null

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isRunningCommandMessage(message: UiMessage): boolean {
  return isCommandMessage(message) && message.commandExecution?.status === 'inProgress'
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

function formatCommandDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return ''
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    if (minutes > 0) return `${String(hours)} 小时 ${String(minutes)} 分`
    return `${String(hours)} 小时`
  }
  if (minutes > 0) {
    if (seconds > 0) return `${String(minutes)} 分 ${String(seconds)} 秒`
    return `${String(minutes)} 分`
  }
  return `${String(seconds)} 秒`
}

function resolveCommandDurationMs(message: UiMessage): number | null {
  const ce = message.commandExecution
  if (!ce) return null
  if (ce.status === 'inProgress') {
    const startedAtMs =
      (typeof ce.startedAtMs === 'number' && Number.isFinite(ce.startedAtMs) && ce.startedAtMs > 0)
        ? ce.startedAtMs
        : observedCommandStartedAtById.value[message.id]
    if (typeof startedAtMs === 'number' && Number.isFinite(startedAtMs) && startedAtMs > 0) {
      return Math.max(0, commandElapsedNowMs.value - startedAtMs)
    }
  }
  return typeof ce.durationMs === 'number' && Number.isFinite(ce.durationMs)
    ? Math.max(0, ce.durationMs)
    : null
}

function commandDurationLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  const durationMs = resolveCommandDurationMs(message)
  if (durationMs === null) return ''
  const durationText = formatCommandDuration(durationMs)
  if (!durationText) return ''
  return ce.status === 'inProgress' ? `已运行 ${durationText}` : `用时 ${durationText}`
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function stopCommandElapsedTimer(): void {
  if (commandElapsedTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(commandElapsedTimer)
    commandElapsedTimer = null
  }
}

function startCommandElapsedTimer(): void {
  if (typeof window === 'undefined') return
  commandElapsedNowMs.value = Date.now()
  if (commandElapsedTimer !== null) return
  commandElapsedTimer = window.setInterval(() => {
    commandElapsedNowMs.value = Date.now()
  }, 1000)
}

function syncObservedCommandStartTimes(messages: UiMessage[]): void {
  const next: Record<string, number> = {}
  const now = Date.now()
  let hasRunningCommand = false

  for (const message of messages) {
    const ce = message.commandExecution
    if (!ce || message.messageType !== 'commandExecution' || ce.status !== 'inProgress') continue
    hasRunningCommand = true
    if (typeof ce.startedAtMs === 'number' && Number.isFinite(ce.startedAtMs) && ce.startedAtMs > 0) {
      next[message.id] = ce.startedAtMs
      continue
    }
    const knownStartedAt = observedCommandStartedAtById.value[message.id]
    if (typeof knownStartedAt === 'number' && Number.isFinite(knownStartedAt) && knownStartedAt > 0) {
      next[message.id] = knownStartedAt
      continue
    }
    const baseDurationMs = typeof ce.durationMs === 'number' && Number.isFinite(ce.durationMs)
      ? Math.max(0, ce.durationMs)
      : 0
    next[message.id] = Math.max(0, now - baseDurationMs)
  }

  observedCommandStartedAtById.value = next
  if (hasRunningCommand) {
    startCommandElapsedTimer()
  } else {
    stopCommandElapsedTimer()
  }
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
  showEmptyThreadActions?: boolean
  isThreadSwitching?: boolean
}>()

const MESSAGE_WINDOW_SIZE = 20
const renderableMessages = computed<UiMessage[]>(() => (
  props.messages.filter((message) => !isRunningCommandMessage(message))
))
const isRevealingOlderMessages = ref(false)
const canAutoRevealOlderMessages = ref(true)
const visibleMessageStartIndex = ref(0)

function latestVisibleStartIndex(messageCount: number): number {
  return Math.max(messageCount - MESSAGE_WINDOW_SIZE, 0)
}

const visibleRenderableMessages = computed<UiMessage[]>(() => (
  renderableMessages.value.slice(visibleMessageStartIndex.value)
))
const hiddenEarlierMessageCount = computed(() => visibleMessageStartIndex.value)
const hasHiddenEarlierMessages = computed(() => hiddenEarlierMessageCount.value > 0)

const liveOverlayCommandMessage = computed<UiMessage | null>(() => {
  const overlay = props.liveOverlay
  if (!overlay || !overlay.activityLabel.includes('执行命令')) return null
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const candidate = props.messages[index]
    if (candidate && isRunningCommandMessage(candidate)) return candidate
  }
  return null
})

const liveOverlayCommandOutput = computed<string>(() => (
  liveOverlayCommandMessage.value?.commandExecution?.aggregatedOutput?.trim() ?? ''
))

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
  rollback: [payload: { turnIndex: number; prependText?: string }]
  returnToNewThread: []
  dismissEmptyThread: []
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const liveOverlayReasoningRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const fileLinkContextMenuRef = ref<HTMLElement | null>(null)
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const hasPendingBelowFoldUpdates = ref(false)
const autoFollowBottom = ref(props.scrollState?.isAtBottom !== false)
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
type PreparedMessageBlock =
  | { kind: 'text'; value: string; segments: InlineSegment[] }
  | { kind: 'image'; url: string; alt: string; markdown: string }
type VirtualizedMessageEntry = {
  message: UiMessage
  messageIndex: number
}
type MeasureRefTarget = Element | ComponentPublicInstance | null
type ScrollAnchorSnapshot = {
  measureKind: 'message' | 'request'
  measureId: string
  viewportOffset: number
}

const VIRTUALIZE_MIN_MESSAGES = 32
const VIRTUAL_OVERSCAN_PX = 640
const ESTIMATED_PENDING_REQUEST_HEIGHT_PX = 156

let scrollRestoreFrame = 0
let scrollAnchorRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let scrollStateEmitFrame = 0
let scrollInteractionFrame = 0
let pendingScrollStateContainer: HTMLElement | null = null
let pendingScrollStateForce = false
let pendingScrollInteractionContainer: HTMLElement | null = null
let lastGapMeasuredContainer: HTMLElement | null = null
let lastGapMeasuredViewportHeight = -1
let observedConversationListElement: HTMLElement | null = null
let lastScrollStateEmitAt = 0
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const failedMarkdownImageKeys = ref<Set<string>>(new Set())
const preparedMessageBlocksById = new Map<string, { text: string; blocks: PreparedMessageBlock[] }>()
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const EMPTY_WORKED_COMMANDS: UiMessage[] = []
const conversationViewportHeight = ref(0)
const conversationScrollTop = ref(0)
const conversationItemGap = ref(0)
const lastEmittedScrollStateSignature = ref('')
const measuredMessageHeightById = ref<Record<string, number>>({})
const measuredPendingRequestHeightById = ref<Record<string, number>>({})
const observedMessageElementsById = new Map<string, HTMLElement>()
const observedPendingRequestElementsById = new Map<string, HTMLElement>()
const itemResizeObserver =
  typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
      const anchorSnapshot = !shouldLockToBottom() ? captureVisibleConversationAnchor() : null
      let nextMessageHeights = measuredMessageHeightById.value
      let nextPendingRequestHeights = measuredPendingRequestHeightById.value
      let hasMessageHeightChange = false
      let hasPendingRequestHeightChange = false

      for (const entry of entries) {
        const target = entry.target
        if (!(target instanceof HTMLElement)) continue
        const measureKind = target.dataset.measureKind
        const measureId = target.dataset.measureId ?? ''
        if (!measureKind || !measureId) continue

        const nextHeight = Math.max(Math.ceil(target.getBoundingClientRect().height), 1)
        if (measureKind === 'message') {
          if (nextMessageHeights[measureId] === nextHeight) continue
          if (!hasMessageHeightChange) {
            nextMessageHeights = { ...nextMessageHeights }
            hasMessageHeightChange = true
          }
          nextMessageHeights[measureId] = nextHeight
          continue
        }

        if (measureKind === 'request') {
          if (nextPendingRequestHeights[measureId] === nextHeight) continue
          if (!hasPendingRequestHeightChange) {
            nextPendingRequestHeights = { ...nextPendingRequestHeights }
            hasPendingRequestHeightChange = true
          }
          nextPendingRequestHeights[measureId] = nextHeight
        }
      }

      if (hasMessageHeightChange) {
        measuredMessageHeightById.value = nextMessageHeights
      }
      if (hasPendingRequestHeightChange) {
        measuredPendingRequestHeightById.value = nextPendingRequestHeights
      }
      if (hasMessageHeightChange || hasPendingRequestHeightChange) {
        if (shouldLockToBottom()) {
          scheduleBottomLock(2)
        } else if (anchorSnapshot) {
          void scheduleScrollAnchorRestore(anchorSnapshot)
        }
      }
    })
    : null
const conversationListResizeObserver =
  typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target
        if (!(target instanceof HTMLElement)) continue
        syncConversationViewport(target)
        if (shouldLockToBottom()) {
          scheduleBottomLock(2)
        }
      }
    })
    : null
const hasRenderableConversation = computed(() => (
  visibleRenderableMessages.value.length > 0 ||
  props.pendingRequests.length > 0 ||
  props.liveOverlay !== null
))
const isThreadSwitchingState = computed(() => props.isThreadSwitching === true && hasRenderableConversation.value)
const showLoadingIndicator = computed(() => props.isLoading)
const loadingIndicatorText = computed(() => {
  if (props.isThreadSwitching === true) return '切换会话中...'
  return hasRenderableConversation.value ? '同步中...' : '载入中...'
})
const showJumpToLatestButton = computed(() => (
  hasRenderableConversation.value &&
  !shouldLockToBottom()
))
const overlayPrimaryPendingRequest = computed<UiServerRequest | null>(() => props.pendingRequests[0] ?? null)
const shouldRenderDetailedLiveOverlay = computed<boolean>(() => {
  const overlay = props.liveOverlay
  if (!overlay) return false
  if (overlayPrimaryPendingRequest.value) return true
  return overlay.errorText.trim().length > 0
})
const liveOverlayBehaviorSignature = computed<string>(() => {
  const overlay = props.liveOverlay
  if (!overlay) return ''
  return [
    overlay.activityLabel.trim(),
    overlay.errorText.trim(),
    overlayPrimaryPendingRequest.value?.id ?? '',
    overlayPrimaryPendingRequest.value?.method ?? '',
    String(props.pendingRequests.length),
  ].join('|')
})
const jumpToLatestTitle = computed(() => (
  hasPendingBelowFoldUpdates.value ? '跳到最新输出' : '回到底部'
))
const pendingRequestsHeight = computed(() => (
  props.pendingRequests.reduce((total, request) => (
    total + (measuredPendingRequestHeightById.value[String(request.id)] ?? ESTIMATED_PENDING_REQUEST_HEIGHT_PX)
  ), 0) +
  conversationItemGap.value *
    (props.pendingRequests.length > 0 && visibleRenderableMessages.value.length > 0
      ? props.pendingRequests.length
      : Math.max(props.pendingRequests.length - 1, 0))
))
const workedCommandsByMessageId = computed<Record<string, UiMessage[]>>(() => {
  const next: Record<string, UiMessage[]> = {}
  let pendingCommands: UiMessage[] = []

  for (const message of props.messages) {
    if (message.messageType === 'commandExecution' && message.commandExecution) {
      if (message.commandExecution.status === 'inProgress') continue
      pendingCommands.push(message)
      continue
    }
    if (message.messageType === 'worked') {
      next[message.id] = pendingCommands.length > 0 ? [...pendingCommands] : EMPTY_WORKED_COMMANDS
      pendingCommands = []
      continue
    }
    if (message.role === 'user') {
      pendingCommands = []
    }
  }

  return next
})
const shouldVirtualizeMessages = computed(() => visibleRenderableMessages.value.length >= VIRTUALIZE_MIN_MESSAGES)
const messageHeightMetrics = computed(() => {
  const cumulativeHeights: number[] = [0]
  for (const message of visibleRenderableMessages.value) {
    const height = measuredMessageHeightById.value[message.id] ?? estimateMessageHeight(message)
    cumulativeHeights.push(cumulativeHeights[cumulativeHeights.length - 1] + height + conversationItemGap.value)
  }

  const totalHeight = visibleRenderableMessages.value.length > 0
    ? Math.max((cumulativeHeights[cumulativeHeights.length - 1] ?? 0) - conversationItemGap.value, 0)
    : 0

  return {
    cumulativeHeights,
    totalHeight,
  }
})

const virtualizedMessageRange = computed(() => {
  if (!shouldVirtualizeMessages.value || visibleRenderableMessages.value.length === 0) {
    return {
      startIndex: 0,
      endIndex: visibleRenderableMessages.value.length,
    }
  }

  const { cumulativeHeights } = messageHeightMetrics.value

  const relativeScrollTop = Math.max(conversationScrollTop.value - pendingRequestsHeight.value, 0)
  const viewportHeight = Math.max(conversationViewportHeight.value, 1)
  const visibleStart = Math.max(relativeScrollTop - VIRTUAL_OVERSCAN_PX, 0)
  const visibleEnd = relativeScrollTop + viewportHeight + VIRTUAL_OVERSCAN_PX

  let startIndex = 0
  while (
    startIndex < visibleRenderableMessages.value.length &&
    cumulativeHeights[startIndex + 1] < visibleStart
  ) {
    startIndex += 1
  }

  let endIndex = startIndex
  while (
    endIndex < visibleRenderableMessages.value.length &&
    cumulativeHeights[endIndex] < visibleEnd
  ) {
    endIndex += 1
  }

  endIndex = Math.min(visibleRenderableMessages.value.length, Math.max(endIndex + 1, startIndex + 1))

  return {
    startIndex,
    endIndex,
  }
})
const virtualizedMessageMetrics = computed(() => ({
  ...messageHeightMetrics.value,
  ...virtualizedMessageRange.value,
}))
const virtualizedMessages = computed<VirtualizedMessageEntry[]>(() => {
  const { startIndex, endIndex } = virtualizedMessageMetrics.value
  return visibleRenderableMessages.value
    .slice(startIndex, endIndex)
    .map((message, index) => ({
      message,
      messageIndex: visibleMessageStartIndex.value + startIndex + index,
    }))
})
const virtualTopSpacerHeight = computed(() => {
  if (!shouldVirtualizeMessages.value) return 0
  return Math.max(
    (virtualizedMessageMetrics.value.cumulativeHeights[virtualizedMessageMetrics.value.startIndex] ?? 0) -
      conversationItemGap.value,
    0,
  )
})
const virtualBottomSpacerHeight = computed(() => {
  if (!shouldVirtualizeMessages.value) return 0
  const { cumulativeHeights, endIndex, totalHeight } = virtualizedMessageMetrics.value
  return Math.max(totalHeight - (cumulativeHeights[endIndex] ?? totalHeight), 0)
})

function measureObservedElementHeight(element: HTMLElement): number {
  return Math.max(Math.ceil(element.getBoundingClientRect().height), 1)
}

function captureVisibleConversationAnchor(): ScrollAnchorSnapshot | null {
  const container = conversationListRef.value
  if (!container) return null
  const containerRect = container.getBoundingClientRect()
  const measuredElements = container.querySelectorAll<HTMLElement>('[data-measure-kind][data-measure-id]')

  for (const element of measuredElements) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom <= containerRect.top + 1) continue
    if (rect.top >= containerRect.bottom) break

    const measureKind = element.dataset.measureKind
    const measureId = element.dataset.measureId
    if ((measureKind === 'message' || measureKind === 'request') && measureId) {
      return {
        measureKind,
        measureId,
        viewportOffset: rect.top - containerRect.top,
      }
    }
  }

  return null
}

function syncConversationViewport(container: HTMLElement): void {
  const viewportHeight = container.clientHeight
  conversationViewportHeight.value = viewportHeight
  conversationScrollTop.value = container.scrollTop
  if (lastGapMeasuredContainer === container && lastGapMeasuredViewportHeight === viewportHeight) {
    return
  }
  lastGapMeasuredContainer = container
  lastGapMeasuredViewportHeight = viewportHeight
  const style = window.getComputedStyle(container)
  const gapCandidate = style.rowGap || style.gap
  const parsedGap = Number.parseFloat(gapCandidate)
  conversationItemGap.value = Number.isFinite(parsedGap) ? parsedGap : 0
}

function updateMeasuredHeight(
  measureKind: 'message' | 'request',
  measureId: string,
  height: number,
): void {
  if (measureKind === 'message') {
    if (measuredMessageHeightById.value[measureId] === height) return
    measuredMessageHeightById.value = {
      ...measuredMessageHeightById.value,
      [measureId]: height,
    }
    return
  }

  if (measuredPendingRequestHeightById.value[measureId] === height) return
  measuredPendingRequestHeightById.value = {
    ...measuredPendingRequestHeightById.value,
    [measureId]: height,
  }
}

function observeMeasuredElement(
  measureKind: 'message' | 'request',
  measureId: string,
  element: HTMLElement,
  observedElementsById: Map<string, HTMLElement>,
): void {
  const previousElement = observedElementsById.get(measureId)
  if (previousElement && previousElement !== element) {
    itemResizeObserver?.unobserve(previousElement)
  }

  element.dataset.measureKind = measureKind
  element.dataset.measureId = measureId
  observedElementsById.set(measureId, element)
  updateMeasuredHeight(measureKind, measureId, measureObservedElementHeight(element))
  itemResizeObserver?.observe(element)
}

function disconnectMeasuredElement(
  measureId: string,
  observedElementsById: Map<string, HTMLElement>,
): void {
  const previousElement = observedElementsById.get(measureId)
  if (!previousElement) return
  itemResizeObserver?.unobserve(previousElement)
  observedElementsById.delete(measureId)
}

function pruneMeasuredHeightCache(
  keepIds: Set<string>,
  measuredHeightMap: Record<string, number>,
): Record<string, number> {
  let nextMeasuredHeightMap: Record<string, number> | null = null
  for (const [measureId, height] of Object.entries(measuredHeightMap)) {
    if (keepIds.has(measureId)) continue
    if (!nextMeasuredHeightMap) {
      nextMeasuredHeightMap = { ...measuredHeightMap }
    }
    delete nextMeasuredHeightMap[measureId]
  }
  return nextMeasuredHeightMap ?? measuredHeightMap
}

function pruneObservedElements(
  keepIds: Set<string>,
  observedElementsById: Map<string, HTMLElement>,
): void {
  for (const [measureId, element] of observedElementsById.entries()) {
    if (keepIds.has(measureId)) continue
    itemResizeObserver?.unobserve(element)
    observedElementsById.delete(measureId)
  }
}

function disconnectAllObservedElements(observedElementsById: Map<string, HTMLElement>): void {
  for (const element of observedElementsById.values()) {
    itemResizeObserver?.unobserve(element)
  }
  observedElementsById.clear()
}

function pruneMeasuredMessageHeights(messages: UiMessage[]): void {
  const keepIds = new Set(messages.map((message) => message.id))
  measuredMessageHeightById.value = pruneMeasuredHeightCache(keepIds, measuredMessageHeightById.value)
  pruneObservedElements(keepIds, observedMessageElementsById)
}

function pruneMeasuredPendingRequestHeights(requests: UiServerRequest[]): void {
  const keepIds = new Set(requests.map((request) => String(request.id)))
  measuredPendingRequestHeightById.value = pruneMeasuredHeightCache(keepIds, measuredPendingRequestHeightById.value)
  pruneObservedElements(keepIds, observedPendingRequestElementsById)
}

function setMessageMeasureRef(messageId: string, element: MeasureRefTarget): void {
  const measuredElement = toMeasuredElement(element)
  if (!measuredElement) {
    disconnectMeasuredElement(messageId, observedMessageElementsById)
    return
  }
  observeMeasuredElement('message', messageId, measuredElement, observedMessageElementsById)
}

function toMeasuredElement(target: MeasureRefTarget): HTMLElement | null {
  if (target instanceof HTMLElement) return target
  if (target && '$el' in target) {
    const element = target.$el
    return element instanceof HTMLElement ? element : null
  }
  return null
}

function setPendingRequestMeasureRef(requestId: number, element: MeasureRefTarget): void {
  const measureId = String(requestId)
  const measuredElement = toMeasuredElement(element)
  if (!measuredElement) {
    disconnectMeasuredElement(measureId, observedPendingRequestElementsById)
    return
  }
  observeMeasuredElement('request', measureId, measuredElement, observedPendingRequestElementsById)
}

function restoreScrollAnchor(snapshot: ScrollAnchorSnapshot): boolean {
  if (shouldLockToBottom()) return false
  const container = conversationListRef.value
  if (!container) return false

  const observedElementsById =
    snapshot.measureKind === 'message'
      ? observedMessageElementsById
      : observedPendingRequestElementsById
  const element = observedElementsById.get(snapshot.measureId)
  if (!element) return false

  const containerRect = container.getBoundingClientRect()
  const nextViewportOffset = element.getBoundingClientRect().top - containerRect.top
  const scrollDelta = nextViewportOffset - snapshot.viewportOffset
  if (Math.abs(scrollDelta) < 1) {
    syncConversationViewport(container)
    return true
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  container.scrollTop = Math.min(Math.max(container.scrollTop + scrollDelta, 0), maxScrollTop)
  syncConversationViewport(container)
  scheduleEmitScrollState(container)
  return true
}

async function scheduleScrollAnchorRestore(snapshot: ScrollAnchorSnapshot | null): Promise<boolean> {
  if (!snapshot) return false
  await nextTick()
  if (scrollAnchorRestoreFrame) {
    cancelAnimationFrame(scrollAnchorRestoreFrame)
  }

  return await new Promise<boolean>((resolve) => {
    scrollAnchorRestoreFrame = requestAnimationFrame(() => {
      scrollAnchorRestoreFrame = 0
      resolve(restoreScrollAnchor(snapshot))
    })
  })
}

async function revealOlderMessages(): Promise<void> {
  if (!hasHiddenEarlierMessages.value || isRevealingOlderMessages.value) return
  const anchorSnapshot = captureVisibleConversationAnchor()
  isRevealingOlderMessages.value = true
  canAutoRevealOlderMessages.value = false
  visibleMessageStartIndex.value = Math.max(visibleMessageStartIndex.value - MESSAGE_WINDOW_SIZE, 0)
  await nextTick()
  await scheduleScrollAnchorRestore(anchorSnapshot)
  isRevealingOlderMessages.value = false
}

function onRevealOlderMessages(): void {
  void revealOlderMessages()
}

function estimateTextHeight(text: string, pixelsPerLine = 22, charsPerLine = 54): number {
  const normalized = text.trim()
  if (!normalized) return 0
  const lineCount = normalized.split(/\r?\n/u).length
  const wrappedLineCount = Math.ceil(normalized.length / charsPerLine)
  return Math.max(Math.max(lineCount, wrappedLineCount), 1) * pixelsPerLine
}

function estimateMessageHeight(message: UiMessage): number {
  if (isCommandMessage(message)) {
    const output = message.commandExecution?.aggregatedOutput ?? ''
    if (!isCommandExpanded(message)) return 68
    return Math.min(120 + estimateTextHeight(output, 16, 78), 520)
  }

  if (message.messageType === 'worked') {
    if (!isWorkedExpanded(message)) return 64
    const commandsHeight = getWorkedCommands(message.id).reduce((total, command) => (
      total + (isCommandExpanded(command) ? 160 : 58)
    ), 0)
    return Math.min(84 + commandsHeight, 760)
  }

  let height = message.role === 'user' ? 74 : 92
  height += Math.min(estimateTextHeight(message.text), 520)

  const attachmentCount = message.fileAttachments?.length ?? 0
  if (attachmentCount > 0) {
    height += 18 + attachmentCount * 32
  }

  const inlineImageCount = message.images?.length ?? 0
  const markdownImageCount = (message.text.match(/!\[[^\]]*\]\(([^)\n]+)\)/gu) ?? []).length
  const imageCount = inlineImageCount + markdownImageCount
  if (imageCount > 0) {
    height += imageCount * 196
  }

  if (canShowMessageActions(message)) {
    height += 30
  }

  return Math.min(Math.max(height, 72), 980)
}

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

const LIKELY_PROJECT_DIRECTORY_ROOTS = new Set([
  '.agents',
  '.codex',
  '.github',
  'app',
  'artifacts',
  'assets',
  'components',
  'configs',
  'dist',
  'docs',
  'pages',
  'packages',
  'public',
  'scripts',
  'skills',
  'src',
  'test',
  'tests',
  'tmp',
  '记忆',
])

function isFilePath(value: string): boolean {
  if (!value) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (value.startsWith('file://')) return true
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeWindowsUnc = /^\\\\[^\\]+\\[^\\]+/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeWindowsUnc || looksLikeRelative) {
    return true
  }

  const normalized = normalizePathSeparators(value)
  if (!normalized.includes('/')) return false

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) return false

  const basename = segments[segments.length - 1] ?? ''
  const hasLikelyFileExtension = /\.[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/u.test(basename)
  if (hasLikelyFileExtension) return true

  return LIKELY_PROJECT_DIRECTORY_ROOTS.has(segments[0] ?? '')
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

function getWorkedCommands(messageId: string): UiMessage[] {
  return workedCommandsByMessageId.value[messageId] ?? EMPTY_WORKED_COMMANDS
}

function getPreparedMessageBlocks(message: UiMessage): PreparedMessageBlock[] {
  const cached = preparedMessageBlocksById.get(message.id)
  if (cached && cached.text === message.text) {
    return cached.blocks
  }

  const blocks = parseMessageBlocks(message.text).map<PreparedMessageBlock>((block) => {
    if (block.kind === 'text') {
      return {
        kind: 'text',
        value: block.value,
        segments: parseInlineSegments(block.value),
      }
    }
    return block
  })

  preparedMessageBlocksById.set(message.id, { text: message.text, blocks })
  return blocks
}

function prunePreparedMessageBlockCache(messages: UiMessage[]): void {
  const keepIds = new Set(messages.map((message) => message.id))
  for (const messageId of preparedMessageBlocksById.keys()) {
    if (!keepIds.has(messageId)) {
      preparedMessageBlocksById.delete(messageId)
    }
  }
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
          text: '工具调用已被 codex-web-local 界面拒绝。',
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
      message: '请求已被 codex-web-local 界面拒绝。',
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
    const candidate = renderableMessages.value[cursor]
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

function requestMethodLabel(method: string): string {
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return '命令执行需要批准'
    case 'item/fileChange/requestApproval':
      return '文件变更需要批准'
    case 'item/tool/requestUserInput':
      return '需要补充输入'
    case 'item/tool/call':
      return '工具调用等待处理'
    default:
      return method
  }
}

function isApprovalRequestMethod(method: string): boolean {
  return (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval'
  )
}

function liveOverlayPrimaryLabel(overlay: UiLiveOverlay): string {
  return overlay.activityLabel.trim() || '思考中'
}

function liveOverlayDetails(overlay: UiLiveOverlay): string[] {
  return overlay.activityDetails.slice(-3)
}

function liveOverlayHint(overlay: UiLiveOverlay): string {
  if (overlay.activityLabel.includes('等待确认')) {
    return '上方有待确认请求，允许或拒绝后会继续执行。'
  }
  if (overlay.activityLabel.includes('等待输入')) {
    return '上方有待补充内容，提交后会继续执行。'
  }
  if (overlay.activityLabel.includes('等待处理')) {
    return '上方有待处理请求，完成后会继续执行。'
  }
  if (overlay.activityLabel.includes('执行命令')) {
    return '命令仍在运行，输出会持续追加。'
  }
  return '处理中，底部会显示最新进展。'
}

function liveOverlayCompactHint(overlay: UiLiveOverlay): string {
  if (overlay.activityLabel.includes('执行命令')) {
    return '命令仍在执行，可先查看上方历史，新输出会继续追加。'
  }
  if (overlay.activityLabel.includes('思考')) {
    return '正在整理回复，完成后会自动停在最新内容。'
  }
  return '正在处理，界面会自动继续更新。'
}

function scrollToPendingRequests(): void {
  const container = conversationListRef.value
  if (!container) return
  clearBelowFoldUpdates()
  autoFollowBottom.value = false
  const firstPendingRequest = container.querySelector('[data-pending-request-id]')
  if (firstPendingRequest instanceof HTMLElement) {
    firstPendingRequest.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    return
  }
  container.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
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
  if (!container) return
  container.scrollTop = container.scrollHeight
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function flushScrollState(): void {
  scrollStateEmitFrame = 0
  const container = pendingScrollStateContainer
  const force = pendingScrollStateForce
  pendingScrollStateContainer = null
  pendingScrollStateForce = false
  if (!container) return
  emitScrollState(container, force)
}

function emitScrollState(container: HTMLElement, force = false, viewportSynced = false): void {
  if (!props.activeThreadId) return
  if (!viewportSynced) {
    syncConversationViewport(container)
  }
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0 ? Math.min(Math.max(container.scrollTop / maxScrollTop, 0), 1) : 1
  const atBottom = isAtBottom(container)
  const nextSignature = [
    props.activeThreadId,
    String(Math.round(container.scrollTop / 24)),
    atBottom ? '1' : '0',
    String(Math.round(scrollRatio * 100)),
  ].join(':')
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  if (!force && !atBottom && now - lastScrollStateEmitAt < 120) {
    return
  }
  if (!force && nextSignature === lastEmittedScrollStateSignature.value) {
    return
  }
  lastScrollStateEmitAt = now
  lastEmittedScrollStateSignature.value = nextSignature
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state: {
      scrollTop: container.scrollTop,
      isAtBottom: atBottom,
      scrollRatio,
    },
  })
}

function scheduleEmitScrollState(container: HTMLElement, force = false): void {
  if (typeof window === 'undefined') {
    emitScrollState(container, force)
    return
  }
  pendingScrollStateContainer = container
  pendingScrollStateForce = pendingScrollStateForce || force
  if (scrollStateEmitFrame) return
  scrollStateEmitFrame = requestAnimationFrame(flushScrollState)
}

function flushConversationScrollInteraction(): void {
  scrollInteractionFrame = 0
  const container = pendingScrollInteractionContainer
  pendingScrollInteractionContainer = null
  if (!container || props.isLoading) return
  syncConversationViewport(container)
  if (container.scrollTop > 160) {
    canAutoRevealOlderMessages.value = true
  }
  if (
    container.scrollTop <= 96 &&
    hasHiddenEarlierMessages.value &&
    canAutoRevealOlderMessages.value &&
    !isRevealingOlderMessages.value
  ) {
    void revealOlderMessages()
  }
  const atBottom = isAtBottom(container)
  autoFollowBottom.value = atBottom
  emitScrollState(container, false, true)
  if (atBottom) {
    clearBelowFoldUpdates()
  }
}

function markBelowFoldUpdate(): void {
  if (shouldLockToBottom()) return
  hasPendingBelowFoldUpdates.value = true
}

function clearBelowFoldUpdates(): void {
  hasPendingBelowFoldUpdates.value = false
}

watch(
  () => renderableMessages.value.length,
  (nextLength, previousLength) => {
    const nextLatestStartIndex = latestVisibleStartIndex(nextLength)
    if (previousLength == null) {
      visibleMessageStartIndex.value = nextLatestStartIndex
      return
    }

    if (nextLength === 0) {
      visibleMessageStartIndex.value = 0
      return
    }

    if (previousLength === 0) {
      visibleMessageStartIndex.value = nextLatestStartIndex
      return
    }

    visibleMessageStartIndex.value = Math.min(visibleMessageStartIndex.value, nextLatestStartIndex)
  },
  { immediate: true },
)

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return
  syncConversationViewport(container)

  const savedState = props.scrollState
  if (!savedState || savedState.isAtBottom) {
    autoFollowBottom.value = true
    enforceBottomState()
    return
  }

  autoFollowBottom.value = false
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  container.scrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  syncConversationViewport(container)
  scheduleEmitScrollState(container, true)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  autoFollowBottom.value = true
  scrollToBottom()
  syncConversationViewport(container)
  scheduleEmitScrollState(container)
  clearBelowFoldUpdates()
}

function shouldLockToBottom(): boolean {
  return autoFollowBottom.value
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

async function scheduleScrollRestore(forceBottom = shouldLockToBottom()): Promise<void> {
  const anchorSnapshot = forceBottom ? null : captureVisibleConversationAnchor()
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    if (forceBottom) {
      enforceBottomState()
    } else {
      const didRestoreAnchor = anchorSnapshot ? restoreScrollAnchor(anchorSnapshot) : false
      if (!didRestoreAnchor) {
        applySavedScrollState()
      }
    }
    bindPendingImageHandlers()
    if (forceBottom) {
      scheduleBottomLock()
    }
  })
}

watch(
  () => props.messages,
  async (next, previous) => {
    syncObservedCommandStartTimes(next)
    if (props.isLoading) return
    const previousMessages = previous ?? EMPTY_WORKED_COMMANDS
    const shouldFollowBottom = shouldLockToBottom()

    for (const m of next) {
      if (m.messageType !== 'commandExecution' || !m.commandExecution) continue
      const prev = prevCommandStatuses.value[m.id]
      const cur = m.commandExecution.status
      if (prev === 'inProgress' && cur !== 'inProgress') {
        scheduleCollapse(m.id)
      }
      prevCommandStatuses.value[m.id] = cur
    }

    prunePreparedMessageBlockCache(next)
    pruneMeasuredMessageHeights(next)

    if (previousMessages.length > 0 && !shouldFollowBottom) {
      markBelowFoldUpdate()
    }

    await scheduleScrollRestore(shouldFollowBottom)
  },
  { immediate: true },
)

watch(
  () => props.pendingRequests,
  async (next, previous) => {
    if (props.isLoading) return
    const shouldFollowBottom = shouldLockToBottom()
    pruneMeasuredPendingRequestHeights(next)

    if (previous.length > 0 && !shouldFollowBottom) {
      markBelowFoldUpdate()
    }

    await scheduleScrollRestore(shouldFollowBottom)
  },
)

watch(
  liveOverlayBehaviorSignature,
  async (signature) => {
    if (!signature) return
    const shouldFollowBottom = shouldLockToBottom()
    if (!shouldFollowBottom) {
      markBelowFoldUpdate()
    }
    await nextTick()
    if (!shouldFollowBottom) return
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
    preparedMessageBlocksById.clear()
    disconnectAllObservedElements(observedMessageElementsById)
    disconnectAllObservedElements(observedPendingRequestElementsById)
    measuredMessageHeightById.value = {}
    measuredPendingRequestHeightById.value = {}
    conversationScrollTop.value = 0
    lastGapMeasuredContainer = null
    lastGapMeasuredViewportHeight = -1
    lastScrollStateEmitAt = 0
    lastEmittedScrollStateSignature.value = ''
    isRevealingOlderMessages.value = false
    canAutoRevealOlderMessages.value = true
    visibleMessageStartIndex.value = latestVisibleStartIndex(renderableMessages.value.length)
    clearBelowFoldUpdates()
    autoFollowBottom.value = props.scrollState?.isAtBottom !== false
  },
  { flush: 'post' },
)

watch(
  () => props.scrollState?.isAtBottom,
  (isAtBottomState) => {
    autoFollowBottom.value = isAtBottomState !== false
  },
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

watch(
  conversationListRef,
  (nextElement, previousElement) => {
    if (previousElement) {
      previousElement.removeEventListener('scroll', onConversationScroll, { passive: true } as AddEventListenerOptions)
      observedConversationListElement = null
    }
    if (previousElement) {
      conversationListResizeObserver?.unobserve(previousElement)
    }
    if (!nextElement) return
    nextElement.addEventListener('scroll', onConversationScroll, { passive: true })
    observedConversationListElement = nextElement
    syncConversationViewport(nextElement)
    conversationListResizeObserver?.observe(nextElement)
  },
  { flush: 'post' },
)

function onConversationScroll(event: Event): void {
  const container = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : conversationListRef.value
  if (!container || props.isLoading) return
  pendingScrollInteractionContainer = container
  if (scrollInteractionFrame) return
  scrollInteractionFrame = requestAnimationFrame(flushConversationScrollInteraction)
}

function jumpToLatest(): void {
  autoFollowBottom.value = true
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
    if (!reasoningText || !shouldRenderDetailedLiveOverlay.value) return
    await nextTick()
    alignLiveOverlayReasoningToBottom()
  },
)

onBeforeUnmount(() => {
  stopCommandElapsedTimer()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (scrollAnchorRestoreFrame) {
    cancelAnimationFrame(scrollAnchorRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
  if (scrollStateEmitFrame) {
    cancelAnimationFrame(scrollStateEmitFrame)
  }
  if (scrollInteractionFrame) {
    cancelAnimationFrame(scrollInteractionFrame)
  }
  if (observedConversationListElement) {
    observedConversationListElement.removeEventListener('scroll', onConversationScroll, { passive: true } as AddEventListenerOptions)
    observedConversationListElement = null
  }
  conversationListResizeObserver?.disconnect()
  itemResizeObserver?.disconnect()
  disconnectAllObservedElements(observedMessageElementsById)
  disconnectAllObservedElements(observedPendingRequestElementsById)
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

.conversation-root--switching {
  @apply overflow-hidden;
}

.conversation-status-loading {
  @apply sticky top-0 z-10 mx-2 sm:mx-5 mb-1.5 mt-1.5 flex items-center gap-2 rounded-full border border-[#e5dbca] bg-[#fffdf8] px-3 py-1.5 text-xs text-[#7b7062];
  animation: conversationFadeIn 160ms ease-out;
}

.conversation-status-loading-dot {
  @apply h-1.5 w-1.5 rounded-full bg-[#0f766e];
}

.conversation-status-loading-text {
  @apply font-medium tracking-[0.01em];
}

.conversation-empty-state {
  @apply flex flex-col items-start gap-3 px-2 sm:px-5 py-2.5;
}

.conversation-empty {
  @apply m-0 text-sm text-[#8f8577];
}

.conversation-empty-actions {
  @apply flex flex-wrap items-center gap-2;
}

.conversation-empty-action {
  @apply inline-flex items-center justify-center rounded-full border border-[#d9d1c5] bg-[#fffaf2] px-3.5 py-1.5 text-xs font-medium text-[#6d5f4f] transition-colors;
}

.conversation-empty-action:hover {
  @apply border-[#c8bca9] bg-[#f7efe2];
}

.conversation-empty-action-primary {
  @apply border-[#d7c27a] bg-[#f8efd2] text-[#725b12];
}

.conversation-empty-action-primary:hover {
  @apply border-[#c7af5d] bg-[#f2e4b6];
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2.5 sm:px-5 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-1;
  padding-bottom: max(0.875rem, env(safe-area-inset-bottom));
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  transition: opacity 140ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.conversation-list--switching {
  opacity: 0.82;
  transform: translateY(2px);
}

.conversation-jump-to-latest {
  @apply absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#ddd3c2] bg-[#fffdf8] px-3 py-2 text-xs font-semibold text-[#544a3d] hover:border-[#bca98d] hover:text-[#1f2937];
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
  @apply h-2.5 w-2.5 rounded-full bg-blue-500;
}

.conversation-item {
  @apply m-0 w-full flex;
}

.conversation-item-actionable {
  position: relative;
  z-index: 0;
  overflow: visible;
}

.conversation-spacer {
  @apply m-0 w-full flex-none p-0 pointer-events-none;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-load-more {
  @apply justify-center;
}

.conversation-load-more-button {
  @apply mx-auto flex w-full max-w-180 flex-col items-center gap-0.5 rounded-2xl border border-dashed border-[#ddd3c2] bg-[#fffdf8] px-3 py-2 text-center transition-colors hover:border-[#cbb89b] hover:bg-[#fffaf0] disabled:cursor-default disabled:opacity-70;
}

.conversation-load-more-title {
  @apply text-xs font-semibold text-[#544a3d];
}

.conversation-load-more-hint {
  @apply text-[11px] text-[#8f8577];
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
  @apply relative flex flex-col w-full gap-0.5;
  overflow: visible;
}

.request-card {
  @apply w-full max-w-180 rounded-[20px] border border-[#ead9b5] bg-[#fff9ee] px-3 sm:px-3.5 py-2.5 sm:py-3 flex flex-col gap-1.5;
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
  @apply rounded-xl border border-[#e2c486] bg-white px-3 py-1.5 text-xs text-[#7d4911] hover:bg-[#fff0c9];
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
  @apply w-full max-w-180 rounded-[20px] border border-[#cfe6e0] bg-[#f6fbfa] px-3.5 py-2.5 flex flex-col gap-1.5;
}

.live-overlay-inline-compact {
  @apply max-w-132 rounded-[18px] px-3 py-2;
}

.live-overlay-head {
  @apply flex items-center gap-2;
}

.live-overlay-indicator {
  @apply relative flex h-7 w-7 items-center justify-center rounded-full border border-[#cfe6e0] bg-white shrink-0;
}

.live-overlay-indicator-ring {
  display: none;
}

.live-overlay-indicator-core {
  @apply block h-2 w-2 rounded-full bg-[#0f766e];
}

.live-overlay-heading {
  @apply min-w-0 flex flex-col gap-0.5;
}

.live-overlay-compact-main {
  @apply flex items-center gap-2.5;
}

.live-overlay-compact-copy {
  @apply min-w-0 flex-1 flex flex-col gap-0.5;
}

.live-overlay-compact-head {
  @apply flex items-center gap-2;
}

.live-overlay-inline-compact .live-overlay-indicator {
  @apply h-6 w-6;
}

.live-overlay-label {
  @apply m-0 text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0f766e];
}

.live-overlay-compact-label {
  @apply m-0 text-sm font-semibold text-[#1b4d47];
}

.live-overlay-dots {
  @apply inline-flex items-center gap-1;
}

.live-overlay-dot {
  @apply h-1.5 w-1.5 rounded-full bg-[#0f766e];
  opacity: 0.28;
}

.live-overlay-dot:nth-child(2) {
  opacity: 0.52;
}

.live-overlay-dot:nth-child(3) {
  opacity: 0.78;
}

.live-overlay-detail-list {
  @apply flex flex-wrap gap-1.5;
}

.live-overlay-detail-chip {
  @apply inline-flex items-center rounded-full border border-[#d6ebe6] bg-white/80 px-2 py-0.5 text-[11px] text-[#476760];
}

.live-overlay-command-panel {
  @apply flex flex-col gap-0;
}

.live-overlay-command-row {
  @apply cursor-default hover:bg-[#f8f4ec];
}

.live-overlay-command-output-wrap {
  @apply rounded-b-lg bg-zinc-900 border border-[#d8cfbf] border-t-0;
}

.live-overlay-command-output {
  @apply max-h-40;
}

.live-overlay-hint {
  @apply m-0 text-sm leading-5 text-[#5b756f];
}

.live-overlay-compact-hint {
  @apply m-0 text-[12px] leading-4 text-[#6b8a84];
}

.live-overlay-request-link {
  @apply inline-flex w-fit items-center rounded-full border border-[#c8ddd8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f766e] shadow-sm transition-colors hover:border-[#97c2b8] hover:text-[#0b5e58];
}

.live-overlay-actions {
  @apply flex flex-wrap gap-1.5 sm:gap-2;
}

.live-overlay-action {
  @apply rounded-xl border border-[#c8ddd8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f766e] shadow-sm transition-colors hover:border-[#97c2b8] hover:text-[#0b5e58];
}

.live-overlay-action-primary {
  @apply border-[#0f766e] bg-[#0f766e] text-white hover:border-[#0b5e58] hover:bg-[#0b5e58] hover:text-white;
}

.live-overlay-request-count {
  @apply m-0 text-xs leading-4 text-[#6b8a84];
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
  @apply block rounded-2xl overflow-hidden border border-[#ddd5c7] bg-white p-0 hover:border-[#bca98d];
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
  @apply rounded-[20px] border border-[#ddd3c2] bg-[#efe8dc] px-3 sm:px-3.5 py-2 sm:py-2.5 max-w-[min(560px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'] {
  @apply rounded-[22px] border border-[#ece5d8] bg-white px-3.5 py-2.5;
}

.message-card[data-role='system'] {
  @apply rounded-[18px] border border-[#e8dfcf] bg-[#f7f2e8] px-3.5 py-2.5;
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

.conversation-item-actionable:hover,
.conversation-item-actionable:focus-within {
  z-index: 8;
}

.conversation-item-actionable:hover .message-action-button,
.conversation-item-actionable:focus-within .message-action-button {
  @apply opacity-100;
}

.message-actions {
  @apply inline-flex items-center gap-1;
  position: absolute;
  left: 0.5rem;
  bottom: -0.72rem;
  z-index: 10;
  pointer-events: none;
}

.message-action-button {
  @apply opacity-0 inline-flex items-center gap-1 self-start rounded-full border border-[#ddd5c7] bg-[#fffdf8] px-2.5 py-1 text-xs text-[#7b7062] transition-[background-color,border-color,color,opacity] duration-150 hover:bg-[#f3ede2] hover:text-[#544a3d] hover:border-[#cdbfa9];
  pointer-events: auto;
}

.message-stack[data-role='user'] .message-actions {
  left: auto;
  right: 0.5rem;
}

.message-action-icon {
  @apply w-3.5 h-3.5;
}

.message-action-label {
  @apply leading-none;
}

.cmd-row {
  @apply w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-[14px] border border-[#ddd5c7] bg-[#f8f4ec] cursor-pointer transition-colors duration-150 text-left hover:bg-[#f1ebde];
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
  @apply text-[10px] text-[#8f8577] transition-transform duration-100 flex-shrink-0;
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

.cmd-duration {
  @apply text-[11px] text-[#7b7062] flex-shrink-0;
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
  transition: grid-template-rows 150ms ease-out;
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

@media (prefers-reduced-motion: reduce) {
  .conversation-loading-card::after,
  .message-action-button,
  .cmd-row,
  .cmd-chevron,
  .worked-chevron,
  .cmd-output-wrap {
    animation: none !important;
    transition: none !important;
  }
}

@keyframes conversationFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
