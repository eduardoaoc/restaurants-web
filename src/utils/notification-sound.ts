let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

/**
 * Unlocks the shared AudioContext on the user's first interaction with the
 * app (Carta 7.1B §20) — browsers create a new AudioContext in a
 * `suspended` state and refuse to let it make sound without a prior user
 * gesture. Call this once, globally (AppShellLayout), on the first
 * pointerdown/keydown — long before any real `order.ready.attention` event
 * can arrive. If this never runs (e.g. a kiosk with no interaction before
 * the first ready event), `playNotificationChime` below just silently does
 * nothing — the visual notification is never gated on this succeeding.
 */
export function unlockNotificationSound(): void {
  try {
    void getAudioContext()?.resume()
  } catch {
    // Audio unavailable in this environment (e.g. no AudioContext support).
    // The visual notification is never blocked by this.
  }
}

/**
 * A short two-tone chime, synthesized with the Web Audio API — no audio
 * asset to ship (Carta 7.1B §20: "não incluir arquivo pesado"). Callers are
 * responsible for firing this at most once per event; this function itself
 * never loops. Any failure (no AudioContext, still suspended, autoplay
 * blocked) is swallowed — the caller's visual notification must never
 * depend on sound succeeding.
 */
export function playNotificationChime(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
    gain.connect(ctx.destination)

    const oscillator = ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    oscillator.frequency.setValueAtTime(1175, now + 0.16)
    oscillator.connect(gain)
    oscillator.start(now)
    oscillator.stop(now + 0.4)
  } catch {
    // See docblock above — never throw out of here.
  }
}
