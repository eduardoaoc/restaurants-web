import type { AnimationClip } from 'three'

/**
 * Pelvis alignment to a chair WITHOUT touching the animation assets on disk: at load time
 * (once, never per frame) the Body-position Y of the three seating clips is shifted by the
 * difference between the pelvis height the chair needs and the one the clips were solved for.
 * The shift is weighted by how "seated" each frame is, derived from the clip's own pelvis drop,
 * so the standing ends of Sit_Down / Stand_Up stay untouched and nothing pops.
 *
 * Limits (documented, not hidden): feet stay planted on the floor, so a raise or lower of a few
 * centimetres slightly stretches/compresses the lower leg at the ankle. It is a pelvis offset,
 * not leg IK, by design.
 */
const SEATING_CLIPS = ['Sit_Down', 'Sit_Idle', 'Stand_Up'] as const

export function alignSeatedPelvis(
  clips: AnimationClip[],
  seatedPelvisY: number,
  targetPelvisY: number,
): AnimationClip[] {
  const delta = targetPelvisY - seatedPelvisY
  // Always hand out CLONES of the seating clips: the cached originals are shared by every customer.
  if (Math.abs(delta) < 1e-4) return clips.map((c) => ((SEATING_CLIPS as readonly string[]).includes(c.name) ? c.clone() : c))
  const find = (name: string) => clips.find((c) => c.name === name)
  const bodyY = (clip: AnimationClip | undefined) => clip?.tracks.find((t) => t.name === 'Body.position')
  const standY = bodyY(find('Sit_Down'))?.values[1]
  const seatY = bodyY(find('Sit_Idle'))?.values[1]
  if (standY === undefined || seatY === undefined || standY - seatY < 1e-3) return clips

  return clips.map((clip) => {
    if (!(SEATING_CLIPS as readonly string[]).includes(clip.name)) return clip
    const copy = clip.clone()
    const track = bodyY(copy)
    if (!track) return clip
    const v = track.values
    for (let i = 1; i < v.length; i += 3) {
      const seated = Math.min(1, Math.max(0, (standY - v[i]) / (standY - seatY)))
      v[i] += delta * seated
    }
    return copy
  })
}
