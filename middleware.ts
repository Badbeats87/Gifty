// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isLogin = pathname.startsWith("/admin/login");
  const isSession = pathname.startsWith("/api/admin/session");
  const isLogout = pathname.startsWith("/admin/logout");
  if (isLogin || isSession || isLogout) return NextResponse.next();

  const authed = req.cookies.get("admin_ok")?.value === "1";
  const isAdminPath = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if ((isAdminPath || isAdminApi) && !authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + (search || ""))}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
