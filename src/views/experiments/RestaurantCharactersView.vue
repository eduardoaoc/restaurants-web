<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import CharacterViewport from '@/components/restaurant-3d/characters/CharacterViewport.vue'
import type { CharacterInfo, RenderStats } from '@/components/restaurant-3d/characters/CharacterModel.vue'
import { CHARACTER_CATALOG, type CharacterGender } from '@/components/restaurant-3d/characters/character-catalog'
import CustomerViewport from '@/components/restaurant-3d/characters/CustomerViewport.vue'
import type { SceneStats } from '@/components/restaurant-3d/characters/CustomerScene.vue'
import { STANDARD_CHAIR, type ChairSpec } from '@/components/restaurant-3d/characters/test-chair'
import { disposeCharacterCache } from '@/components/restaurant-3d/characters/character-loader'

// Development-only laboratory (route is registered only in dev builds):
// copy is English on purpose, it is not a product surface.
// Phase 3.1A clip viewer vs Phase 3.1B customer sequence; only one canvas is mounted at a time.
const mode = ref<'clips' | 'sequence'>('clips')
const gender = ref<CharacterGender>('men')
const variantId = ref(CHARACTER_CATALOG.men.variants[0].id)
const animation = ref<string | null>('Idle')
const playing = ref(true)
const speed = ref(1)
const hiddenParts = ref<string[]>([])

const loading = ref(true)
const error = ref<string | null>(null)
const info = shallowRef<CharacterInfo | null>(null)
const stats = shallowRef<RenderStats | null>(null)
const attempt = ref(0)

const variants = computed(() => CHARACTER_CATALOG[gender.value].variants)
const variant = computed(() => variants.value.find((v) => v.id === variantId.value) ?? variants.value[0])
// `attempt` is appended only to force a reload after an error.
const modelUrl = computed(() => variant.value.url + (attempt.value ? `?retry=${attempt.value}` : ''))

watch(gender, (value) => {
  variantId.value = CHARACTER_CATALOG[value].variants[0].id
  hiddenParts.value = []
})

function onLoaded(value: CharacterInfo) {
  info.value = value
  error.value = null
  // Keep the chosen clip if the new file has it, otherwise fall back to a real clip.
  if (!value.clips.includes(animation.value ?? '')) {
    animation.value = value.clips.includes('Idle') ? 'Idle' : (value.clips[0] ?? null)
  }
}
const onError = (message: string) => { error.value = message }

function togglePart(part: string) {
  hiddenParts.value = hiddenParts.value.includes(part)
    ? hiddenParts.value.filter((p) => p !== part)
    : [...hiddenParts.value, part]
}

// Phase 3.1B: customer sequence
const seqGender = ref<CharacterGender | 'mixed'>('men')
const seqCount = ref(1)
const seqLoop = ref(false)
const seqRun = ref(0)
const seqView = ref<'default' | 'side' | 'top'>('default')
const seqOptimized = ref(true)
const chairSpec = ref<ChairSpec>({ ...STANDARD_CHAIR })
const seqStats = shallowRef<SceneStats | null>(null)
const seqPhase = ref('')
const seqLoading = ref(true)
const seqError = ref<string | null>(null)
const COUNTS = [1, 5, 10, 20]
const seqUrl = computed(() => {
  const list = CHARACTER_CATALOG[seqGender.value === 'women' ? 'women' : 'men'].variants
  return list[0].url
})

onBeforeUnmount(disposeCharacterCache)
</script>

