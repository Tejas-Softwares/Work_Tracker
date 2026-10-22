import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="page-title">Not found</h1>
      <p className="mt-2 text-[14px] text-ink-2">It may have been deleted, or it belongs to someone outside your team.</p>
      <Link className="btn mt-5" href="/my">
        Go to My work
      </Link>
    </div>
  );
}
