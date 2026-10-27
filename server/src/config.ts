import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://milson:milson123@localhost:5432/milson_pipeline';

const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * Secrets that must be explicitly configured before the server may start in
 * production. Development defaults exist only for local use — they are never
 * acceptable live. Exported for tests.
 */
export function missingProductionSecrets(env: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  const jwtSecret = env.JWT_SECRET?.trim() ?? '';
  if (jwtSecret.length < 32 || jwtSecret === 'dev-only-insecure-secret') {
    missing.push('JWT_SECRET (at least 32 characters)');
  }
  if (!env.SEED_ADMIN_EMAIL?.trim()) missing.push('SEED_ADMIN_EMAIL');
  const adminPassword = env.SEED_ADMIN_PASSWORD ?? '';
  if (adminPassword.length < 12 || adminPassword === 'Admin123!') {
    missing.push('SEED_ADMIN_PASSWORD (at least 12 characters, not the dev default)');
  }
  return missing;
}

if (nodeEnv === 'production') {
  const missing = missingProductionSecrets(process.env);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start in production — set these secrets first: ${missing.join(', ')}`,
    );
  }
}

/** Central runtime configuration, resolved once at process start. */
export const config = {
  port: Number(process.env.PORT ?? 3002),
  nodeEnv,
  databaseUrl,
  /** Managed Postgres (Render) requires SSL; local development does not. */
  databaseSsl:
    process.env.DATABASE_SSL === 'true' ||
    (!/localhost|127\.0\.0\.1/.test(databaseUrl) && process.env.DATABASE_SSL !== 'false'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret',
  /** Proxy hops to trust for req.ip (Render terminates TLS one hop out). */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? (nodeEnv === 'production' ? 1 : 0)),
  /**
   * Browser origins allowed to call the API cross-origin. In production the
   * SPA is served same-origin, so the default is none; set ALLOWED_ORIGINS
   * (comma-separated) if the frontend is ever hosted elsewhere.
   */
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ??
    (nodeEnv === 'production' ? '' : 'http://localhost:5174,http://127.0.0.1:5174')
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  /** Storage driver for project documents: 'local' or 's3'. */
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  storageDir: process.env.STORAGE_DIR ?? path.resolve(process.cwd(), 'uploads'),
  /** AWS settings for the 's3' storage driver. Never log these values. */
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  awsRegion: process.env.AWS_REGION ?? '',
  awsS3Bucket: process.env.AWS_S3_BUCKET ?? '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024),
  /** Optional path to the built frontend, served by Express in production. */
  clientDist: process.env.CLIENT_DIST ?? path.resolve(process.cwd(), '../client/dist'),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@milsonfoundry.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
  /** Set on the sandbox deployment to render a visible SANDBOX banner. */
  sandbox: process.env.SANDBOX === 'true',
  /** Deployed build info shown on the sandbox banner (Render injects these). */
  deployCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT_SHA ?? null,
  deployBranch: process.env.RENDER_GIT_BRANCH ?? process.env.GIT_BRANCH ?? null,
  /** Optional PR number for the deploy (set DEPLOYED_PR to display it). */
  deployPr: process.env.DEPLOYED_PR ?? null,
};
