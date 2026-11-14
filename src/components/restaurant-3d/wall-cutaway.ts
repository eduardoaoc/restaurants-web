/**
 * Cutaway for the room's outer walls. A wall whose outward side faces the camera stands between the viewer and the
 * floor; it is lowered to a knee wall (doors vanish) so it cannot cover tables, guests or their indicators. Walls on the
 * far side keep full height and frame the room.
 */
export const WALL_CUTAWAY_SCALE = 0.28

export interface CutawayWall {
  object: { scale: { y: number }; visible: boolean }
  kind: 'wall' | 'door'
  /** Horizontal (x, z) unit normal pointing away from the room. */
  outward: [number, number]
  /** A corner post belongs to two walls: it is lowered as soon as either one is (second outward normal). */
  outward2?: [number, number]
  x: number
  z: number
  currentScale: number
  targetScale: number
}

/** Target Y scale for a wall seen from a camera at (cameraX, cameraZ). */
export function cutawayTarget(wall: Pick<CutawayWall, 'outward' | 'outward2' | 'x' | 'z' | 'kind'>, cameraX: number, cameraZ: number): number {
  const faces = (n: [number, number]) => n[0] * (cameraX - wall.x) + n[1] * (cameraZ - wall.z) > 0
  const facing = faces(wall.outward) || (wall.outward2 ? faces(wall.outward2) : false)
  return facing ? WALL_CUTAWAY_SCALE : 1
}

/** Frame-rate independent ease towards the target (about 150 ms to settle). */
export function easeCutaway(current: number, target: number, deltaSeconds: number): number {
  const k = 1 - Math.exp(-Math.max(0, deltaSeconds) * 18)
  const next = current + (target - current) * k
  return Math.abs(next - target) < 0.004 ? target : next
}
