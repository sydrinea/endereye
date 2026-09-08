import { permanentRedirect } from 'next/navigation'

// The official-events archive moved to the `@official` host profile.
export default function ArchivePage(): never {
  permanentRedirect('/@official')
}
