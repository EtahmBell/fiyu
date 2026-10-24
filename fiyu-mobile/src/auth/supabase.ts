import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/config/env";
import { secureSessionStorage } from "@/auth/secureStorage";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const config = getSupabaseConfig();
  if (!config) throw new Error("Account access is not configured.");
  client = createClient(config.url, config.key, {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
