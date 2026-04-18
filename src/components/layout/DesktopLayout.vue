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
import { computed, ref } from 'vue'
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
const layoutStyle = computed(() => {
  if (isMobile.value || props.isSidebarCollapsed) {
    return {
      '--sidebar-width': '0px',
      '--layout-columns': 'minmax(0, 1fr)',
    }
  }
  return {
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
</script>

<style scoped>
@reference "tailwindcss";

.desktop-layout {
  @apply grid text-slate-900 overflow-hidden;
  height: 100vh;
  height: 100dvh;
  grid-template-columns: var(--layout-columns);
  background:
    radial-gradient(circle at top left, rgba(13, 148, 136, 0.035), transparent 18%),
    linear-gradient(180deg, #faf7f0 0%, #f5f0e6 100%);
}

.desktop-sidebar {
  @apply min-h-0 overflow-hidden border-r border-[#e4dac9] bg-[#faf7f0];
}

.desktop-resize-handle {
  @apply relative w-px cursor-col-resize bg-[#d6cfc0] hover:bg-[#b9af98] transition;
}

.desktop-resize-handle::before {
  content: '';
  @apply absolute -left-2 -right-2 top-0 bottom-0;
}

.desktop-main {
  @apply relative min-h-0 overflow-y-hidden overflow-x-visible;
  background: linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(250,247,240,0.96) 100%);
}

.mobile-drawer-backdrop {
  @apply fixed inset-0 z-[60] bg-[#1f2937]/28;
  overflow: hidden;
}

.mobile-drawer {
  @apply absolute top-0 left-0 bottom-0 w-full max-w-none overflow-hidden border-r border-[#e4dac9];
  width: 100vw;
  max-width: 100vw;
  border-top-right-radius: 1.5rem;
  border-bottom-right-radius: 1.5rem;
  padding-left: max(0px, env(safe-area-inset-left));
  isolation: isolate;
  background: linear-gradient(180deg, rgba(251,247,239,0.995) 0%, rgba(246,241,232,0.995) 100%);
  box-shadow: 0 16px 36px -32px rgba(31, 41, 55, 0.28);
}

@media (min-width: 768px) {
  .mobile-drawer {
    width: min(26rem, calc(100vw - 1rem));
    max-width: min(26rem, calc(100vw - 1rem));
  }
}

@media (max-width: 767px) {
  .mobile-drawer {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.drawer-enter-active,
.drawer-leave-active {
  @apply transition-opacity duration-150;
}

.drawer-enter-active .mobile-drawer,
.drawer-leave-active .mobile-drawer {
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 140ms ease;
}

.drawer-enter-from {
  @apply opacity-0;
}

.drawer-enter-from .mobile-drawer {
  transform: translateX(-100%);
  opacity: 0.86;
}

.drawer-leave-to {
  @apply opacity-0;
}

.drawer-leave-to .mobile-drawer {
  transform: translateX(-100%);
  opacity: 0.9;
}
</style>
