import type { Metadata } from 'next'

interface OgMetaOptions {
  title: string
  description: string
  /** Relative path like /api/og?type=default — resolved against metadataBase */
  imagePath: string
}

export function buildMeta({ title, description, imagePath }: OgMetaOptions): Metadata {
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      images: [{ url: imagePath, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imagePath],
    },
  }
}
