// Ombor Pro belgisi: oltin rangli quti (uch tomoni ko'rinadi)
export function Logo({ size = 40, anim = false }: { size?: number; anim?: boolean }) {
  return (
    <svg className={'logo3' + (anim ? ' anim' : '')} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <polygon className="lf top" points="32,6 56,19 32,32 8,19" fill="#F9CF6A" />
      <polygon className="lf left" points="8,19 32,32 32,59 8,46" fill="#F2B33D" />
      <polygon className="lf right" points="56,19 32,32 32,59 56,46" fill="#D48E1F" />
      <path className="lf tape" d="M20 12.5 44 25.5v8" fill="none" stroke="#16307A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
    </svg>
  )
}
