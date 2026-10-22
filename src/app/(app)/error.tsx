"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="page-title">This page didn&apos;t load</h1>
      <p className="mt-2 text-[14px] text-ink-2">{error.message && error.message.length < 160 ? error.message : "Something went wrong on our side. Try again; if it keeps happening, tell the admin."}</p>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a className="btn" href="/my">
          Go to My work
        </a>
      </div>
    </div>
  );
}
