import { createApp } from './app';
import { config } from './config';
import { seed } from './db/seed';

/**
 * Boots the API: applies the schema, seeds the default users, then listens.
 * Running migrations at boot keeps Render deploys zero-touch.
 */
async function main(): Promise<void> {
  await seed();
  createApp().listen(config.port, () => {
    console.log(`Milson Project Pipeline API listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
