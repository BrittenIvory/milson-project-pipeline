import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { apiErrorMessage, taskCommentsApi, tasksApi, usersApi } from '../lib/api';
import type { TaskPayload } from '../lib/api';
import { PRIORITIES, PROJECT_STAGES, TASK_STATUSES } from '../lib/constants';
import { formatDate, formatDateTime, isOverdue, priorityMeta, stageMeta } from '../lib/format';
import type { ProjectTask, ProjectTaskComment, User } from '../types';

const emptyTask: TaskPayload = {
  taskName: '',
  description: '',
  assignedUserId: null,
  dueDate: '',
  priority: 'medium',
  status: 'not_started',
};

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

function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(@[\w.-]+(?: [A-Za-z-]+)?)/g);
  return (
    <p className="whitespace-pre-line text-sm text-slate-700">
      {parts.map((part, index) =>
        part.startsWith('@') ? (
          <span key={index} className="font-medium text-brand-700">{part}</span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

export default function TasksPanel({
  projectId,
  currentStage,
  onChanged,
}: {
  projectId: number;
  currentStage?: string;
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [comments, setComments] = useState<Record<number, ProjectTaskComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [mentionQueries, setMentionQueries] = useState<Record<number, string | null>>({});
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [pendingCommentDelete, setPendingCommentDelete] = useState<ProjectTaskComment | null>(null);
  const commentRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

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

  const updateStatus = async (task: ProjectTask, status: ProjectTask['status']) => {
    try {
      await tasksApi.update(projectId, task.id, { ...taskToPayload(task), status });
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

  const toggleComments = async (taskId: number) => {
    const next = !expanded[taskId];
    setExpanded((current) => ({ ...current, [taskId]: next }));
    if (next && comments[taskId] === undefined) {
      try {
        const loaded = await taskCommentsApi.list(projectId, taskId);
        setComments((current) => ({ ...current, [taskId]: loaded }));
      } catch (err) {
        setError(apiErrorMessage(err, 'Unable to load comments'));
      }
    }
  };

  const handleCommentDraft = (taskId: number, value: string) => {
    setCommentDrafts((current) => ({ ...current, [taskId]: value }));
    const match = /@([\w.-]*)$/.exec(value);
    setMentionQueries((current) => ({
      ...current,
      [taskId]: match ? match[1].toLowerCase() : null,
    }));
  };

  const applyMention = (taskId: number, name: string) => {
    setCommentDrafts((current) => ({
      ...current,
      [taskId]: (current[taskId] ?? '').replace(/@([\w.-]*)$/, `@${name} `),
    }));
    setMentionQueries((current) => ({ ...current, [taskId]: null }));
    commentRefs.current[taskId]?.focus();
  };

  const addComment = async (taskId: number) => {
    const body = commentDrafts[taskId]?.trim();
    if (!body) return;
    try {
      const comment = await taskCommentsApi.create(projectId, taskId, body);
      setComments((current) => ({ ...current, [taskId]: [...(current[taskId] ?? []), comment] }));
      setCommentDrafts((current) => ({ ...current, [taskId]: '' }));
      setMentionQueries((current) => ({ ...current, [taskId]: null }));
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add comment'));
    }
  };

  const saveComment = async (comment: ProjectTaskComment) => {
    try {
      const updated = await taskCommentsApi.update(projectId, comment.taskId, comment.id, editingBody.trim());
      setComments((current) => ({
        ...current,
        [comment.taskId]: (current[comment.taskId] ?? []).map((item) =>
          item.id === comment.id ? updated : item,
        ),
      }));
      setEditingComment(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update comment'));
    }
  };

  const confirmCommentDelete = async () => {
    if (!pendingCommentDelete) return;
    try {
      await taskCommentsApi.remove(projectId, pendingCommentDelete.taskId, pendingCommentDelete.id);
      setComments((current) => ({
        ...current,
        [pendingCommentDelete.taskId]: (current[pendingCommentDelete.taskId] ?? []).filter(
          (item) => item.id !== pendingCommentDelete.id,
        ),
      }));
      setPendingCommentDelete(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to delete comment'));
    }
  };

  const groups = new Map<string, ProjectTask[]>();
  tasks.forEach((task) => {
    const key = task.stage ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  const orderedGroups = [
    ...PROJECT_STAGES.map((stage) => ({ key: stage.value, tasks: groups.get(stage.value) ?? [] }))
      .filter((group) => group.tasks.length > 0),
    ...(groups.get('other')?.length ? [{ key: 'other', tasks: groups.get('other')! }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500">Work items tracked against this project.</p>
        </div>
        {user && (
          <Button onClick={() => { setEditing(null); setForm(emptyTask); }}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        )}
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Break the project down into assignable work items." />
      ) : (
        <div className="space-y-4">
          {orderedGroups.map((group) => {
            const meta = group.key === 'other'
              ? { label: 'Other', tone: 'bg-slate-100 text-slate-700' }
              : stageMeta(group.key);
            const active = group.key === currentStage;
            return (
              <section key={group.key} className={clsx(
                'overflow-hidden rounded-2xl border bg-white',
                active ? 'border-brand-300 ring-2 ring-brand-100' : 'border-slate-200',
              )}>
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', meta.tone)}>
                      {meta.label}
                    </span>
                    {active && <span className="text-[11px] font-medium text-brand-700">Active stage</span>}
                  </div>
                  <span className="text-xs text-slate-500">{group.tasks.length}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {group.tasks.map((task) => {
                    const overdue = isOverdue(task.dueDate, task.status);
                    const taskComments = comments[task.id] ?? [];
                    const commentCount = comments[task.id]?.length ?? task.commentCount;
                    const query = mentionQueries[task.id];
                    const suggestions = query === null || query === undefined
                      ? []
                      : users.filter((option) => option.fullName.toLowerCase().includes(query)).slice(0, 5);
                    return (
                      <li key={task.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={clsx(
                              'truncate text-sm font-medium',
                              task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800',
                            )}>{task.taskName}</p>
                            {task.description && <p className="truncate text-xs text-slate-500">{task.description}</p>}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <Select
                                aria-label={`Status for ${task.taskName}`}
                                value={task.status}
                                onChange={(e) => updateStatus(task, e.target.value as ProjectTask['status'])}
                                className="h-8 w-32 py-1 text-xs"
                              >
                                {TASK_STATUSES.map((status) => (
                                  <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                              </Select>
                              <Badge tone={priorityMeta(task.priority).tone}>{priorityMeta(task.priority).label}</Badge>
                              <span className="text-xs text-slate-500">{task.assignedUserName ?? 'Unassigned'}</span>
                              {task.dueDate && (
                                <span className={clsx('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-rose-600' : 'text-slate-500')}>
                                  {overdue && <AlertTriangle className="h-3 w-3" />}
                                  Due {formatDate(task.dueDate)}{overdue && ' · Overdue'}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            title="Edit task"
                            aria-label={`Edit ${task.taskName}`}
                            onClick={() => { setEditing(task); setForm(taskToPayload(task)); }}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          ><Pencil className="h-4 w-4" /></button>
                          <button
                            title="Delete task"
                            aria-label={`Delete ${task.taskName}`}
                            onClick={() => setPendingDelete(task)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          ><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleComments(task.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                        >
                          {expanded[task.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          Comments ({commentCount})
                        </button>
                        {expanded[task.id] && (
                          <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
                            {taskComments.map((comment) => (
                              <div key={comment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="text-xs text-slate-500">
                                    <span className="font-medium text-slate-700">{comment.authorName ?? 'Unknown'}</span> · {formatDateTime(comment.createdAt)}
                                  </p>
                                  {(user?.id === comment.authorId || user?.role === 'administrator') && (
                                    <div className="flex gap-1">
                                      <button aria-label="Edit comment" onClick={() => { setEditingComment(comment.id); setEditingBody(comment.body); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                                      <button aria-label="Delete comment" onClick={() => setPendingCommentDelete(comment)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </div>
                                  )}
                                </div>
                                {editingComment === comment.id ? (
                                  <div className="space-y-2">
                                    <TextArea value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                                    <div className="flex justify-end gap-2">
                                      <Button variant="secondary" onClick={() => setEditingComment(null)}>Cancel</Button>
                                      <Button onClick={() => saveComment(comment)}>Save</Button>
                                    </div>
                                  </div>
                                ) : <NoteBody body={comment.body} />}
                              </div>
                            ))}
                            <div className="relative">
                              <TextArea
                                ref={(element) => { commentRefs.current[task.id] = element; }}
                                value={commentDrafts[task.id] ?? ''}
                                onChange={(e) => handleCommentDraft(task.id, e.target.value)}
                                placeholder="Add a comment… use @ to mention someone"
                              />
                              {suggestions.length > 0 && (
                                <div className="absolute z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                  {suggestions.map((option) => (
                                    <button key={option.id} type="button" onClick={() => applyMention(task.id, option.fullName)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{option.fullName}</button>
                                  ))}
                                </div>
                              )}
                              <div className="mt-2 flex justify-end">
                                <Button disabled={!commentDrafts[task.id]?.trim()} onClick={() => addComment(task.id)}>Add comment</Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={form !== null}
        title={editing ? 'Edit task' : 'New task'}
        onClose={() => setForm(null)}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={submit}>{editing ? 'Save task' : 'Create task'}</Button></>}
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Task Name" className="sm:col-span-2"><TextInput value={form.taskName} onChange={(e) => setForm({ ...form, taskName: e.target.value })} placeholder="Review customer drawing" /></Field>
            <Field label="Description" className="sm:col-span-2"><TextArea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Assigned User"><Select value={form.assignedUserId ?? ''} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value ? Number(e.target.value) : null })}><option value="">Unassigned</option>{users.map((option) => <option key={option.id} value={option.id}>{option.fullName}</option>)}</Select></Field>
            <Field label="Due Date"><TextInput type="date" value={form.dueDate ?? ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Field label="Priority"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPayload['priority'] })}>{PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</Select></Field>
            <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskPayload['status'] })}>{TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</Select></Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={pendingDelete !== null} title="Delete task" message={`Delete “${pendingDelete?.taskName}”? This cannot be undone.`} loading={saving} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
      <ConfirmDialog open={pendingCommentDelete !== null} title="Delete comment" message="Delete this comment? This cannot be undone." onConfirm={confirmCommentDelete} onCancel={() => setPendingCommentDelete(null)} />
    </div>
  );
}
