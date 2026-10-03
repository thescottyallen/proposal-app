import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No preferredRegion here. The Supabase project region is not in this repo,
  // so pinning functions to a guessed region (for example iad1) could make
  // the database round trip slower. Set the Vercel function region to the
  // same region as the Supabase project once that region is known.
};

export default nextConfig;
