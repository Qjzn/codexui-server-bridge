<template>
  <div class="desktop-layout" :class="{ 'is-mobile': isMobile }" :style="layoutStyle">
    <Teleport v-if="isMobile" to="body">
      <Transition name="drawer">
        <div v-if="!isSidebarCollapsed" class="mobile-drawer-backdrop" @click="$emit('close-sidebar')">
          <aside class="mobile-drawer" @click.stop>
            <slot name="sidebar" />
          </aside>
        </div>
      </Transition>
    </Teleport>

    <template v-if="!isMobile">
      <aside v-if="!isSidebarCollapsed" class="desktop-sidebar">
        <slot name="sidebar" />
      </aside>
      <button
        v-if="!isSidebarCollapsed"
        class="desktop-resize-handle"
        type="button"
        aria-label="Resize sidebar"
        @mousedown="onResizeHandleMouseDown"
      />
    </template>

    <section class="desktop-main">
      <slot name="content" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMobile } from '../../composables/useMobile'

const props = withDefaults(
  defineProps<{
    isSidebarCollapsed?: boolean
  }>(),
  {
    isSidebarCollapsed: false,
  },
)

defineEmits<{
  'close-sidebar': []
}>()

const { isMobile } = useMobile()

const SIDEBAR_WIDTH_KEY = 'codex-web-local.sidebar-width.v1'
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 620
const DEFAULT_SIDEBAR_WIDTH = 320
const DEFAULT_LAYOUT_HEIGHT = '100dvh'

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value))
}

function loadSidebarWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH
  return clampSidebarWidth(parsed)
}

const sidebarWidth = ref(loadSidebarWidth())
const layoutHeight = ref(DEFAULT_LAYOUT_HEIGHT)

function readLayoutHeight(): string {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT_HEIGHT
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  return `${Math.max(Math.round(viewportHeight), 0)}px`
}

let layoutHeightFrame = 0

function syncLayoutHeight(): void {
  layoutHeight.value = readLayoutHeight()
}

function scheduleLayoutHeightSync(): void {
  if (layoutHeightFrame) return
  layoutHeightFrame = window.requestAnimationFrame(() => {
    layoutHeightFrame = 0
    syncLayoutHeight()
  })
}

const layoutStyle = computed(() => {
  const baseStyle = {
    '--layout-height': layoutHeight.value,
  }
  if (isMobile.value || props.isSidebarCollapsed) {
    return {
      ...baseStyle,
      '--sidebar-width': '0px',
      '--layout-columns': 'minmax(0, 1fr)',
    }
  }
  return {
    ...baseStyle,
    '--sidebar-width': `${sidebarWidth.value}px`,
    '--layout-columns': 'var(--sidebar-width) 1px minmax(0, 1fr)',
  }
})

function saveSidebarWidth(value: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(value))
}

function onResizeHandleMouseDown(event: MouseEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientX - startX
    sidebarWidth.value = clampSidebarWidth(startWidth + delta)
  }

  const onMouseUp = () => {
    saveSidebarWidth(sidebarWidth.value)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onMounted(() => {
  syncLayoutHeight()
  window.addEventListener('resize', scheduleLayoutHeightSync)
  window.visualViewport?.addEventListener('resize', scheduleLayoutHeightSync)
  window.visualViewport?.addEventListener('scroll', scheduleLayoutHeightSync)
})

onUnmounted(() => {
  if (layoutHeightFrame) {
    cancelAnimationFrame(layoutHeightFrame)
    layoutHeightFrame = 0
  }
  window.removeEventListener('resize', scheduleLayoutHeightSync)
  window.visualViewport?.removeEventListener('resize', scheduleLayoutHeightSync)
  window.visualViewport?.removeEventListener('scroll', scheduleLayoutHeightSync)
})
</script>

<style scoped>
@reference "tailwindcss";

.desktop-layout {
  @apply grid bg-slate-100 text-slate-900 overflow-hidden;
  height: 100vh;
  height: 100dvh;
  height: var(--layout-height, 100dvh);
  max-height: var(--layout-height, 100dvh);
  grid-template-columns: var(--layout-columns);
}

.desktop-sidebar {
  @apply bg-slate-100 min-h-0 overflow-hidden;
}

.desktop-resize-handle {
  @apply relative w-px cursor-col-resize bg-slate-300 hover:bg-slate-400 transition;
}

.desktop-resize-handle::before {
  content: '';
  @apply absolute -left-2 -right-2 top-0 bottom-0;
}

.desktop-main {
  @apply bg-white min-h-0 overflow-y-hidden overflow-x-visible;
}

.mobile-drawer-backdrop {
  @apply fixed inset-0 z-40 bg-black/40;
}

.mobile-drawer {
  @apply absolute top-0 left-0 bottom-0 w-[85vw] max-w-80 bg-slate-100 overflow-hidden shadow-2xl;
}

.drawer-enter-active,
.drawer-leave-active {
  @apply transition-opacity duration-200;
}

.drawer-enter-active .mobile-drawer,
.drawer-leave-active .mobile-drawer {
  transition: transform 200ms ease;
}

.drawer-enter-from {
  @apply opacity-0;
}

.drawer-enter-from .mobile-drawer {
  transform: translateX(-100%);
}

.drawer-leave-to {
  @apply opacity-0;
}

.drawer-leave-to .mobile-drawer {
  transform: translateX(-100%);
}
</style>
