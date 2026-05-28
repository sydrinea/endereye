import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`
  const css = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text())
  const match = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/)
  if (!match) throw new Error(`Failed to parse Google Fonts CSS for ${family}`)
  const fontRes = await fetch(match[1])
  if (!fontRes.ok) throw new Error(`Failed to fetch font: ${match[1]}`)
  return fontRes.arrayBuffer()
}

const BG = '#18181b'
const ZINC_100 = '#f4f4f5'
const ZINC_400 = '#a1a1aa'
const GREEN = '#4ade80'

function RankedLogo({ size = 120 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="40 36 184 184" width={size} height={size}>
      <path
        fill="white"
        d="M 40,48 h 176 v 8 h -176 z M 40,56 h 8 v 8 h -8 z M 208,56 h 16 v 8 h -16 z M 40,64 h 8 v 8 h -8 z M 216,64 h 8 v 8 h -8 z M 40,72 h 8 v 8 h -8 z M 216,72 h 8 v 8 h -8 z M 40,80 h 8 v 8 h -8 z M 216,80 h 8 v 8 h -8 z M 40,88 h 8 v 8 h -8 z M 216,88 h 8 v 8 h -8 z M 40,96 h 8 v 8 h -8 z M 216,96 h 8 v 8 h -8 z M 40,104 h 8 v 8 h -8 z M 216,104 h 8 v 8 h -8 z M 40,112 h 8 v 8 h -8 z M 216,112 h 8 v 8 h -8 z M 40,120 h 8 v 8 h -8 z M 216,120 h 8 v 8 h -8 z M 40,128 h 8 v 8 h -8 z M 216,128 h 8 v 8 h -8 z M 40,136 h 8 v 8 h -8 z M 216,136 h 8 v 8 h -8 z M 40,144 h 8 v 8 h -8 z M 216,144 h 8 v 8 h -8 z M 40,152 h 8 v 8 h -8 z M 216,152 h 8 v 8 h -8 z M 40,160 h 8 v 8 h -8 z M 216,160 h 8 v 8 h -8 z M 40,168 h 8 v 8 h -8 z M 216,168 h 8 v 8 h -8 z M 40,176 h 8 v 8 h -8 z M 216,176 h 8 v 8 h -8 z M 40,184 h 8 v 8 h -8 z M 216,184 h 8 v 8 h -8 z M 40,192 h 16 v 8 h -16 z M 208,192 h 16 v 8 h -16 z M 48,200 h 168 v 8 h -168 z"
      />
      <path
        fill="rgba(16,44,48,1.0)"
        d="M 48,56 h 160 v 8 h -160 z M 48,64 h 8 v 8 h -8 z M 104,64 h 8 v 8 h -8 z M 168,64 h 8 v 8 h -8 z M 200,64 h 16 v 8 h -16 z M 48,72 h 8 v 8 h -8 z M 200,72 h 16 v 8 h -16 z M 48,80 h 8 v 8 h -8 z M 200,80 h 16 v 8 h -16 z M 48,88 h 8 v 8 h -8 z M 200,88 h 16 v 8 h -16 z M 48,96 h 8 v 8 h -8 z M 200,96 h 16 v 8 h -16 z M 48,104 h 8 v 8 h -8 z M 200,104 h 16 v 8 h -16 z M 48,112 h 8 v 8 h -8 z M 200,112 h 16 v 8 h -16 z M 48,120 h 8 v 8 h -8 z M 200,120 h 16 v 8 h -16 z M 48,128 h 8 v 8 h -8 z M 200,128 h 16 v 8 h -16 z M 48,136 h 8 v 8 h -8 z M 200,136 h 16 v 8 h -16 z M 48,144 h 8 v 8 h -8 z M 200,144 h 16 v 8 h -16 z M 48,152 h 8 v 8 h -8 z M 200,152 h 16 v 8 h -16 z M 48,160 h 8 v 8 h -8 z M 200,160 h 16 v 8 h -16 z M 48,168 h 8 v 8 h -8 z M 80,168 h 8 v 8 h -8 z M 200,168 h 16 v 8 h -16 z M 48,176 h 8 v 8 h -8 z M 80,176 h 8 v 8 h -8 z M 192,176 h 24 v 8 h -24 z M 48,184 h 168 v 8 h -168 z M 56,192 h 152 v 8 h -152 z"
      />
      <path
        fill="rgba(134,206,52,1.0)"
        d="M 56,64 h 48 v 8 h -48 z M 112,64 h 56 v 8 h -56 z M 176,64 h 24 v 8 h -24 z M 56,72 h 8 v 8 h -8 z M 96,72 h 24 v 8 h -24 z M 136,72 h 16 v 8 h -16 z M 160,72 h 24 v 8 h -24 z M 192,72 h 8 v 8 h -8 z M 56,80 h 8 v 8 h -8 z M 104,80 h 8 v 8 h -8 z M 144,80 h 8 v 8 h -8 z M 168,80 h 16 v 8 h -16 z M 192,80 h 8 v 8 h -8 z M 56,88 h 8 v 8 h -8 z M 104,88 h 8 v 8 h -8 z M 144,88 h 8 v 8 h -8 z M 160,88 h 8 v 8 h -8 z M 176,88 h 8 v 8 h -8 z M 192,88 h 8 v 8 h -8 z M 56,96 h 8 v 8 h -8 z M 96,96 h 16 v 8 h -16 z M 144,96 h 8 v 8 h -8 z M 160,96 h 8 v 8 h -8 z M 176,96 h 8 v 8 h -8 z M 192,96 h 8 v 8 h -8 z M 56,104 h 8 v 8 h -8 z M 72,104 h 24 v 8 h -24 z M 104,104 h 8 v 8 h -8 z M 144,104 h 8 v 8 h -8 z M 160,104 h 16 v 8 h -16 z M 192,104 h 8 v 8 h -8 z M 56,112 h 8 v 8 h -8 z M 72,112 h 24 v 8 h -24 z M 104,112 h 8 v 8 h -8 z M 120,112 h 16 v 8 h -16 z M 144,112 h 8 v 8 h -8 z M 160,112 h 24 v 8 h -24 z M 192,112 h 8 v 8 h -8 z M 56,120 h 144 v 8 h -144 z M 56,128 h 8 v 8 h -8 z M 72,128 h 24 v 8 h -24 z M 104,128 h 8 v 8 h -8 z M 144,128 h 8 v 8 h -8 z M 184,128 h 16 v 8 h -16 z M 56,136 h 8 v 8 h -8 z M 72,136 h 16 v 8 h -16 z M 96,136 h 16 v 8 h -16 z M 120,136 h 32 v 8 h -32 z M 192,136 h 8 v 8 h -8 z M 56,144 h 8 v 8 h -8 z M 88,144 h 24 v 8 h -24 z M 136,144 h 16 v 8 h -16 z M 192,144 h 8 v 8 h -8 z M 56,152 h 8 v 8 h -8 z M 72,152 h 16 v 8 h -16 z M 96,152 h 16 v 8 h -16 z M 120,152 h 32 v 8 h -32 z M 192,152 h 8 v 8 h -8 z M 56,160 h 8 v 8 h -8 z M 72,160 h 24 v 8 h -24 z M 104,160 h 8 v 8 h -8 z M 120,160 h 32 v 8 h -32 z M 192,160 h 8 v 8 h -8 z M 56,168 h 8 v 8 h -8 z M 72,168 h 8 v 8 h -8 z M 88,168 h 8 v 8 h -8 z M 104,168 h 8 v 8 h -8 z M 144,168 h 8 v 8 h -8 z M 184,168 h 16 v 8 h -16 z M 56,176 h 24 v 8 h -24 z M 88,176 h 104 v 8 h -104 z"
      />
      <path
        fill="white"
        d="M 64,72 h 32 v 8 h -32 z M 64,80 h 8 v 8 h -8 z M 64,88 h 8 v 8 h -8 z M 64,96 h 32 v 8 h -32 z M 64,104 h 8 v 8 h -8 z M 64,112 h 8 v 8 h -8 z"
      />
      <path fill="white" d="M 120,72 h 16 v 8 h -16 z" />
      <path
        fill="white"
        d="M 152,72 h 8 v 8 h -8 z M 152,80 h 16 v 8 h -16 z M 152,88 h 8 v 8 h -8 z M 152,96 h 8 v 8 h -8 z M 152,104 h 8 v 8 h -8 z M 152,112 h 8 v 8 h -8 z"
      />
      <path
        fill="white"
        d="M 184,72 h 8 v 8 h -8 z M 184,80 h 8 v 8 h -8 z M 184,88 h 8 v 8 h -8 z M 184,96 h 8 v 8 h -8 z M 176,104 h 16 v 8 h -16 z M 184,112 h 8 v 8 h -8 z"
      />
      <path fill="rgba(134,206,52,1.0)" d="M 72,80 h 24 v 8 h -24 z M 72,88 h 24 v 8 h -24 z" />
      <path fill="white" d="M 96,80 h 8 v 8 h -8 z M 96,88 h 8 v 8 h -8 z" />
      <path
        fill="white"
        d="M 112,80 h 8 v 8 h -8 z M 136,80 h 8 v 8 h -8 z M 112,88 h 8 v 8 h -8 z M 136,88 h 8 v 8 h -8 z M 112,96 h 8 v 8 h -8 z M 136,96 h 8 v 8 h -8 z M 112,104 h 32 v 8 h -32 z M 112,112 h 8 v 8 h -8 z M 136,112 h 8 v 8 h -8 z"
      />
      <path
        fill="rgba(134,206,52,1.0)"
        d="M 120,80 h 16 v 8 h -16 z M 120,88 h 16 v 8 h -16 z M 120,96 h 16 v 8 h -16 z"
      />
      <path fill="white" d="M 168,88 h 8 v 8 h -8 z M 168,96 h 8 v 8 h -8 z" />
      <path fill="white" d="M 96,104 h 8 v 8 h -8 z M 96,112 h 8 v 8 h -8 z" />
      <path
        fill="white"
        d="M 64,128 h 8 v 8 h -8 z M 64,136 h 8 v 8 h -8 z M 64,144 h 24 v 8 h -24 z M 64,152 h 8 v 8 h -8 z M 64,160 h 8 v 8 h -8 z M 64,168 h 8 v 8 h -8 z"
      />
      <path fill="white" d="M 96,128 h 8 v 8 h -8 z" />
      <path
        fill="white"
        d="M 112,128 h 32 v 8 h -32 z M 112,136 h 8 v 8 h -8 z M 112,144 h 24 v 8 h -24 z M 112,152 h 8 v 8 h -8 z M 112,160 h 8 v 8 h -8 z M 112,168 h 32 v 8 h -32 z"
      />
      <path
        fill="white"
        d="M 152,128 h 32 v 8 h -32 z M 152,136 h 8 v 8 h -8 z M 152,144 h 8 v 8 h -8 z M 152,152 h 8 v 8 h -8 z M 152,160 h 8 v 8 h -8 z M 152,168 h 32 v 8 h -32 z"
      />
      <path fill="white" d="M 88,136 h 8 v 8 h -8 z" />
      <path
        fill="rgba(134,206,52,1.0)"
        d="M 160,136 h 24 v 8 h -24 z M 160,144 h 24 v 8 h -24 z M 160,152 h 24 v 8 h -24 z M 160,160 h 24 v 8 h -24 z"
      />
      <path
        fill="white"
        d="M 184,136 h 8 v 8 h -8 z M 184,144 h 8 v 8 h -8 z M 184,152 h 8 v 8 h -8 z M 184,160 h 8 v 8 h -8 z"
      />
      <path fill="white" d="M 88,152 h 8 v 8 h -8 z" />
      <path fill="white" d="M 96,160 h 8 v 8 h -8 z M 96,168 h 8 v 8 h -8 z" />
    </svg>
  )
}

function Wrapper({ children, behavior }: { children: React.ReactNode; behavior: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
        height: '100%',
        background: BG,
        padding: '56px 56px 40px 56px',
        justifyContent: behavior,
        borderBottom: `3px solid ${GREEN}`,
      }}
    >
      {children}
    </div>
  )
}

function PlayerHeadGrid({ players, size = 64 }: { players: string[]; size?: number }) {
  if (!players || players.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 40,
      }}
    >
      {players.map((name, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${name}-${idx}`}
          src={`https://mc-heads.net/avatar/${name}/${size}`}
          width={size}
          height={size}
          style={{ borderRadius: 8, imageRendering: 'pixelated' }}
          alt=""
        />
      ))}
    </div>
  )
}

