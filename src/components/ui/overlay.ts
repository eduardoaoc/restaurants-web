export interface OverlayProps {
  title: string
  open?: boolean
  dismissible?: boolean
  closeOnScrim?: boolean
  closeOnEscape?: boolean
  initialFocus?: string | HTMLElement
  /** Let the caller confirm unsaved changes; the primitive knows no domain. */
  beforeClose?: () => boolean | Promise<boolean>
}
