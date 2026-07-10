import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "cardboard-squeamish-genre.ngrok-free.dev",
  ],

  compress: true,
  poweredByHeader: false,
  reactStrictMode: false,
};

export default nextConfig;
