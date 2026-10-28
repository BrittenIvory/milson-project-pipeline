import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, KeyRound, Plus, ShieldAlert, SlidersHorizontal, UserCheck, UserX } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  TextArea,
  TextInput,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, projectTypesApi, usersApi } from '../lib/api';
import {
  effectivePermission,
  PERMISSIONS,
  ROLE_LABELS,
  type Permission,
} from '../lib/constants';
import type { ManagedUser, ProjectType, Role, TemplateStage } from '../types';

const ROLE_OPTIONS: Role[] = ['administrator', 'engineering', 'sales', 'production', 'quality'];

/** One-shot display of a generated temporary password. */
function TempPasswordBanner({
  email,
  password,
  onDone,
}: {
  email: string;
  password: string;
  onDone: () => void;
}) {
  return (
    <Modal open title="Temporary password" onClose={onDone} width="max-w-md"
      footer={<Button onClick={onDone}>Done</Button>}>
      <p className="text-sm text-slate-600">
        Share this temporary password with <span className="font-medium">{email}</span>. It is shown
        only once; the user must set a new password at their next sign-in.
      </p>
      <p className="mt-3 select-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center font-mono text-sm">
        {password}
      </p>
    </Modal>
  );
}

/** Administrator user management: create, deactivate/reactivate, reset passwords. */
export default function SettingsPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<ManagedUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    usersApi
      .manage()
      .then(setUsers)
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load users')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  const toggleActive = async (u: ManagedUser) => {
    setBusyId(u.id);
    setError(null);
    try {
      await usersApi.update(u.id, { isActive: !u.isActive });
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update user'));
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (u: ManagedUser) => {
    setBusyId(u.id);
    setError(null);
    try {
      const { temporaryPassword } = await usersApi.resetPassword(u.id);
      setTempPassword({ email: u.email, password: temporaryPassword });
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to reset password'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description="Manage your account and employee access"
        actions={
          <Button variant="secondary" onClick={() => navigate('/change-password')}>
            Change my password
          </Button>
        }
      />

      {!isAdmin ? (
        <Card className="p-4 text-sm text-slate-500">
          User management is only available to administrators. Use the button above to change your
          own password.
        </Card>
      ) : loading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : (
        <div className="space-y-3">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">User Management</h2>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New user
            </Button>
          </div>
          <div className="px-4 py-3">
            <ErrorBanner message={error} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {u.fullName}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-slate-400">(you)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={u.role === 'administrator' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                      {u.mustChangePassword && (
                        <span className="ml-2 text-xs text-amber-600">Password reset pending</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          disabled={busyId === u.id}
                          onClick={() => setPermissionsUser(u)}
                          title="Edit permissions"
                        >
                          <SlidersHorizontal className="h-4 w-4" /> Permissions
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busyId === u.id}
                          onClick={() => resetPassword(u)}
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" /> Reset
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busyId === u.id || u.id === currentUser?.id}
                          onClick={() => toggleActive(u)}
                          title={u.isActive ? 'Deactivate account' : 'Reactivate account'}
                        >
                          {u.isActive ? (
                            <>
                              <UserX className="h-4 w-4" /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4" /> Reactivate
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              Deactivated users are signed out immediately and cannot log in. There is no public
              sign-up; accounts are created here only.
            </p>
          </div>
        </Card>
        <ProjectTypesCard />
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(email, password) => {
            setShowCreate(false);
            load();
            setTempPassword({ email, password });
          }}
        />
      )}
      {permissionsUser && (
        <PermissionsModal
          managedUser={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={() => {
            setPermissionsUser(null);
            load();
          }}
          onError={(message) => setError(message)}
        />
      )}
      {tempPassword && (
        <TempPasswordBanner
          email={tempPassword.email}
          password={tempPassword.password}
          onDone={() => setTempPassword(null)}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string, tempPassword: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('engineering');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { temporaryPassword } = await usersApi.create({
        email,
        fullName,
        role,
        ...(password ? { password } : {}),
      });
      onCreated(email, temporaryPassword);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to create user'));
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title="New employee account"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-user-form" loading={loading}>Create account</Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Full name">
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Temporary password"
          hint="Leave blank to generate one. The employee must change it at first sign-in."
        >
          <TextInput
            type="text"
            autoComplete="off"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Auto-generate"
          />
        </Field>
      </form>
    </Modal>
  );
}

/** Per-user permission editor: checkboxes for each capability the server enforces. */
function PermissionsModal({
  managedUser,
  onClose,
  onSaved,
  onError,
}: {
  managedUser: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const isAdminRole = managedUser.role === 'administrator';
  const [overrides, setOverrides] = useState<Record<string, boolean>>({
    ...(managedUser.permissions ?? {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = (key: Permission) => {
    if (isAdminRole) return true;
    if (effectivePermission(managedUser.role, overrides, key)) return true;
    // An edit grant implies the matching view, mirroring the server.
    if (key.endsWith('.view')) {
      const editKey = `${key.slice(0, -'.view'.length)}.edit` as Permission;
      return effectivePermission(managedUser.role, overrides, editKey);
    }
    return false;
  };

  const toggle = (key: Permission) => {
    setOverrides((current) => ({ ...current, [key]: !effectivePermission(managedUser.role, current, key) }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await usersApi.update(managedUser.id, { permissions: overrides });
      onSaved();
    } catch (err) {
      const message = apiErrorMessage(err, 'Unable to update permissions');
      setError(message);
      onError(message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Permissions — ${managedUser.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={isAdminRole}>Save</Button>
        </>
      }
    >
      <ErrorBanner message={error} />
      {isAdminRole ? (
        <p className="text-sm text-slate-600">
          Administrators always have full access and cannot be restricted.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {ROLE_LABELS[managedUser.role]} defaults are shown; your changes override them for this
            user only. An edit permission also grants the matching view permission.
          </p>
          <ul className="mt-4 space-y-2.5">
            {PERMISSIONS.map(({ key, label }) => {
              // View can't be revoked while its edit grant is on.
              const impliedByEdit =
                key.endsWith('.view') &&
                effectivePermission(
                  managedUser.role,
                  overrides,
                  `${key.slice(0, -'.view'.length)}.edit` as Permission,
                );
              return (
                <li key={key} className="flex items-center gap-3">
                  <input
                    id={`perm-${key}`}
                    type="checkbox"
                    checked={effective(key)}
                    disabled={impliedByEdit}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor={`perm-${key}`} className="text-sm text-slate-700">
                    {label}
                    {impliedByEdit && (
                      <span className="ml-1 text-xs text-slate-400">(granted by edit)</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Administrator management of the project type labels shown on projects. */
function ProjectTypesCard() {
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectType | null>(null);
  const [templateFor, setTemplateFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    projectTypesApi
      .list(true)
      .then(setTypes)
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load project types')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to save project type'));
    } finally {
      setBusy(false);
    }
  };

  const addType = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    void run(() => projectTypesApi.create({ name }));
  };

  const saveRename = () => {
    if (!editing || !editing.name.trim()) return;
    const current = types.find((t) => t.id === editing.id);
    void run(() =>
      projectTypesApi.update(editing.id, {
        name: editing.name.trim(),
        sortOrder: current?.sortOrder,
        isActive: current?.isActive,
      }),
    );
    setEditing(null);
  };

  const toggleActive = (type: ProjectType) =>
    run(() =>
      projectTypesApi.update(type.id, {
        name: type.name,
        sortOrder: type.sortOrder,
        isActive: !type.isActive,
      }),
    );

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Project Types</h2>
        <form onSubmit={addType} className="flex items-center gap-2">
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New type name"
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" /> Add type
          </Button>
        </form>
      </div>
      <div className="px-4 py-3">
        <ErrorBanner message={error} />
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <Fragment key={type.id}>
                <tr className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {editing?.id === type.id ? (
                      <div className="flex items-center gap-2">
                        <TextInput
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          autoFocus
                        />
                        <Button variant="ghost" disabled={busy} onClick={saveRename}>
                          Save
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      type.name
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={type.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                      {type.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {editing?.id !== type.id && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setEditing({ id: type.id, name: type.name })}
                        >
                          Rename
                        </Button>
                      )}
                      <Button variant="ghost" disabled={busy} onClick={() => toggleActive(type)}>
                        {type.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setTemplateFor(templateFor === type.id ? null : type.id)}
                      >
                        {templateFor === type.id ? 'Close template' : 'Template'}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setPendingDelete(type)}
                        title="Delete type"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
                {templateFor === type.id && (
                  <tr className="border-b border-slate-100 last:border-0">
                    <td colSpan={3} className="py-3">
                      <TemplateEditor typeId={type.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          Types label projects for filtering and reporting. Deactivated types stay on existing
          projects but can no longer be selected; deleting one clears it from its projects.
        </p>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project type"
        message={`Delete the project type "${pendingDelete?.name}"? Projects using it lose the label. This cannot be undone.`}
        confirmLabel="Delete type"
        loading={busy}
        onConfirm={() => {
          const type = pendingDelete;
          setPendingDelete(null);
          if (type) void run(() => projectTypesApi.remove(type.id));
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}

/** Editable stage/task template for one project type. Saving bumps the
 * template version; existing projects adopt it only via "Update to new
 * template" inside the project. */
function TemplateEditor({ typeId }: { typeId: number }) {
  const [stages, setStages] = useState<TemplateStage[] | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState('');

  useEffect(() => {
    projectTypesApi
      .template(typeId)
      .then((template) => {
        setStages(template.stages);
        setVersion(template.version);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load the template')));
  }, [typeId]);

  const update = (index: number, changes: Partial<TemplateStage>) =>
    setStages((current) =>
      current ? current.map((s, i) => (i === index ? { ...s, ...changes } : s)) : current,
    );

  const move = (index: number, direction: -1 | 1) =>
    setStages((current) => {
      if (!current) return current;
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addStage = () => {
    const label = newStageLabel.trim();
    if (!label || !stages) return;
    let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) key = 'custom_stage';
    let candidate = key;
    let n = 1;
    while (stages.some((s) => s.key === candidate)) candidate = `${key}_${++n}`;
    setStages([...stages, { key: candidate, label, tasks: [] }]);
    setNewStageLabel('');
  };

  const save = () => {
    if (!stages) return;
    setBusy(true);
    setError(null);
    setSavedNote(null);
    projectTypesApi
      .saveTemplate(
        typeId,
        stages.map((s) => ({
          key: s.key,
          label: s.label.trim() || s.key,
          tasks: s.tasks.map((t) => t.trim()).filter(Boolean),
        })),
      )
      .then((result) => {
        setVersion(result.version);
        setSavedNote(
          `Template saved as version ${result.version}. New projects of this type get it automatically; existing projects update only when someone applies the new template inside the project.`,
        );
      })
      .catch((err) => setError(apiErrorMessage(err, 'Unable to save the template')))
      .finally(() => setBusy(false));
  };

  if (!stages) {
    return error ? <ErrorBanner message={error} /> : <SkeletonRows rows={3} />;
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">
          Workflow template <span className="font-normal text-slate-400">(v{version || 'default'})</span>
        </p>
        <Button loading={busy} onClick={save}>Save template</Button>
      </div>
      <ErrorBanner message={error} />
      {savedNote && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{savedNote}</p>}
      {stages.map((stage, index) => (
        <div key={stage.key} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                aria-label="Move stage up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === stages.length - 1}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                aria-label="Move stage down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <TextInput
              value={stage.label}
              onChange={(e) => update(index, { label: e.target.value })}
              aria-label="Stage name"
            />
            <Button
              variant="ghost"
              onClick={() => setStages((current) => current!.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
          <TextArea
            value={stage.tasks.join('\n')}
            onChange={(e) => update(index, { tasks: e.target.value.split('\n') })}
            placeholder="Checklist tasks, one per line"
            rows={3}
          />
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addStage();
        }}
        className="flex items-center gap-2"
      >
        <TextInput
          value={newStageLabel}
          onChange={(e) => setNewStageLabel(e.target.value)}
          placeholder="New stage name"
        />
        <Button type="submit" variant="secondary" disabled={!newStageLabel.trim()}>
          <Plus className="h-4 w-4" /> Add stage
        </Button>
      </form>
      <p className="text-xs text-slate-400">
        Saving updates the template only — existing projects keep their current stages and tasks
        until someone opens the project and chooses &quot;Update to new template&quot;.
      </p>
    </div>
  );
}
