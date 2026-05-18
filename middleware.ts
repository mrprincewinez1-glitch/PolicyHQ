import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const publicRoutes = ["/", "/forgot-password", "/reset-password", "/demo", "/privacy", "/terms", "/feedback"];
const authRoutes = ["/sign-in", "/sign-up", "/login", "/signup"];
const authRouteAliases: Record<string, string> = {
  "/login": "/sign-in",
  "/signup": "/sign-up"
};
const inactivityCookieName = "policyhq_last_active";
const inactivityTimeoutMs = 8 * 60 * 60 * 1000;

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isPublicRoute(pathname: string) {
  return matchesRoute(pathname, publicRoutes);
}

function isAuthRoute(pathname: string) {
  return matchesRoute(pathname, authRoutes);
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

function clearInactivityCookie(response: NextResponse) {
  response.cookies.set(inactivityCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

function setInactivityCookie(response: NextResponse) {
  response.cookies.set(inactivityCookieName, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(inactivityTimeoutMs / 1000)
  });
}

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "true") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const aliasPath = authRouteAliases[pathname];

  if (aliasPath) {
    return redirectTo(request, aliasPath);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isPublicRoute(pathname) || isAuthRoute(pathname)) {
      return NextResponse.next();
    }

    return redirectTo(request, "/sign-in");
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce"
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();

  if (data.user && isAuthRoute(pathname)) {
    const redirectResponse = redirectTo(request, "/dashboard");
    setInactivityCookie(redirectResponse);
    return redirectResponse;
  }

  if (!data.user && isAuthRoute(pathname)) {
    return response;
  }

  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(url);
    clearInactivityCookie(redirectResponse);
    return redirectResponse;
  }

  const lastActiveValue = request.cookies.get(inactivityCookieName)?.value;
  const lastActive = lastActiveValue ? Number(lastActiveValue) : Date.now();

  if (!Number.isFinite(lastActive) || Date.now() - lastActive > inactivityTimeoutMs) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("error", "Your session expired after 8 hours of inactivity. Please sign in again.");
    const redirectResponse = NextResponse.redirect(url);
    clearInactivityCookie(redirectResponse);
    return redirectResponse;
  }

  setInactivityCookie(response);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
