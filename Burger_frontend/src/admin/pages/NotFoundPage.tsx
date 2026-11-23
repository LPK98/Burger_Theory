import { Link } from 'react-router'
import { Card } from '../components/ui'
import { PageHeader } from '../layout'

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card className="p-8">
        <p className="text-sm text-grey">There’s no admin page at this address.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-ember-hot hover:underline">
          Go to the dashboard
        </Link>
      </Card>
    </>
  )
}
