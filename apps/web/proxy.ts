import { NextRequest, NextResponse } from 'next/server'

export async function proxy(req: NextRequest) {
  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/active-event`, {
    headers: { 'x-middleware-request': '1' },
  })
  const { path } = await res.json()

  if (!path) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL(path, req.url))
}

export const config = {
  matcher: '/live',
}
