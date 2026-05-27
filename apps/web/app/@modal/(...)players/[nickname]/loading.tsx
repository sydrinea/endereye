import { CareerModal } from '@/app/views/CareerModal'
import { Spinner } from '@/app/views/Spinner'

export default function Loading() {
  return (
    <CareerModal>
      <div className="flex justify-center py-20">
        <Spinner size={32} color="accent" />
      </div>
    </CareerModal>
  )
}
