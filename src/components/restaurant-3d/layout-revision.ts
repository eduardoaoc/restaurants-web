/**
 * What to do when the server's 3D layout revision is looked at (after a `floor_plan.updated` event, or after a save
 * that was in flight). Pure so the decision is testable without a browser.
 *
 * - `ignore`:   the server is still at the revision this client confirmed. Own save echo, or an unrelated 2D floor
 *               plan event: nothing changed in the 3D layout.
 * - `defer`:    our own save is in flight; look again when it settles (never assume the event was its echo).
 * - `reload`:   someone else changed it and there is no local draft: safe to show the new layout.
 * - `conflict`: someone else changed it and the draft has unsaved edits: keep the draft, ask the user.
 */
export type LayoutReconcileAction = 'ignore' | 'defer' | 'reload' | 'conflict'

export function decideLayoutReconcile(input: {
  remoteRevision: number
  confirmedRevision: number
  dirty: boolean
  saving: boolean
}): LayoutReconcileAction {
  if (input.saving) return 'defer'
  if (input.remoteRevision === input.confirmedRevision) return 'ignore'
  return input.dirty ? 'conflict' : 'reload'
}
