import type { NextConfig } from 'next'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

const nextConfig: NextConfig = {
  output: 'standalone',
  // Shown in Settings; GIT_SHA is passed as a Docker build arg by the CI workflow
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: (process.env.GIT_SHA || 'dev').slice(0, 7),
  },
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer', 'mailparser', 'sanitize-html'],
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-DNS-Prefetch-Control', value: 'off' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
}

export default nextConfig
