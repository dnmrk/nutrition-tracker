import { NextResponse } from "next/server";

// Relative Location (RFC 9110): never derived from the request's Host, so no open redirect,
// and the browser resolves it against the host it used (keeps 127.0.0.1 cookies intact).
export function redirectTo(path: string, status = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
