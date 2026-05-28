import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-secret')
  if (!process.env.DASHBOARD_SECRET || secret !== process.env.DASHBOARD_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tag } = await req.json()
  if (typeof tag !== 'string' || !tag) {
    return NextResponse.json({ error: 'Missing tag' }, { status: 400 })
  }

  revalidateTag(tag, 'max')
  return NextResponse.json({ revalidated: true, tag })
}
