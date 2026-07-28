import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { searchApi } from '../lib/api';
import { customerStatusMeta, orDash, stageMeta } from '../lib/format';
import type { Customer, Project } from '../types';

/** Results for the global search box in the top bar. */
export default function SearchPage() {
  const [params] = useSearchParams();
  const term = params.get('q') ?? '';
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!term) {
      setProjects([]);
      setCustomers([]);
      return;
    }
    setLoading(true);
    searchApi
      .query(term)
      .then((result) => {
        setProjects(result.projects);
        setCustomers(result.customers);
      })
      .finally(() => setLoading(false));
  }, [term]);

  const empty = !loading && projects.length === 0 && customers.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Search" description={term ? `Results for “${term}”` : 'Enter a search term'} />

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      )}

      {empty && term && (
        <EmptyState
          title="No matches"
          description="Try a project number, project name, customer or part number."
        />
      )}

      {projects.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Projects</h2>
          <ul className="divide-y divide-slate-100">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {project.projectNumber} · {project.projectName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {orDash(project.customerName)} · {orDash(project.customerPartNumber)}
                    </p>
                  </div>
                  <Badge tone={stageMeta(project.currentStage).tone}>
                    {stageMeta(project.currentStage).label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {customers.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Customers</h2>
          <ul className="divide-y divide-slate-100">
            {customers.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {customer.companyName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{customer.customerNumber}</p>
                </div>
                <Badge tone={customerStatusMeta(customer.status).tone}>
                  {customerStatusMeta(customer.status).label}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
