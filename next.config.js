/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/partner-checkout/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'Cache-Control', value: 'no-store' },
    ] }]
  },
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/internal/validation': ['./lib/assets/autobleed-mask.png'],
    '/v1/carts': ['./lib/assets/autobleed-mask.png'],
    '/api/widget/cart': ['./lib/assets/autobleed-mask.png'],
  },
}

module.exports = nextConfig
