/**
 * Response headers for every route.
 * frame-ancestors blocks embedding. A fuller content security policy is a
 * follow-up: Clerk, Next, and the editor rely on inline scripts and styles.
 */
export const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
] as const;
