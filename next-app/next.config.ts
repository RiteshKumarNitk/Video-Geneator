import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return ['/chat', '/tts', '/ocr'].map(source => ({ source, destination: '/clips', permanent: false }));
  },
  serverExternalPackages: ["better-auth","pg"],
};

export default nextConfig;
