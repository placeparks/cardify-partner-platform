import type { Metadata } from 'next'
import { DocsContent } from '@/components/docs/docs-content'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Developer documentation · TCGPlaytest',
  description: 'Integrate card printing with the TCGPlaytest API or widget, or order through an AI assistant using public MCP. Setup, card previews, guest checkout and fulfillment.',
  alternates: { canonical: 'https://partner.tcgplaytest.com/docs' },
}

export default function DocsPage() {
  return <DocsContent />
}
