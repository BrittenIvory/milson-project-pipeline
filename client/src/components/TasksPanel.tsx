import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Select,
  SkeletonRows,
  TextArea,
  TextInput,
} from './ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, tasksApi, usersApi } from '../lib/api';
import type { TaskPayload } from '../lib/api';
import { PRIORITIES, TASK_STATUSES } from '../lib/constants';
import { formatDate, isOverdue, priorityMeta, taskStatusMeta } from '../lib/format';
import type { ProjectTask, User } from '../types';

const emptyTask: TaskPayload = {
  taskName: '',
  description: '',
  assignedUserId: null,
  dueDate: '',
  priority: 'medium',
  status: 'not_started',
};

/** Strips the read-only fields so an existing task can be edited in the form. */
function taskToPayload(task: ProjectTask): TaskPayload {
  return {
    taskName: task.taskName,
    description: task.description ?? '',
    assignedUserId: task.assignedUserId,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    priority: task.priority,
    status: task.status,
  };
}

/** Task list for a project: create, assign, complete and delete tasks. */
export default function TasksPanel({
  projectId,
  onChanged,
}: {
  projectId: number;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [form, setForm] = useState<TaskPayload | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectTask | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await tasksApi.list(projectId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load tasks'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    usersApi.list().then(setUsers).catch(() => undefined);
  }, [load]);

  const submit = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) await tasksApi.update(projectId, editing.id, form);
      else await tasksApi.create(projectId, form);
      setForm(null);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to save task'));
    } finally {
      setSaving(false);
    }
  };

  /** Completing from the checkbox reuses the update endpoint. */
  const toggleComplete = async (task: ProjectTask) => {
    try {
      await tasksApi.update(projectId, task.id, {
        ...taskToPayload(task),
        status: task.status === 'completed' ? 'in_progress' : 'completed',
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update task'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await tasksApi.remove(projectId, pendingDelete.id);
      setPendingDelete(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to delete task'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500">Work items tracked against this project.</p>
        </div>
        {user && (
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptyTask);
            }}
          >
            <Plus className="h-4 w-4" /> New task
          </Button>
        )}
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Break the project down into assignable work items."
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            return (
              <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`Complete ${task.taskName}`}
                  checked={task.status === 'completed'}
                  onChange={() => toggleComplete(task)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      'truncate text-sm font-medium',
                      task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800',
                    )}
                  >
                    {task.taskName}
                  </p>
                  {task.description && (
                    <p className="truncate text-xs text-slate-500">{task.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone={taskStatusMeta(task.status).tone}>
                      {taskStatusMeta(task.status).label}
                    </Badge>
                    <Badge tone={priorityMeta(task.priority).tone}>
                      {priorityMeta(task.priority).label}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {task.assignedUserName ?? 'Unassigned'}
                    </span>
                    {task.dueDate && (
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 text-xs',
                          overdue ? 'font-medium text-rose-600' : 'text-slate-500',
                        )}
                      >
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        Due {formatDate(task.dueDate)}
                        {overdue && ' · Overdue'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  title="Edit task"
                  aria-label={`Edit ${task.taskName}`}
                  onClick={() => {
                    setEditing(task);
                    setForm(taskToPayload(task));
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  title="Delete task"
                  aria-label={`Delete ${task.taskName}`}
                  onClick={() => setPendingDelete(task)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={form !== null}
        title={editing ? 'Edit task' : 'New task'}
        onClose={() => setForm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submit}>
              {editing ? 'Save task' : 'Create task'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Task Name" className="sm:col-span-2">
              <TextInput
                value={form.taskName}
                onChange={(e) => setForm({ ...form, taskName: e.target.value })}
                placeholder="Review customer drawing"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextArea
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Assigned User">
              <Select
                value={form.assignedUserId ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assignedUserId: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {users.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due Date">
              <TextInput
                type="date"
                value={form.dueDate ?? ''}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as TaskPayload['priority'] })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TaskPayload['status'] })
                }
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete task"
        message={`Delete “${pendingDelete?.taskName}”? This cannot be undone.`}
        loading={saving}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
