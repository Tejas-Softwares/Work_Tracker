export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-white lg:grid-cols-[1fr_440px]">
      <section className="relative hidden overflow-hidden bg-wash lg:block" aria-hidden="true">
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="" className="h-16 w-auto self-start" />
          <div className="max-w-lg">
            <p className="text-[34px] leading-[1.12] font-bold text-navy" style={{ fontStretch: "84%" }}>
              Everyone knows what they own, what&apos;s due, and what&apos;s late.
            </p>
            <p className="mt-4 text-[15px] text-ink-2">Tasks, role cards, meetings and monthly reviews for the Tejas Group office.</p>
          </div>
          <MusterArt />
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </section>
    </div>
  );
}

/** A quiet muster-roll pattern: rows of days, some filled. Decorative. */
function MusterArt() {
  const rows = [
    [3, 2, 3, 3, 2, 3, 3, 2, 3, 3, 2, 3],
    [2, 2, 1, 2, 3, 2, 2, 3, 2, 1, 2, 2],
    [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3, 2],
  ];
  const fill = ["#ffffff", "#c6d1ee", "#7d93cf", "#3f5db0"];
  return (
    <svg viewBox="0 0 300 80" className="w-[360px]">
      {rows.map((r, y) =>
        r.map((v, x) => <rect key={`${x}-${y}`} x={x * 25} y={y * 20} width={20} height={14} rx={3} fill={fill[v]} stroke="#c9cedb" strokeWidth={v ? 0 : 1} />),
      )}
    </svg>
  );
}
