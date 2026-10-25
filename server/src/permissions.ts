import type { Role } from './types';

/**
 * Per-user permissions layered on top of the role's default matrix.
 *
 * Each user carries a `permissions` JSONB map of explicit overrides
 * ({key: boolean}); a missing key falls back to the role default.
 * Administrators always have every permission — the column is ignored for
 * them — so an admin can never lock themselves (or another admin) out.
 *
 * Convention: `X.edit` implies `X.view` — there is no way to grant edit
 * access to something a user cannot see.
 */
export const PERMISSION_KEYS = [
  'projects.view',
  'projects.edit',
  'customers.view',
  'customers.edit',
  'suppliers.view',
  'suppliers.edit',
  'documents.manage',
  'tasks.manage',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

/** `.edit` implies `.view` for the same resource. */
const IMPLIED_BY: Partial<Record<Permission, Permission>> = {
  'projects.view': 'projects.edit',
  'customers.view': 'customers.edit',
  'suppliers.view': 'suppliers.edit',
};

/** The access each role gets before per-user overrides are applied. */
export function rolePermissionDefaults(role: Role): Record<Permission, boolean> {
  const all = (value: boolean): Record<Permission, boolean> =>
    Object.fromEntries(PERMISSION_KEYS.map((key) => [key, value])) as Record<
      Permission,
      boolean
    >;
  switch (role) {
    case 'administrator':
    case 'engineering':
    case 'sales':
      return all(true);
    case 'production':
      return { ...all(true), 'customers.edit': false };
    case 'quality':
      return {
        ...all(true),
        'projects.edit': false,
        'customers.edit': false,
        'suppliers.edit': false,
      };
  }
}

/** Resolves the full effective map: role defaults with user overrides on top. */
export function effectivePermissions(
  role: Role,
  overrides: Record<string, boolean> | null | undefined,
): Record<Permission, boolean> {
  const effective = rolePermissionDefaults(role);
  for (const key of PERMISSION_KEYS) {
    const override = overrides?.[key];
    if (typeof override === 'boolean') effective[key] = override;
  }
  // An edit grant implies the matching view grant, whatever the map says.
  for (const [view, edit] of Object.entries(IMPLIED_BY) as [Permission, Permission][]) {
    if (effective[edit]) effective[view] = true;
  }
  return effective;
}

/** True when the (already resolved) permission map grants `key`. */
export function hasPermission(
  user: { role: Role; permissions?: Record<string, boolean> | null },
  key: Permission,
): boolean {
  if (user.role === 'administrator') return true;
  return user.permissions?.[key] === true;
}
