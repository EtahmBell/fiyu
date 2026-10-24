import type { NextConfig } from "next";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseStoragePattern = supabaseUrl
  ? (() => {
      const url = new URL(supabaseUrl);
      return {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
        pathname: "/storage/v1/object/public/avatars/**",
      };
    })()
  : null;

const nextConfig: NextConfig = {
  transpilePackages: ["@fiyu/contracts"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  images: {
    remotePatterns: supabaseStoragePattern ? [supabaseStoragePattern] : [],
  },
};

export default nextConfig;