<template>
  <main class="chars-lab">
    <header class="chars-header">
      <div>
        <span class="eyebrow">Ritma OS · Phase 3.1A</span>
        <h1>3D Character Laboratory</h1>
      </div>
      <div
        class="seg"
        role="group"
        aria-label="Laboratory mode"
      >
        <button
          type="button"
          class="btn"
          :aria-pressed="mode === 'clips'"
          @click="mode = 'clips'"
        >
          Clip viewer
        </button>
        <button
          type="button"
          class="btn"
          :aria-pressed="mode === 'sequence'"
          @click="mode = 'sequence'"
        >
          Customer sequence
        </button>
      </div>
      <span class="chip">Experimental</span>
    </header>

    <div
      v-if="mode === 'sequence'"
      class="chars-layout"
    >
      <section
        class="viewport"
        aria-label="Customer sequence viewer"
      >
        <CustomerViewport
          :count="seqCount"
          :gender="seqGender"
          :variant-url="seqUrl"
          :loop="seqLoop"
          :run-id="seqRun"
          :view="seqView"
          :chair="chairSpec"
          :optimized="seqOptimized"
          @loading="seqLoading = $event"
          @error="seqError = $event"
          @stats="seqStats = $event"
          @phase="seqPhase = $event"
        />
        <p
          v-if="seqLoading && !seqError"
          class="overlay"
          role="status"
        >
          Loading characters…
        </p>
        <div
          v-if="seqError"
          class="overlay"
          role="alert"
        >
          <p>Could not load the customer sequence.</p>
          <button
            type="button"
            class="btn"
            @click="seqError = null; seqRun++"
          >
            Retry
          </button>
        </div>
      </section>

      <aside class="panel">
        <button
          type="button"
          class="btn btn--primary"
          aria-pressed="true"
          data-action="play-sequence"
          @click="seqRun++"
        >
          Play customer sequence
        </button>
        <p
          class="hint"
          data-stat="phase"
        >
          Idle → Walk → Sit Down → Seated Idle → Stand Up → Walk Away.
          Current (first customer): <strong>{{ seqPhase || '—' }}</strong>
        </p>

        <fieldset>
          <legend>Character</legend>
          <div class="seg">
            <button
              v-for="g in (['men', 'women', 'mixed'] as const)"
              :key="g"
              type="button"
              class="btn"
              :aria-pressed="seqGender === g"
              @click="seqGender = g"
            >
              {{ g === 'men' ? 'Male' : g === 'women' ? 'Female' : 'Mixed (6 variants)' }}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Customers</legend>
          <div class="seg">
            <button
              v-for="n in COUNTS"
              :key="n"
              type="button"
              class="btn"
              :aria-pressed="seqCount === n"
              :data-count="n"
              @click="seqCount = n"
            >
              {{ n }}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Camera</legend>
          <div class="seg">
            <button
              v-for="v in (['default', 'side', 'top'] as const)"
              :key="v"
              type="button"
              class="btn"
              :aria-pressed="seqView === v"
              @click="seqView = v"
            >
              {{ v === 'default' ? 'Overview' : v === 'side' ? 'Side (chair)' : 'Top' }}
            </button>
            <button
              type="button"
              class="btn"
              :aria-pressed="seqLoop"
              @click="seqLoop = !seqLoop"
            >
              Loop
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Rendering path</legend>
          <div class="seg">
            <button
              type="button"
              class="btn"
              data-render="baseline"
              :aria-pressed="!seqOptimized"
              @click="seqOptimized = false"
            >
              Baseline (3.1B)
            </button>
            <button
              type="button"
              class="btn"
              data-render="optimized"
              :aria-pressed="seqOptimized"
              @click="seqOptimized = true"
            >
              Optimized (3.1C)
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Chair (same chair for every customer)</legend>
          <label class="speed">
            Seat height {{ chairSpec.seatHeight.toFixed(2) }} m
            <input v-model.number="chairSpec.seatHeight" type="range" min="0.38" max="0.52" step="0.01">
          </label>
          <label class="speed">
            Seat depth {{ chairSpec.seatDepth.toFixed(2) }} m
            <input v-model.number="chairSpec.seatDepth" type="range" min="0.36" max="0.56" step="0.01">
          </label>
          <label class="speed">
            Backrest offset {{ chairSpec.backrestOffset.toFixed(2) }} m
            <input v-model.number="chairSpec.backrestOffset" type="range" min="-0.08" max="0.1" step="0.01">
          </label>
          <label class="speed">
            Orientation {{ chairSpec.orientationDeg }}°
            <input v-model.number="chairSpec.orientationDeg" type="range" min="-90" max="90" step="15">
          </label>
        </fieldset>

        <dl
          v-if="seqStats"
          class="stats"
          aria-label="Performance statistics"
        >
          <div><dt>FPS</dt><dd data-stat="fps">{{ seqStats.fps }}</dd></div>
          <div><dt>Triangles</dt><dd data-stat="triangles">{{ seqStats.triangles.toLocaleString('en') }}</dd></div>
          <div><dt>Draw calls</dt><dd data-stat="calls">{{ seqStats.drawCalls }}</dd></div>
          <div><dt>Geometries</dt><dd data-stat="geometries">{{ seqStats.geometries }}</dd></div>
          <div><dt>Textures</dt><dd data-stat="textures">{{ seqStats.textures }}</dd></div>
          <div><dt>Actors</dt><dd data-stat="actors">{{ seqStats.actors }}</dd></div>
          <div><dt>Frame CPU</dt><dd data-stat="frameMs">{{ seqStats.frameMs === null ? 'n/a' : seqStats.frameMs + ' ms' }}</dd></div>
          <div><dt>Mixers/frame</dt><dd data-stat="mixers">{{ seqStats.mixers }}</dd></div>
          <div><dt>Anim CPU</dt><dd data-stat="updateMs">{{ seqStats.updateMs === null ? 'n/a' : seqStats.updateMs + ' ms' }}</dd></div>
          <div><dt>JS heap</dt><dd data-stat="heap">{{ seqStats.heapMb === null ? 'n/a' : seqStats.heapMb + ' MB' }}</dd></div>
        </dl>
        <p class="hint">
          Renderer: <span data-stat="gpu">{{ seqStats?.gpu ?? '…' }}</span>. A SwiftShader/software renderer
          means FPS is CPU-rasterised and not representative of a real (mobile) GPU.
        </p>
      </aside>
    </div>

    <div
      v-else
      class="chars-layout"
    >
      <section
        class="viewport"
        aria-label="Character viewer"
      >
        <CharacterViewport
          :url="modelUrl"
          :animation="animation"
          :playing="playing"
          :speed="speed"
          :hidden-parts="hiddenParts"
          @loaded="onLoaded"
          @error="onError"
          @loading="loading = $event"
          @stats="stats = $event"
        />
        <p
          v-if="loading && !error"
          class="overlay"
          role="status"
        >
          Loading model…
        </p>
        <div
          v-if="error"
          class="overlay"
          role="alert"
        >
          <p>Could not load this character.</p>
          <button
            type="button"
            class="btn"
            @click="attempt++"
          >
            Retry
          </button>
        </div>
      </section>

      <aside class="panel">
        <fieldset>
          <legend>Character</legend>
          <div class="seg">
            <button
              v-for="(entry, key) in CHARACTER_CATALOG"
              :key="key"
              type="button"
              class="btn"
              :aria-pressed="gender === key"
              @click="gender = key"
            >
              {{ entry.label }}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Variant</legend>
          <div class="seg">
            <button
              v-for="v in variants"
              :key="v.id"
              type="button"
              class="btn"
              :aria-pressed="variantId === v.id"
              @click="variantId = v.id"
            >
              {{ v.label }}
            </button>
          </div>
        </fieldset>

        <fieldset v-if="info">
          <legend>Clothing parts</legend>
          <div class="seg">
            <button
              v-for="part in info.parts"
              :key="part"
              type="button"
              class="btn"
              :aria-pressed="!hiddenParts.includes(part)"
              @click="togglePart(part)"
            >
              {{ part }}
            </button>
          </div>
        </fieldset>

        <fieldset v-if="info">
          <legend>Animation ({{ info.clips.length }} clips)</legend>
          <div class="clips">
            <button
              v-for="clip in info.clips"
              :key="clip"
              type="button"
              class="btn"
              :aria-pressed="animation === clip"
              @click="animation = clip"
            >
              {{ clip }}
            </button>
          </div>
          <div class="row">
            <button
              type="button"
              class="btn btn--primary"
              :aria-pressed="playing"
              @click="playing = !playing"
            >
              {{ playing ? 'Pause' : 'Play' }}
            </button>
            <label class="speed">
              Speed {{ speed.toFixed(1) }}×
              <input
                v-model.number="speed"
                type="range"
                min="0.25"
                max="2"
                step="0.25"
              >
            </label>
          </div>
        </fieldset>

        <dl
          v-if="stats"
          class="stats"
          aria-label="Performance statistics"
        >
          <div><dt>FPS</dt><dd data-stat="fps">{{ stats.fps }}</dd></div>
          <div><dt>Triangles</dt><dd data-stat="triangles">{{ stats.triangles.toLocaleString('en') }}</dd></div>
          <div><dt>Draw calls</dt><dd data-stat="calls">{{ stats.drawCalls }}</dd></div>
          <div><dt>Geometries</dt><dd>{{ stats.geometries }}</dd></div>
          <div><dt>Textures</dt><dd>{{ stats.textures }}</dd></div>
        </dl>
        <p class="hint">
          Drag to orbit, scroll or pinch to zoom. FPS is 0 while paused (rendering stops).
        </p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.chars-lab { min-height: 100vh; padding: 16px; background: #0f0f10; color: #fff; }
.chars-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin-bottom: 16px; }
.chars-header .seg { order: 3; flex-basis: 100%; }
@media (min-width: 900px) { .chars-header .seg { order: 0; flex-basis: auto; } }
.eyebrow { display: block; margin-bottom: 4px; font-size: 13px; opacity: 0.55; }
h1 { margin: 0; font-size: 22px; font-weight: 600; }
.chip { flex-shrink: 0; white-space: nowrap; padding: 6px 10px; border: 1px solid #343434; border-radius: 999px; font-size: 12px; opacity: 0.7; }
.chars-layout { display: grid; gap: 16px; grid-template-columns: 1fr; }
.viewport { position: relative; height: min(62vh, 560px); overflow: hidden; border: 1px solid #343434; border-radius: 16px; }
.overlay { position: absolute; inset: 0; display: grid; place-content: center; gap: 12px; margin: 0; text-align: center; background: rgb(15 15 16 / 0.6); }
.panel { display: grid; gap: 16px; align-content: start; }
fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; }
legend { padding: 0; margin-bottom: 8px; font-size: 13px; opacity: 0.65; }
.seg, .clips, .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.btn { min-height: 44px; padding: 0 16px; border: 1px solid #343434; border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.btn[aria-pressed='true'] { background: rgb(242 234 227 / 0.14); border-color: #f2eae3; font-weight: 600; }
.btn--primary[aria-pressed='true'] { background: #f2eae3; color: #151515; }
.btn:focus-visible, input:focus-visible { outline: 2px solid #f2eae3; outline-offset: 2px; }
.speed { display: grid; gap: 4px; font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin: 0; }
.stats div { padding: 8px 12px; border: 1px solid #343434; border-radius: 12px; }
.stats dt { font-size: 12px; opacity: 0.6; }
.stats dd { margin: 0; font-size: 16px; font-variant-numeric: tabular-nums; }
.hint { margin: 0; font-size: 12px; opacity: 0.55; }
@media (min-width: 900px) {
  .chars-layout { grid-template-columns: minmax(0, 1fr) 360px; }
  .viewport { height: min(78vh, 720px); }
}
</style>
