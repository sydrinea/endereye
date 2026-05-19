import type { ReactNode } from 'react'

type SurfaceVariant = 'page' | 'centered' | 'screen'
type SurfaceWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type SurfaceElement = 'main' | 'div' | 'section'

const widthMap: Record<SurfaceWidth, string> = {
  xs: 'max-w-2xl',
  sm: 'max-w-4xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
}

interface Props {
  children: ReactNode
  variant?: SurfaceVariant
  width?: SurfaceWidth
  as?: SurfaceElement
}

export function Surface({ children, variant = 'page', width = 'xl', as: Tag = 'div' }: Props) {
  if (variant === 'centered') {
    return (
      <Tag className="flex items-center justify-center px-4 min-h-[calc(100vh-10rem)]">
        {children}
      </Tag>
    )
  }

  if (variant === 'screen') {
    return <Tag className="min-h-screen text-zinc-400 p-4">{children}</Tag>
  }

  return <Tag className={`${widthMap[width]} mx-auto px-4 py-6 text-zinc-400`}>{children}</Tag>
}
