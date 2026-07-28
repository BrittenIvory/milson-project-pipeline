import { useCallback, useEffect, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import CustomerFormModal from '../components/CustomerFormModal';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Select, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, customersApi } from '../lib/api';
import { CUSTOMER_STATUSES } from '../lib/constants';
import { customerStatusMeta, orDash } from '../lib/format';
import type { Customer } from '../types';

/** Customer directory with search, status filter and create/edit/archive actions. */
export default function CustomersPage() {
  const { canEdit } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCustomers(await customersApi.list({ search: search || undefined, status }));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load customers'));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleArchive = async (customer: Customer) => {
    try {
      if (customer.status === 'archived') {
        await customersApi.restore(customer.id);
      } else {
        await customersApi.archive(customer.id);
      }
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update customer'));
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Customers"
        description="Every company Milson quotes and produces for."
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          )
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search by company, number, contact or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="sm:w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {CUSTOMER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="mb-4">
        <ErrorBanner message={error} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Adjust your search or create your first customer record."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Number</th>
                  <th className="px-5 py-3 font-semibold">Primary Contact</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium text-slate-800">{customer.companyName}</td>
                    <td className="px-5 py-3 text-slate-600">{customer.customerNumber}</td>
                    <td className="px-5 py-3 text-slate-600">{orDash(customer.primaryContact)}</td>
                    <td className="px-5 py-3 text-slate-600">{orDash(customer.email)}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {[customer.state, customer.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={customerStatusMeta(customer.status).tone}>
                        {customerStatusMeta(customer.status).label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit"
                            onClick={() => {
                              setEditing(customer);
                              setModalOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title={customer.status === 'archived' ? 'Restore' : 'Archive'}
                            onClick={() => toggleArchive(customer)}
                          >
                            {customer.status === 'archived' ? (
                              <RotateCcw className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        customer={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
