import fs from 'fs';
import path from 'path';
import { pool } from './pool';

/**
 * Applies the idempotent schema. Called on server boot and by `npm run migrate`
 * so a fresh Render deploy provisions its database without manual steps.
 */
export async function migrate(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Schema applied.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
