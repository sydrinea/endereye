import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { PlayerView } from '@endereye/core'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!

export async function getR2Object<T>(key: string): Promise<T | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const text = await res.Body?.transformToString()
    if (!text) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function deleteR2Object(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function putR2Object(key: string, value: unknown): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    }),
  )
}

export async function getR2CachedViews(prefix: string, seed: number): Promise<PlayerView[] | null> {
  return getR2Object<PlayerView[]>(`cache/views/${prefix}/${seed}.json`)
}

export async function deleteR2CachedViews(prefix: string): Promise<void> {
  const list = await r2.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `cache/views/${prefix}/` }),
  )
  const keys = (list.Contents ?? []).map((obj) => obj.Key).filter((k): k is string => Boolean(k))
  if (keys.length === 0) return
  await Promise.all(
    keys.map((key) => r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))),
  )
}
