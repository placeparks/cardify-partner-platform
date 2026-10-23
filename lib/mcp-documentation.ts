// Production is the public default. Staging docs can explicitly override it.
export function documentedMcpEndpoint() {
  const value = process.env.MCP_DOCUMENTED_URL || 'https://www.tcgplaytest.com/api/mcp'
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/api/mcp' || u.search || u.hash) throw new Error('MCP_DOCUMENTED_URL must be an exact HTTPS /api/mcp URL')
  return u.href
}
