<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'

/**
 * The optional, neutral "also review us on Google" invitation shown after
 * the AFORO feedback is submitted (Carta 5.3C). `url` is always the
 * backend-validated `visit.google_review.url` as-is — never re-validated
 * or re-hosted here (§8 "não duplicar allowlist"), and never prefilled
 * with the customer's own AFORO comment/rating (§9): Google must receive
 * content the customer writes freely, so this component only ever offers
 * a real link, nothing else.
 *
 * Deliberately a secondary-looking action (§16) — a bordered surface, not
 * a filled/full-width button, and never shown before the caller has
 * already confirmed `feedbackAlreadySubmitted` + `google_review.available`
 * (see PublicPostVisitView, the only caller) — this component itself does
 * no gating and holds no rating-based logic, so it can never "choose" to
 * only appear for happy customers.
 */
defineProps<{ url: string }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4">
    <p class="text-title-md font-medium text-on-surface">{{ t('publicMenu.postVisit.googleReview.title') }}</p>
    <p class="text-body-md text-on-surface-variant">{{ t('publicMenu.postVisit.googleReview.description') }}</p>
    <a
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t('publicMenu.postVisit.googleReview.cta') }}
      <PhArrowSquareOut :size="16" aria-hidden="true" />
    </a>
  </div>
</template>
