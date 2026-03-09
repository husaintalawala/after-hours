/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/after-hours',
  assetPrefix: '/after-hours/',
}
module.exports = nextConfig