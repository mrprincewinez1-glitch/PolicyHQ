import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const publicRoutes = ["/", "/forgot-password", "/reset-password", "/demo"];
const authRoutes = ["/sign-in", "/sign-up", "/login", "/signup"];
const authRouteAliases: Record<string, string> = {
  "/login": "/sign-in",
  "/signup": "/sign-up"
};

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
    return redirectTo(request, "/dashboard");
  }

  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
