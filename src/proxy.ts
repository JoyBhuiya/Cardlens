import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the Supabase session cookie and guards /app routes. */
export async function proxy(request: NextRequest) {
  // Supabase sends auth errors (e.g. an expired or already-used magic link) to the Site URL
  // with ?error_code=…; send the person to sign-in with a clear message instead.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("error_code")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "?error=link";
    return NextResponse.redirect(login);
  }
  if (request.nextUrl.pathname === "/") return NextResponse.next();
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && path.startsWith("/app")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (user && path === "/login") {
    const app = request.nextUrl.clone();
    app.pathname = "/app";
    app.search = "";
    return NextResponse.redirect(app);
  }
  return response;
}

export const config = {
  matcher: ["/", "/app/:path*", "/login", "/api/:path*"],
};
