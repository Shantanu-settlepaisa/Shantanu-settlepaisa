import { ReconciliationResults } from '@/components/ReconciliationResults'
import { useSearchParams } from 'react-router-dom'

export default function ReconciliationView() {
  const [searchParams] = useSearchParams()
  const resultId = searchParams.get('id')

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      <div className="container mx-auto p-6">
        <ReconciliationResults resultId={resultId || undefined} />
      </div>
    </div>
  )
}