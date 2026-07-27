import { useEffect, useState } from 'react';
import { Button, ErrorBanner, Field, Modal, Select, TextArea, TextInput } from './ui';
import { apiErrorMessage, customersApi } from '../lib/api';
import type { CustomerPayload } from '../lib/api';
import { CUSTOMER_STATUSES } from '../lib/constants';
import type { Customer } from '../types';

const emptyCustomer: CustomerPayload = {
  companyName: '',
  customerNumber: '',
  primaryContact: '',
  secondaryContact: '',
  email: '',
  phone: '',
  website: '',
  billingAddress: '',
  shippingAddress: '',
  country: '',
  state: '',
  notes: '',
  status: 'active',
};

/** Create/edit dialog for a customer record. */
export default function CustomerFormModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}) {
  const [form, setForm] = useState<CustomerPayload>(emptyCustomer);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      customer
        ? {
            companyName: customer.companyName,
            customerNumber: customer.customerNumber,
            primaryContact: customer.primaryContact ?? '',
            secondaryContact: customer.secondaryContact ?? '',
            email: customer.email ?? '',
            phone: customer.phone ?? '',
            website: customer.website ?? '',
            billingAddress: customer.billingAddress ?? '',
            shippingAddress: customer.shippingAddress ?? '',
            country: customer.country ?? '',
            state: customer.state ?? '',
            notes: customer.notes ?? '',
            status: customer.status,
          }
        : emptyCustomer,
    );
  }, [open, customer]);

  const set = <K extends keyof CustomerPayload>(key: K, value: CustomerPayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = customer
        ? await customersApi.update(customer.id, form)
        : await customersApi.create(form);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to save customer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={customer ? `Edit ${customer.companyName}` : 'New Customer'}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={saving}>
            {customer ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company Name">
            <TextInput
              required
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          </Field>
          <Field label="Customer Number">
            <TextInput
              required
              value={form.customerNumber}
              onChange={(e) => set('customerNumber', e.target.value)}
              placeholder="C-1001"
            />
          </Field>
          <Field label="Primary Contact">
            <TextInput
              value={form.primaryContact ?? ''}
              onChange={(e) => set('primaryContact', e.target.value)}
            />
          </Field>
          <Field label="Secondary Contact">
            <TextInput
              value={form.secondaryContact ?? ''}
              onChange={(e) => set('secondaryContact', e.target.value)}
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Website">
            <TextInput
              value={form.website ?? ''}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value as CustomerPayload['status'])}
            >
              {CUSTOMER_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Country">
            <TextInput
              value={form.country ?? ''}
              onChange={(e) => set('country', e.target.value)}
            />
          </Field>
          <Field label="State / Province">
            <TextInput value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="Billing Address">
            <TextArea
              value={form.billingAddress ?? ''}
              onChange={(e) => set('billingAddress', e.target.value)}
            />
          </Field>
          <Field label="Shipping Address">
            <TextArea
              value={form.shippingAddress ?? ''}
              onChange={(e) => set('shippingAddress', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
