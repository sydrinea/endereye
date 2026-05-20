import Ranked from '@/components/icons/Ranked'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-800 bg-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12 flex flex-col gap-8">
        <div className="flex flex-col items-start gap-3">
          <Ranked size={80} />
          <span className="font-display text-3xl text-zinc-100">endereye</span>
          <p className="text-sm text-zinc-500">survival odds for MCSR Ranked events</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-4">
            <a
              href="https://mcsrranked.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              mcsrranked.com ↗
            </a>
            <a
              href="https://github.com/sydrinea/endereye"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              GitHub ↗
            </a>
          </div>
          <span className="text-zinc-600">made by sydrinea</span>
        </div>
      </div>
    </footer>
  )
}
