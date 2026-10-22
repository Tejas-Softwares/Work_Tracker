import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/signup/, /^\/setup/, /^\/pending/, /^\/reset\//, /^\/recover/, /^\/not-ready/, /^\/api\/cron\//, /^\/manifest\.webmanifest$/];

/**
 * Runs before every page: sends people without a session cookie to sign in (pages check the session
 * properly themselves) and sets a Content Security Policy with a fresh nonce for Next.js's scripts.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("twt_session")?.value);
  if (!hasSession && !PUBLIC.some((re) => re.test(pathname)) && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" || pathname === "/my" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|fonts/|brand/|icon.png|apple-icon.png|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
