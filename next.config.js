/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // The public dashboard pages opt into ISR via `export const revalidate`.
  // Admin and API routes stay fully dynamic.
}

module.exports = nextConfig
