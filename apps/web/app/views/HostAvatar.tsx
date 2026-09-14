import Ranked from '@/components/icons/Ranked'

/**
 * Host avatar. The `official` host shows the RANKED brand mark on a dark disc
 * (the mark has a white frame baked in, so it can't be circle-clipped cleanly —
 * it sits *inside* the disc instead). Everyone else gets their Discord picture.
 */
export function HostAvatar({
  handle,
  image,
  size = 48,
}: {
  handle: string
  image: string | null
  size?: number
}) {
  if (handle === 'official') {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900"
        style={{ width: size, height: size }}
      >
        <Ranked size={Math.round(size * 0.62)} />
      </span>
    )
  }
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      className="shrink-0 rounded-full bg-zinc-800"
      style={{ width: size, height: size }}
    />
  )
}
