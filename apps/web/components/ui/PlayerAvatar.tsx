import Image from 'next/image'

const sizes = { sm: 24, md: 32 }

interface Props {
  nickname: string
  size?: keyof typeof sizes
}

export function PlayerAvatar({ nickname, size = 'md' }: Props) {
  const px = sizes[size]
  return (
    <Image
      src={`https://mc-heads.net/avatar/${nickname}/${px}`}
      alt={nickname}
      width={px}
      height={px}
      className="rounded-sm"
      unoptimized
    />
  )
}
