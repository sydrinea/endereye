import { Spinner } from './views/Spinner'

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900">
      <Spinner />
    </div>
  )
}
