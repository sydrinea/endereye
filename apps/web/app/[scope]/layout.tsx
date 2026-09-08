import { notFound } from 'next/navigation'
import { Footer } from '@/components/layout'
import { getHostByHandle } from '@/lib/events-config'
import { decodeScope } from '@/lib/event-route'

/**
 * Wraps every `/lcq/11`-style official event page and every `/@handle` host
 * page. For a host scope, 404 up front if the handle doesn't exist.
 */
export default async function ScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ scope: string }>
}) {
  const scope = decodeScope((await params).scope)
  if (scope.startsWith('@') && !(await getHostByHandle(scope.slice(1)))) notFound()

  return (
    <>
      {children}
      <Footer />
    </>
  )
}
