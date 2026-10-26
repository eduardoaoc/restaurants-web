<script setup lang="ts">
import { computed, ref, toRaw, useAttrs, useSlots } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AButtonContent from './AButtonContent.vue'
import { resolveButtonVariant, type ButtonSize, type ButtonVariant, type LegacyButtonVariant } from './button'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  variant?: ButtonVariant | LegacyButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Passing false reserves the same leading cell later used by the spinner. */
  loading?: boolean
  fullWidth?: boolean
  as?: 'button' | 'a' | 'RouterLink' | typeof RouterLink
  to?: RouteLocationRaw
  replace?: boolean
  /** Shared implementation detail used by AIconButton. */
  iconOnly?: boolean
}>(), { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: undefined, fullWidth: false, as: 'button', replace: false, iconOnly: false })
const emit = defineEmits<{ click: [MouseEvent] }>()
const attrs = useAttrs()
const slots = useSlots()
const element = ref<HTMLElement | null>(null)
const isDisabled = computed(() => props.disabled || props.loading === true)
const isRouterLink = computed(() => props.as === 'RouterLink' || toRaw(props.as) === RouterLink)
// useAttrs always reflects the latest render, but isn't a watchable source.
const controlAttrs = () => ({
  ...attrs,
  class: ['a-control', attrs.class],
  'data-variant': resolveButtonVariant(props.variant),
  'data-size': props.size,
  'data-disabled': props.disabled || undefined,
  'data-loading': props.loading || undefined,
  'data-icon-only': props.iconOnly || undefined,
  'data-full-width': props.fullWidth || undefined,
  'aria-disabled': isDisabled.value || undefined,
  'aria-busy': props.loading || undefined,
  tabindex: isDisabled.value && props.as !== 'button' ? -1 : attrs.tabindex === undefined ? undefined : Number(attrs.tabindex),
})

function onClick(event: MouseEvent, navigate?: (event: MouseEvent) => void): void {
  if (isDisabled.value) { event.preventDefault(); event.stopImmediatePropagation(); return }
  emit('click', event)
  if (!event.defaultPrevented) navigate?.(event)
}
function guardAuxClick(event: MouseEvent): void {
  if (isDisabled.value) { event.preventDefault(); event.stopImmediatePropagation() }
}
defineExpose({ focus: () => element.value?.focus() })
</script>

<template>
  <RouterLink v-if="isRouterLink" :to="to ?? ''" :replace="replace" custom v-slot="{ href, navigate }">
    <a ref="element" v-bind="controlAttrs()" :href="isDisabled ? undefined : href" role="link" @click="onClick($event, navigate)" @auxclick="guardAuxClick">
      <AButtonContent :loading="loading" :reserve-leading="loading !== undefined" :icon-only="iconOnly">
        <template v-if="slots.leading" #leading><slot name="leading" /></template>
        <slot />
        <template v-if="slots.trailing" #trailing><slot name="trailing" /></template>
      </AButtonContent>
    </a>
  </RouterLink>
  <component
    :is="as" v-else ref="element" v-bind="controlAttrs()"
    :type="as === 'button' ? type : undefined"
    :disabled="as === 'button' ? isDisabled : undefined"
    :href="as === 'a' && !isDisabled ? attrs.href : undefined"
    :role="as === 'a' ? 'link' : undefined"
    @click="onClick($event)" @auxclick="guardAuxClick"
  >
    <AButtonContent :loading="loading" :reserve-leading="loading !== undefined" :icon-only="iconOnly">
      <template v-if="slots.leading" #leading><slot name="leading" /></template>
      <slot />
      <template v-if="slots.trailing" #trailing><slot name="trailing" /></template>
    </AButtonContent>
  </component>
</template>
