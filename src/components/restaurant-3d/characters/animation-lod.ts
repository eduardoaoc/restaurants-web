import { Frustum, Matrix4, type PerspectiveCamera, Sphere, Vector3 } from 'three'

/**
 * Frustum + distance based animation throttling shared by the customer renderers.
 * Call `prepare(camera)` once per frame, then `skip(position, index)` per customer.
 * Skipping only defers skeleton evaluation (the controller banks the elapsed time), so
 * a skipped customer catches up exactly when it comes back into view.
 */
export class AnimationLod {
  /** Bounding radius of a seated/standing customer incl. arms, metres. */
  radius = 1.5
  /** Camera distance (m) beyond which the skeleton updates every 2nd / 3rd frame. */
  near = 12
  far = 24

  private readonly frustum = new Frustum()
  private readonly projection = new Matrix4()
  private readonly sphere = new Sphere()
  private readonly point = new Vector3()
  private camera: PerspectiveCamera | null = null
  private frame = 0

  prepare(camera: PerspectiveCamera | undefined | null) {
    this.frame++
    this.camera = camera ?? null
    if (!camera) return
    camera.updateMatrixWorld()
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projection)
  }

  skip(position: Vector3, index: number): boolean {
    if (!this.camera) return false
    this.point.copy(position)
    this.point.y += 0.9
    this.sphere.set(this.point, this.radius)
    if (!this.frustum.intersectsSphere(this.sphere)) return true
    const d = this.point.distanceTo(this.camera.position)
    const every = d > this.far ? 3 : d > this.near ? 2 : 1
    // Staggered by index so throttled customers never all evaluate on the same frame.
    return every > 1 && (this.frame + index) % every !== 0
  }
}
