import { Link } from 'react-router-dom';

/**
 * Renders a part number as a link to its part page. Falls back to plain text
 * ('—' when empty) when there is nothing to link to.
 */
export default function PartLink({
  partNumber,
  children,
}: {
  partNumber: string | null | undefined;
  children?: React.ReactNode;
}) {
  if (!partNumber) return <>{children ?? '—'}</>;
  return (
    <Link
      to={`/parts/${encodeURIComponent(partNumber)}`}
      className="text-brand-700 hover:underline"
    >
      {children ?? partNumber}
    </Link>
  );
}
