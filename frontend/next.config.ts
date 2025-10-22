import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rewrites for local development
  // Production uses vercel.json instead
  async rewrites() {
    // Only apply rewrites in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8080/api/:path*',
        },
        {
          source: '/oauth2/:path*',
          destination: 'http://localhost:8080/oauth2/:path*',
        },
        {
          source: '/login/:path*',
          destination: 'http://localhost:8080/login/:path*',
        },
        {
          source: '/logout',
          destination: 'http://localhost:8080/logout',
        },
        {
          source: '/ws',
          destination: 'http://localhost:8080/ws',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
