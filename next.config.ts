import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships native binaries, so it must stay external to the server bundle.
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
