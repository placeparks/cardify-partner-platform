export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export function GET() {
  return Response.json({ app: 'partner', release: 'readiness-20261022',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
    node_version: process.version,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