function LogoTitle({ title, fontSize = 64 }: { title: string; fontSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <RankedLogo />
      <span
        style={{
          fontFamily: 'Raleway',
          color: ZINC_100,
          fontSize,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {title}
      </span>
    </div>
  )
}

function DefaultTemplate() {
  return (
    <Wrapper behavior="flex-end">
      <LogoTitle title="endereye" />
    </Wrapper>
  )
}

function EventTemplate({ label }: { label: string }) {
  return (
    <Wrapper behavior="flex-end">
      <LogoTitle title={label} fontSize={label.length > 30 ? 52 : 64} />
    </Wrapper>
  )
}

function PlayerTemplate({ name, eventCount }: { name: string; eventCount: string }) {
  const count = Number(eventCount)
  const eventLabel = count === 1 ? '1 event' : `${count} events`

  return (
    <Wrapper behavior="flex-end">
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {name && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://mc-heads.net/avatar/${name}/120`}
            width={120}
            height={120}
            style={{ borderRadius: 10, imageRendering: 'pixelated' }}
            alt=""
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span
            style={{
              fontFamily: 'Raleway',
              color: ZINC_100,
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {name}&apos;s Career
          </span>
          <span
            style={{
              fontFamily: 'Geist Mono',
              color: ZINC_400,
              fontSize: 18,
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '4px 14px',
              alignSelf: 'flex-start',
            }}
          >
            {eventLabel}
          </span>
        </div>
      </div>
    </Wrapper>
  )
}

function FinalistsTemplate({ players }: { players: string[] }) {
  return (
    <Wrapper behavior="space-between">
      <PlayerHeadGrid players={players} />
      <LogoTitle title="Finalist Results" />
    </Wrapper>
  )
}

function PlayersTemplate({ players }: { players: string[] }) {
  return (
    <Wrapper behavior="space-between">
      <PlayerHeadGrid players={players} />
      <LogoTitle title="Players" />
    </Wrapper>
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? 'default'

  const playersParam = searchParams.get('players') ?? ''
  const players = playersParam ? playersParam.split(',').filter(Boolean) : []

  const monoText = new Set("endereye 's Career event events · 0123456789")

  const displayText = new Set("endereye Finalist Results Players 's Career event events")

  if (type === 'event') {
    const label = searchParams.get('label') ?? ''
    ;[...label].forEach((c) => displayText.add(c))
  } else if (type === 'player') {
    const name = searchParams.get('name') ?? ''
    ;[...name].forEach((c) => displayText.add(c))
  }

  const monoStr = [...monoText].join('')
  const displayStr = [...displayText].join('')

  const [geistMono, ralewayRegular, ralewayBold] = await Promise.all([
    loadGoogleFont('Geist+Mono', monoStr),
    loadGoogleFont('Raleway', displayStr),
    loadGoogleFont('Raleway:wght@700', displayStr),
  ])

  const fonts = [
    { name: 'Geist Mono', data: geistMono, weight: 400 as const, style: 'normal' as const },
    { name: 'Raleway', data: ralewayRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Raleway', data: ralewayBold, weight: 700 as const, style: 'normal' as const },
  ]

  let jsx: React.ReactElement

  if (type === 'event') {
    jsx = <EventTemplate label={searchParams.get('label') ?? 'Event'} />
  } else if (type === 'player') {
    jsx = (
      <PlayerTemplate
        name={searchParams.get('name') ?? 'Player'}
        eventCount={searchParams.get('events') ?? '0'}
      />
    )
  } else if (type === 'finalists') {
    jsx = <FinalistsTemplate players={players} />
  } else if (type === 'players') {
    jsx = <PlayersTemplate players={players} />
  } else {
    jsx = <DefaultTemplate />
  }

  return new ImageResponse(jsx, { width: 1200, height: 630, fonts })
}
