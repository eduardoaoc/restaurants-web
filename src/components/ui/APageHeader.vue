<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft } from '@phosphor-icons/vue'
import AButton from './AButton.vue'

export interface PageBreadcrumb { label: string; to?: RouteLocationRaw }
const props = withDefaults(defineProps<{
  title: string
  description?: string
  breadcrumbs?: PageBreadcrumb[]
  back?: boolean | RouteLocationRaw
  backLabel?: string
  context?: string
}>(), { breadcrumbs: () => [], back: false })
defineEmits<{ back: [] }>()
const { t } = useI18n()
const effectiveBack = computed(() => props.back || props.breadcrumbs.slice(0, -1).reverse().find(crumb => crumb.to)?.to)
</script>

<template>
  <header class="a-page-header">
    <nav v-if="breadcrumbs.length || $slots.breadcrumbs" :aria-label="title" class="a-page-breadcrumbs text-body-md text-fg-muted">
      <slot name="breadcrumbs">
        <ol class="flex flex-wrap items-center gap-2">
          <li v-for="(crumb, index) in breadcrumbs" :key="index">
            <RouterLink v-if="crumb.to && index < breadcrumbs.length - 1" :to="crumb.to" aria-current-value="false" class="inline-flex min-h-11 items-center text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{{ crumb.label }}</RouterLink>
            <span v-else :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined">{{ crumb.label }}</span>
          </li>
        </ol>
      </slot>
    </nav>
    <div class="a-page-header-row">
      <slot name="back">
        <AButton v-if="effectiveBack" :as="effectiveBack === true ? 'button' : 'RouterLink'" :to="effectiveBack === true ? undefined : effectiveBack" :class="!back ? 'md:hidden' : ''" variant="ghost" @click="$emit('back')">
          <template #leading><PhArrowLeft /></template>{{ backLabel ?? t('common.back') }}
        </AButton>
      </slot>
      <div class="a-page-heading">
        <h1 class="text-2xl font-semibold text-fg md:text-headline">{{ title }}</h1>
        <p v-if="description || $slots.description" class="mt-1 max-w-prose text-body-lg text-fg-muted"><slot name="description">{{ description }}</slot></p>
      </div>
      <div v-if="context || $slots.context" class="a-page-context text-body-md text-fg-muted"><slot name="context">{{ context }}</slot></div>
      <div v-if="$slots.actions" class="a-page-actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<style scoped>
.a-page-header { margin-bottom: calc(var(--spacing) * 6); }
.a-page-header-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: calc(var(--spacing) * 3); }
.a-page-heading { flex: 1 1 60%; min-width: 0; overflow-wrap: anywhere; }
.a-page-context { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.a-page-breadcrumbs { display: none; }
.a-page-breadcrumbs li { min-width: 0; overflow-wrap: anywhere; }
.a-page-actions { display: flex; flex-wrap: wrap; gap: calc(var(--spacing) * 2); width: 100%; min-width: 0; }
.a-page-actions > :deep(*) { max-width: 100%; }
.a-page-actions > :deep(:not(.a-control)) { min-width: 0; }
.a-page-actions :deep([data-variant='primary']) { width: 100%; order: 1; }
@media (min-width: 768px) {
  .a-page-header { margin-bottom: calc(var(--spacing) * 8); }
  .a-page-breadcrumbs { display: block; }
  .a-page-heading { flex-basis: 0; }
  .a-page-actions { width: auto; flex: 0 1 auto; max-width: 100%; }
  .a-page-actions :deep([data-variant='primary']) { width: auto; order: initial; }
}
</style>
