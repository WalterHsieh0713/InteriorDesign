import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Catalog thumbnails are IKEA's own product photography, served straight
    // from their storefront. Without this, next/image blocks them outright.
    remotePatterns: [new URL("https://www.ikea.com/**")],
  },
};

export default nextConfig;
