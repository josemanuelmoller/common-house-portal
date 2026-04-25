import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser uses dynamic imports (file-type, mammoth, etc.) that the
  // serverless bundler misses. Listing it here keeps it external (resolved
  // from node_modules at runtime) instead of being bundled.
  serverExternalPackages: ["officeparser"],
};

export default nextConfig;
