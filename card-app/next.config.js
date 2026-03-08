/** @type {import('next').NextConfig} */
const basePath = process.env.BASE_PATH || '';
const nextConfig = {
  output: 'standalone',
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

module.exports = nextConfig;
