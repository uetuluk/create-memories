function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  authSecret: () => required("AUTH_SECRET"),
  authUrl: () => process.env.AUTH_URL ?? "http://localhost:3000",
  emailServer: () => required("EMAIL_SERVER"),
  emailFrom: () => process.env.EMAIL_FROM ?? "no-reply@localhost",
  allowedDomains: () =>
    (process.env.ALLOWED_EMAIL_DOMAINS ?? "nyu.edu")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  adminEmails: () =>
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  geminiApiKey: () => required("GEMINI_API_KEY"),
  mediaDir: () => process.env.MEDIA_DIR ?? "/data/media",
  publicUrl: () =>
    process.env.PUBLIC_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000",
  surveyUrl: () => process.env.SURVEY_URL ?? null,
};

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails().includes(email.toLowerCase());
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return env.allowedDomains().some((d) => lower.endsWith(`@${d}`));
}
