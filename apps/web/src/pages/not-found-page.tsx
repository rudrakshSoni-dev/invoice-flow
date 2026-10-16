import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-text-muted">This page does not exist.</p>
      <Link to="/" className="mt-2 inline-block text-sm text-accent hover:underline">
        Back to invoices
      </Link>
    </div>
  );
}
