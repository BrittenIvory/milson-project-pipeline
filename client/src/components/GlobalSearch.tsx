import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchApi } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import type { Customer, Project } from '../types';

/**
 * Header search box. Results appear as you type (debounced) and Enter opens
 * the full results page.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term, 200);
  const [results, setResults] = useState<{ projects: Project[]; customers: Customer[] }>({
    projects: [],
    customers: [],
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults({ projects: [], customers: [] });
      return;
    }
    let cancelled = false;
    searchApi
      .query(debounced.trim())
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setTerm('');
    navigate(path);
  };

  const hasResults = results.projects.length > 0 || results.customers.length > 0;

  return (
    <div ref={containerRef} className="relative max-w-lg flex-1">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(`/search?q=${encodeURIComponent(term)}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search projects, customers, part numbers…"
          className="input pl-9"
        />
      </form>

      {open && term.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {!hasResults ? (
            <p className="px-4 py-4 text-sm text-slate-500">No matches.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {results.projects.length > 0 && (
                <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Projects
                </p>
              )}
              {results.projects.map((project) => (
                <button
                  key={`project-${project.id}`}
                  onClick={() => go(`/projects/${project.id}`)}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-800">{project.projectName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {project.projectNumber} · {project.customerName}
                  </span>
                </button>
              ))}

              {results.customers.length > 0 && (
                <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Customers
                </p>
              )}
              {results.customers.map((customer) => (
                <button
                  key={`customer-${customer.id}`}
                  onClick={() => go('/customers')}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-800">{customer.companyName}</span>
                  <span className="block text-xs text-slate-500">{customer.customerNumber}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
