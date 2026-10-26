export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type LegacyButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text'

const aliases: Record<LegacyButtonVariant, ButtonVariant> = {
  filled: 'primary', tonal: 'secondary', outlined: 'secondary', text: 'ghost',
}

export function resolveButtonVariant(variant: ButtonVariant | LegacyButtonVariant): ButtonVariant {
  return variant in aliases ? aliases[variant as LegacyButtonVariant] : variant as ButtonVariant
}
