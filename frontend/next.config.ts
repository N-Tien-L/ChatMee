import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/:path*`
          : 'http://localhost:8080/:path*',
      },
      {
        source: '/oauth2/:path*',
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/oauth2/:path*`
          : 'http://localhost:8080/oauth2/:path*',
      },
      {
        source: '/login/:path*',
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/login/:path*`
          : 'http://localhost:8080/login/:path*',
      },
      {
        source: '/logout',
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/logout`
          : 'http://localhost:8080/logout',
      },
      {
        source: '/ws',
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/ws`
          : 'http://localhost:8080/ws',
      },
    ];
  },
};

export default nextConfig;
