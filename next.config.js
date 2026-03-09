/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === 'production' ? '/sabbatical-globe' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/sabbatical-globe/' : '',
}

module.exports = nextConfig
