import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  effectivePermissions,
  hasPermission,
  PERMISSION_KEYS,
  rolePermissionDefaults,
} from './permissions';

describe('rolePermissionDefaults', () => {
  it('grants everything to administrator, engineering, and sales', () => {
    for (const role of ['administrator', 'engineering', 'sales'] as const) {
      const defaults = rolePermissionDefaults(role);
      for (const key of PERMISSION_KEYS) assert.equal(defaults[key], true, `${role}:${key}`);
    }
  });

  it('denies customer edits to production and project/customer/supplier edits to quality', () => {
    assert.equal(rolePermissionDefaults('production')['customers.edit'], false);
    const quality = rolePermissionDefaults('quality');
    assert.equal(quality['projects.edit'], false);
    assert.equal(quality['customers.edit'], false);
    assert.equal(quality['suppliers.edit'], false);
    assert.equal(quality['documents.manage'], true);
    assert.equal(quality['tasks.manage'], true);
  });
});

describe('effectivePermissions', () => {
  it('falls back to role defaults when a key is not overridden', () => {
    const effective = effectivePermissions('quality', { 'customers.view': false });
    assert.equal(effective['customers.view'], false);
    assert.equal(effective['suppliers.view'], true);
  });

  it('lets an override grant a permission the role lacks', () => {
    assert.equal(effectivePermissions('quality', { 'projects.edit': true })['projects.edit'], true);
  });

  it('lets an override revoke a permission the role grants', () => {
    assert.equal(effectivePermissions('sales', { 'projects.edit': false })['projects.edit'], false);
  });

  it('edit implies view regardless of the map', () => {
    const effective = effectivePermissions('quality', {
      'projects.edit': true,
      'projects.view': false,
    });
    assert.equal(effective['projects.view'], true);
  });

  it('ignores unknown keys', () => {
    const effective = effectivePermissions('quality', { 'not-a-key': true });
    assert.equal('not-a-key' in effective, false);
  });
});

describe('hasPermission', () => {
  it('administrators always pass even without a map entry', () => {
    assert.equal(hasPermission({ role: 'administrator' }, 'projects.edit'), true);
  });

  it('checks the resolved map for other roles', () => {
    const user = { role: 'quality' as const, permissions: { 'projects.edit': false } };
    assert.equal(hasPermission(user, 'projects.edit'), false);
    assert.equal(hasPermission(user, 'tasks.manage'), false);
  });
});
