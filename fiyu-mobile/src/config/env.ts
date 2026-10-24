const DEFAULT_API_BASE_URL = "https://api.fiyuapp.com";

function publicValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getApiBaseUrl(): string {
  return (publicValue(process.env.EXPO_PUBLIC_FIYU_API_URL) ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = publicValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const key = publicValue(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    ?? publicValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  return url && key ? { url, key } : null;
}
