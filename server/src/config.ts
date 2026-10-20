import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://milson:milson123@localhost:5432/milson_pipeline';

/** Central runtime configuration, resolved once at process start. */
export const config = {
  port: Number(process.env.PORT ?? 3002),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl,
  /** Managed Postgres (Render) requires SSL; local development does not. */
  databaseSsl:
    process.env.DATABASE_SSL === 'true' ||
    (!/localhost|127\.0\.0\.1/.test(databaseUrl) && process.env.DATABASE_SSL !== 'false'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret',
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
};
