import { Construction } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';

/** Shell page for navigation items that are not part of Phase 1. */
export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Construction className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Coming in a future phase</p>
        <p className="max-w-md text-sm text-slate-500">{description}</p>
      </Card>
    </div>
  );
}
