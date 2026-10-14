import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { DocsContent, getDocsTopics } from '@/components/docs/docs-content'
import { documentationConfig } from '@/lib/api-documentation'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ topic: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic: id } = await params
  const topic = getDocsTopics().find(item => item.id === id)
  if (!topic) notFound()
  return {
    title: topic.title + ' · TCGPlaytest Docs',
    description: topic.description,
    alternates: { canonical: documentationConfig().baseUrl + (id === 'overview' ? '/docs' : '/docs/' + id) },
  }
}

export default async function DocsTopicPage({ params }: Props) {
  const { topic } = await params
  if (topic === 'overview') redirect('/docs')
  return <DocsContent topicId={topic} />
}
