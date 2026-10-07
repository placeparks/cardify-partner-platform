/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/internal/validation': ['./lib/assets/autobleed-mask.png'],
    '/v1/carts': ['./lib/assets/autobleed-mask.png'],
    '/api/widget/cart': ['./lib/assets/autobleed-mask.png'],
  },
}

module.exports = nextConfig
