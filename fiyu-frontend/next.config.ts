import type { NextConfig } from "next";

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
  images: {
    remotePatterns: supabaseStoragePattern ? [supabaseStoragePattern] : [],
  },
};

export default nextConfig;
