import { ACCENT_HEX } from './ui'

export const outerShellStyle = {
  backgroundColor: '#18181b',
  padding: '40px',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Raleway',
  width: '100%',
  height: '100%',
}

export const tableContainerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  fontSize: '13px',
  backgroundColor: '#18181b',
  border: '1px solid rgba(108, 224, 60, 0.4)',
  borderRadius: '8px',
  overflow: 'hidden' as const,
}

interface Column {
  label: string
  sublabel?: string
  width: string
  border?: boolean
}

export function HeaderRow({ columns }: { columns: Column[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#111113',
        borderBottom: '1px solid rgba(108, 224, 60, 0.4)',
      }}
    >
      {columns.map((col) => (
        <div
          key={col.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: col.width,
            padding: '8px',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            color: '#a1a1aa',
            fontFamily: 'Minecraft',
            ...(col.border ? { borderLeft: '1px solid rgba(108, 224, 60, 0.4)' } : {}),
          }}
        >
          <span style={{ display: 'flex' }}>{col.label}</span>
          {col.sublabel ? (
            <span style={{ display: 'flex', fontSize: '10px', color: '#52525b', marginTop: '2px' }}>
              {col.sublabel}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function ImageTitle({ children }: { children: string | (string | number)[] }) {
  return (
    <div style={{ display: 'flex', textAlign: 'center', marginBottom: '32px' }}>
      <h1
        style={{
          fontSize: '32px',
          color: ACCENT_HEX,
          fontFamily: 'Minecraft',
          letterSpacing: '-0.04em',
          margin: 0,
        }}
      >
        {children}
      </h1>
    </div>
  )
}

export function ImageFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', marginTop: '24px', textAlign: 'center' }}>
      <p style={{ fontSize: '14px', fontFamily: 'Minecraft', color: '#52525b', margin: 0 }}>
        {children}
      </p>
    </div>
  )
}

export function PlayerHead({ src }: { src: string | undefined }) {
  if (!src) {
    return <div style={{ display: 'flex', width: '16px', height: '16px', flexShrink: 0 }} />
  }
  return (
    <img
      src={src}
      width={16}
      height={16}
      style={{ imageRendering: 'pixelated', flexShrink: 0, borderRadius: '2px' }}
    />
  )
}
