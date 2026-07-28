import { Field, Select, TextInput } from './ui';
import { PRIORITIES, PROJECT_STAGES } from '../lib/constants';
import type { Customer, ProjectFilters, User } from '../types';

interface ProjectFilterBarProps {
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  customers: Customer[];
  users: User[];
  materials: string[];
  castingProcesses: string[];
}

/**
 * Filter panel for the Projects page. All filters combine with AND; changing
 * any of them replaces the whole filter object so the page can reset paging.
 */
export default function ProjectFilterBar({
  filters,
  onChange,
  customers,
  users,
  materials,
  castingProcesses,
}: ProjectFilterBarProps) {
  const set = (patch: Partial<ProjectFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Customer">
        <Select
          value={filters.customerId ?? ''}
          onChange={(e) => set({ customerId: e.target.value ? Number(e.target.value) : '' })}
        >
          <option value="">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.companyName}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Engineer">
        <Select
          value={filters.engineerId ?? ''}
          onChange={(e) => set({ engineerId: e.target.value ? Number(e.target.value) : '' })}
        >
          <option value="">All engineers</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Salesperson">
        <Select
          value={filters.salesId ?? ''}
          onChange={(e) => set({ salesId: e.target.value ? Number(e.target.value) : '' })}
        >
          <option value="">All salespeople</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Current Stage">
        <Select value={filters.stage ?? ''} onChange={(e) => set({ stage: e.target.value })}>
          <option value="">All stages</option>
          {PROJECT_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Priority">
        <Select value={filters.priority ?? ''} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Material">
        <Select value={filters.material ?? ''} onChange={(e) => set({ material: e.target.value })}>
          <option value="">All materials</option>
          {materials.map((material) => (
            <option key={material} value={material}>
              {material}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Casting Process">
        <Select
          value={filters.castingProcess ?? ''}
          onChange={(e) => set({ castingProcess: e.target.value })}
        >
          <option value="">All processes</option>
          {castingProcesses.map((process) => (
            <option key={process} value={process}>
              {process}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date Created (from / to)">
        <div className="flex gap-2">
          <TextInput
            type="date"
            value={filters.createdFrom ?? ''}
            onChange={(e) => set({ createdFrom: e.target.value })}
          />
          <TextInput
            type="date"
            value={filters.createdTo ?? ''}
            onChange={(e) => set({ createdTo: e.target.value })}
          />
        </div>
      </Field>

      <Field label="Last Updated (from / to)">
        <div className="flex gap-2">
          <TextInput
            type="date"
            value={filters.updatedFrom ?? ''}
            onChange={(e) => set({ updatedFrom: e.target.value })}
          />
          <TextInput
            type="date"
            value={filters.updatedTo ?? ''}
            onChange={(e) => set({ updatedTo: e.target.value })}
          />
        </div>
      </Field>

      <Field label="Target Quote Date (from / to)">
        <div className="flex gap-2">
          <TextInput
            type="date"
            value={filters.targetFrom ?? ''}
            onChange={(e) => set({ targetFrom: e.target.value })}
          />
          <TextInput
            type="date"
            value={filters.targetTo ?? ''}
            onChange={(e) => set({ targetTo: e.target.value })}
          />
        </div>
      </Field>
    </div>
  );
}
