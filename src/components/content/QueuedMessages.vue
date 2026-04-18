<template>
  <div v-if="messages.length > 0" class="queued-messages">
    <div class="queued-messages-inner">
      <div class="queued-messages-header">
        <p class="queued-messages-title">消息队列</p>
        <span class="queued-messages-count">{{ messages.length }}</span>
      </div>
      <p class="queued-messages-caption">
        {{ isProcessing ? '正在提交队列中的下一条消息' : '当前任务结束后按顺序执行。点正文可继续编辑。' }}
      </p>

      <div v-for="(msg, index) in messages" :key="msg.id" class="queued-row">
        <button class="queued-row-main" type="button" title="编辑这条排队消息" @click="$emit('edit', msg.id)">
          <span class="queued-row-order" :class="{ 'is-next': index === 0 }">
            {{ index === 0 ? '下一条' : String(index + 1).padStart(2, '0') }}
          </span>
          <span class="queued-row-copy">
            <span class="queued-row-text">{{ getMessagePreview(msg) }}</span>
            <span v-if="getMessageMeta(msg)" class="queued-row-meta">{{ getMessageMeta(msg) }}</span>
          </span>
        </button>

        <div class="queued-row-actions">
          <button class="queued-row-quote" type="button" title="立即引用并执行这条队列消息" @click.stop="$emit('quote', msg.id)">
            引用
          </button>
          <button class="queued-row-delete" type="button" aria-label="删除排队消息" title="删除排队消息" @click.stop="$emit('delete', msg.id)">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type QueuedMessageRow = {
  id: string
  text: string
  imageUrls?: string[]
  skills?: Array<{ name: string; path: string }>
  fileAttachments?: Array<{ label: string; path: string; fsPath: string }>
}

defineProps<{
  messages: QueuedMessageRow[]
  isProcessing?: boolean
}>()

defineEmits<{
  edit: [messageId: string]
  quote: [messageId: string]
  delete: [messageId: string]
}>()

function getMessagePreview(message: QueuedMessageRow): string {
  const text = message.text.trim()
  if (text) return text

  const parts: string[] = []
  const imageCount = message.imageUrls?.length ?? 0
  const fileCount = message.fileAttachments?.length ?? 0
  const skillCount = message.skills?.length ?? 0

  if (imageCount > 0) parts.push(`${imageCount} 张图片`)
  if (fileCount > 0) parts.push(`${fileCount} 个文件`)
  if (skillCount > 0) parts.push(`${skillCount} 个技能`)

  return parts.join('，') || '（空排队消息）'
}

function getMessageMeta(message: QueuedMessageRow): string {
  const parts: string[] = []
  const imageCount = message.imageUrls?.length ?? 0
  const fileCount = message.fileAttachments?.length ?? 0
  const skillCount = message.skills?.length ?? 0

  if (imageCount > 0) parts.push(`${imageCount} 张图`)
  if (fileCount > 0) parts.push(`${fileCount} 个文件`)
  if (skillCount > 0) parts.push(`${skillCount} 个技能`)

  return parts.join(' · ')
}
</script>

<style scoped>
@reference "tailwindcss";

.queued-messages {
  @apply w-full max-w-175 mx-auto px-2 sm:px-6;
}

.queued-messages-inner {
  @apply flex max-h-[34dvh] flex-col gap-1 overflow-y-auto rounded-[22px] border border-[#ddd5c7] bg-[#fffdf8] px-3 py-2.5;
}

.queued-messages-header {
  @apply flex items-center justify-between gap-2;
}

.queued-messages-title {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f8577];
}

.queued-messages-count {
  @apply inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f1ebde] px-1.5 text-[11px] font-semibold text-[#5b5146];
}

.queued-messages-caption {
  @apply m-0 text-xs leading-4 text-[#8a7f72];
}

.queued-row {
  @apply flex min-w-0 items-start gap-2 rounded-2xl border border-[#ece5d8] bg-white/96 px-2.5 py-2;
}

.queued-row-main {
  @apply flex min-w-0 flex-1 items-start gap-2 rounded-xl border-0 bg-transparent p-0 text-left;
}

.queued-row-order {
  @apply inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-[#f1ebde] px-2 text-[11px] font-semibold text-[#6d6354];
}

.queued-row-order.is-next {
  @apply bg-[#edf9f6] text-[#0f766e];
}

.queued-row-copy {
  @apply min-w-0 flex flex-1 flex-col gap-0.5;
}

.queued-row-text {
  @apply min-w-0 text-sm leading-5 text-[#2b241d];
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.queued-row-meta {
  @apply text-[11px] leading-4 text-[#8a7f72];
}

.queued-row-actions {
  @apply flex shrink-0 items-center gap-1 self-center;
}

.queued-row-quote {
  @apply rounded-full border border-[#c8ddd8] bg-[#f6fbfa] px-2.5 py-1 text-xs font-medium text-[#0f766e] transition hover:border-[#97c2b8] hover:bg-[#edf9f6];
}

.queued-row-delete {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent text-[#9a907f] transition hover:bg-[#f1ebde] hover:text-[#544a3d];
}

@media (max-width: 767px) {
  .queued-messages {
    @apply px-2.5;
  }

  .queued-messages-inner {
    @apply px-2.5 py-2;
  }

  .queued-row {
    @apply px-2 py-2;
  }

  .queued-row-quote {
    @apply px-2 py-0.5;
  }
}
</style>
