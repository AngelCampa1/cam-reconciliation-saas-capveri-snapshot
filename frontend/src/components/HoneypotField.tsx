/**
 * HoneypotField - Off-screen text input used as a bot trap (Vite app).
 *
 * Hidden from real users (off-screen, tabIndex -1, aria-hidden, autoComplete
 * off). Bots that auto-fill every field will populate `company_website`; the
 * backend treats any non-empty value as spam and returns a success-shaped
 * no-op so the bot gets no signal.
 */
export interface HoneypotFieldProps {
  value: string
  onChange: (value: string) => void
}

export function HoneypotField({ value, onChange }: HoneypotFieldProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
      }}
    >
      <input
        id="company_website"
        name="company_website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-hidden="true"
      />
    </div>
  )
}
