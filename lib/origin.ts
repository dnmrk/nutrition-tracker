import type { NextRequest } from "next/server";

// Next dev rewrites request.url's host to "localhost"; redirects must stay on the host the browser used.
export function absoluteUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  return new URL(path, `${request.nextUrl.protocol}//${host}`);
}
