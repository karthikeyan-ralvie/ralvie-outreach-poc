import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["twilio", "bullmq", "ioredis", "@prisma/client"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
