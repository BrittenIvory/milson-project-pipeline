import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, PageHeader, Select, Spinner, TextArea, TextInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, suppliersApi } from '../lib/api';
import type { Supplier } from '../types';
import type { SupplierPayload } from '../lib/api';

const emptySupplier: SupplierPayload = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
  isActive: true,
};

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'administrator'
    || user?.role === 'engineering'
    || user?.role === 'sales'
    || user?.role === 'production';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SupplierPayload>(emptySupplier);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSuppliers(await suppliersApi.list(true));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load suppliers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (supplier?: Supplier) => {
    setEditing(supplier ?? null);
    setModalOpen(true);
    setForm(supplier
      ? {
          name: supplier.name,
          contactName: supplier.contactName ?? '',
          email: supplier.email ?? '',
          phone: supplier.phone ?? '',
          notes: supplier.notes ?? '',
          isActive: supplier.isActive,
        }
      : emptySupplier);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await suppliersApi.update(editing.id, form);
      else await suppliersApi.create(form);
      setEditing(null);
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to save supplier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Suppliers"
        description="Maintain the supplier directory used for project quoting."
        actions={canManage && <Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New supplier</Button>}
      />
      <ErrorBanner message={error} />
      <div className="mt-4">
        {loading ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
          : suppliers.length === 0 ? <EmptyState title="No suppliers yet" description="Add suppliers here so they can be selected on quoting tasks." />
          : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td className="px-5 py-3 font-medium text-slate-800">{supplier.name}</td>
                        <td className="px-5 py-3 text-slate-600">{supplier.contactName ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{supplier.email ?? '—'}</td>
                        <td className="px-5 py-3"><Badge tone={supplier.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge></td>
                        <td className="px-5 py-3 text-right">{canManage && <button type="button" aria-label={`Edit ${supplier.name}`} onClick={() => openForm(supplier)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
      </div>
      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.name}` : 'New supplier'}
        onClose={() => { setEditing(null); setModalOpen(false); }}
        footer={<><Button variant="secondary" type="button" onClick={() => { setEditing(null); setModalOpen(false); }}>Cancel</Button><Button type="submit" form="supplier-form" loading={saving}>{editing ? 'Save changes' : 'Create supplier'}</Button></>}
      >
        <form id="supplier-form" onSubmit={save} className="space-y-4">
          <Field label="Supplier name"><TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name"><TextInput value={form.contactName ?? ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
            <Field label="Email"><TextInput type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Status"><Select value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
          </div>
          <Field label="Notes"><TextArea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </form>
      </Modal>
    </div>
  );
}
