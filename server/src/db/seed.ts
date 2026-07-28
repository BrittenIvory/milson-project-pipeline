import bcrypt from 'bcryptjs';
import { pool, queryOne } from './pool';
import { migrate } from './migrate';
import { config } from '../config';
import type { Role } from '../types';

interface SeedUser {
  email: string;
  fullName: string;
  role: Role;
  password: string;
}

const seedUsers: SeedUser[] = [
  {
    email: config.seedAdminEmail,
    fullName: 'Milson Administrator',
    role: 'administrator',
    password: config.seedAdminPassword,
  },
  { email: 'engineer@milsonfoundry.com', fullName: 'Erin Engineer', role: 'engineering', password: 'Engineer123!' },
  { email: 'sales@milsonfoundry.com', fullName: 'Sam Sales', role: 'sales', password: 'Sales123!' },
  { email: 'production@milsonfoundry.com', fullName: 'Pat Production', role: 'production', password: 'Production123!' },
  { email: 'quality@milsonfoundry.com', fullName: 'Quinn Quality', role: 'quality', password: 'Quality123!' },
];

/** Inserts the default user set. Existing users are left untouched. */
export async function seed(): Promise<void> {
  await migrate();
  for (const user of seedUsers) {
    const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [
      user.email,
    ]);
    if (existing) continue;
    const hash = await bcrypt.hash(user.password, 12);
    await pool.query(
      'INSERT INTO users (email, full_name, password_hash, role) VALUES ($1, $2, $3, $4)',
      [user.email, user.fullName, hash, user.role],
    );
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed complete.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
