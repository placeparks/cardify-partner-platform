import type { Metadata } from 'next'
import { DocsContent } from '@/components/docs/docs-content'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Developer documentation · TCGPlaytest',
  description: 'Integrate card printing with the TCGPlaytest API. Quickstarts, language examples, embedded checkout, printing credits, Connect payouts and fulfillment.',
  alternates: { canonical: 'https://partner.tcgplaytest.com/docs' },
}

export default function DocsPage() {
  return <DocsContent />
}
