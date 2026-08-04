import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, ErrorBanner, Field, Select, TextArea, TextInput } from './ui';
import { customersApi, usersApi } from '../lib/api';
import type { ProjectPayload } from '../lib/api';
import { PRIORITIES, PROJECT_STAGES } from '../lib/constants';
import type { Customer, Project, User } from '../types';

/** Blank project, defaulted to the Pipeline stage. */
export const emptyProject: ProjectPayload = {
  customerId: 0,
  customerContact: '',
  customerPartNumber: '',
  internalPartNumber: '',
  projectName: '',
  projectDescription: '',
  annualUsage: null,
  material: '',
  estimatedWeight: null,
  castingProcess: '',
  machiningRequired: false,
  heatTreatment: false,
  paintingRequired: false,
  assignedEngineerId: null,
  assignedSalesId: null,
  priority: 'medium',
  targetQuoteDate: null,
  notes: '',
  currentStage: 'pipeline',
};

/** Converts an existing project into editable form state. */
export function projectToPayload(project: Project): ProjectPayload {
  return {
    customerId: project.customerId,
    customerContact: project.customerContact ?? '',
    customerPartNumber: project.customerPartNumber ?? '',
    internalPartNumber: project.internalPartNumber ?? '',
    projectName: project.projectName,
    projectDescription: project.projectDescription ?? '',
    annualUsage: project.annualUsage,
    material: project.material ?? '',
    estimatedWeight: project.estimatedWeight,
    castingProcess: project.castingProcess ?? '',
    machiningRequired: project.machiningRequired,
    heatTreatment: project.heatTreatment,
    paintingRequired: project.paintingRequired,
    assignedEngineerId: project.assignedEngineerId,
    assignedSalesId: project.assignedSalesId,
    priority: project.priority,
    targetQuoteDate: project.targetQuoteDate ? project.targetQuoteDate.slice(0, 10) : null,
    notes: project.notes ?? '',
    currentStage: project.currentStage,
  };
}

interface ProjectFormProps {
  value: ProjectPayload;
  onChange: (value: ProjectPayload) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  /** Read-only project number shown at the top of the form. */
  projectNumber: string;
}

/** Shared create/edit form for a project. */
export default function ProjectForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving,
  error,
  submitLabel,
  projectNumber,
}: ProjectFormProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    customersApi.list({ status: 'active' }).then(setCustomers);
    usersApi.list().then(setUsers);
  }, []);

  const engineers = useMemo(
    () => users.filter((u) => u.role === 'engineering' || u.role === 'administrator'),
    [users],
  );
  const salespeople = useMemo(
    () => users.filter((u) => u.role === 'sales' || u.role === 'administrator'),
    [users],
  );

  const set = <K extends keyof ProjectPayload>(key: K, next: ProjectPayload[K]) =>
    onChange({ ...value, [key]: next });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBanner message={error} />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Project details</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Project Number" hint="Generated automatically">
            <TextInput value={projectNumber} readOnly disabled />
          </Field>
          <Field label="Customer">
            <Select
              required
              value={value.customerId || ''}
              onChange={(e) => set('customerId', Number(e.target.value))}
            >
              <option value="">Select a customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName} ({customer.customerNumber})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer Contact">
            <TextInput
              value={value.customerContact ?? ''}
              onChange={(e) => set('customerContact', e.target.value)}
            />
          </Field>
          <Field label="Project Name">
            <TextInput
              required
              value={value.projectName}
              onChange={(e) => set('projectName', e.target.value)}
            />
          </Field>
          <Field label="Customer Part Number">
            <TextInput
              value={value.customerPartNumber ?? ''}
              onChange={(e) => set('customerPartNumber', e.target.value)}
            />
          </Field>
          <Field label="Internal Part Number">
            <TextInput
              value={value.internalPartNumber ?? ''}
              onChange={(e) => set('internalPartNumber', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Project Description" className="mt-4">
          <TextArea
            value={value.projectDescription ?? ''}
            onChange={(e) => set('projectDescription', e.target.value)}
          />
        </Field>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Manufacturing</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Annual Usage">
            <TextInput
              type="number"
              min={0}
              value={value.annualUsage ?? ''}
              onChange={(e) => set('annualUsage', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="Material">
            <TextInput value={value.material ?? ''} onChange={(e) => set('material', e.target.value)} />
          </Field>
          <Field label="Estimated Weight (lb)">
            <TextInput
              type="number"
              min={0}
              step="0.001"
              value={value.estimatedWeight ?? ''}
              onChange={(e) =>
                set('estimatedWeight', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </Field>
          <Field label="Casting Process">
            <TextInput
              value={value.castingProcess ?? ''}
              onChange={(e) => set('castingProcess', e.target.value)}
              placeholder="Sand, Investment, Die…"
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Checkbox
            label="Machining Required"
            checked={value.machiningRequired}
            onChange={(checked) => set('machiningRequired', checked)}
          />
          <Checkbox
            label="Heat Treatment"
            checked={value.heatTreatment}
            onChange={(checked) => set('heatTreatment', checked)}
          />
          <Checkbox
            label="Painting Required"
            checked={value.paintingRequired}
            onChange={(checked) => set('paintingRequired', checked)}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Ownership &amp; scheduling</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Assigned Engineer">
            <Select
              value={value.assignedEngineerId ?? ''}
              onChange={(e) =>
                set('assignedEngineerId', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Unassigned</option>
              {engineers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned Salesperson">
            <Select
              value={value.assignedSalesId ?? ''}
              onChange={(e) =>
                set('assignedSalesId', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Unassigned</option>
              {salespeople.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={value.priority}
              onChange={(e) => set('priority', e.target.value as ProjectPayload['priority'])}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target Quote Date">
            <TextInput
              type="date"
              value={value.targetQuoteDate ?? ''}
              onChange={(e) => set('targetQuoteDate', e.target.value || null)}
            />
          </Field>
          <Field label="Current Stage">
            <Select
              value={value.currentStage}
              onChange={(e) => set('currentStage', e.target.value)}
            >
              {PROJECT_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" className="mt-4">
          <TextArea value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
