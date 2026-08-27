import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canSee, homeFor } from "@/lib/roles";

/**
 * Захищає всі сторінки дашборду. `/login` і `/api/auth/*` — виняток,
 * інакше логін сам себе заблокує нескінченним редіректом.
 *
 * Файл називається `proxy.ts`, не `middleware.ts` — у Next 16 конвенція
 * перейменована (edge runtime тепер лише в старому `middleware`, `proxy`
 * завжди на nodejs). Функцію теж перейменовано на `proxy` за рекомендацією
 * Next, навіть при default-експорті.
 */
export default auth(function proxy(req) {
  const isAuthed = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/api/auth");

  if (isAuthRoute) return NextResponse.next();

  if (!isAuthed) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Роль `operations` бачить лише операційний дашборд. Редірект, а не 404:
  // людина не «залізла кудись не туди», вона просто відкрила корінь сайту
  // або старе посилання — і має опинитись на своєму дашборді, а не на
  // сторінці помилки. Справжній захист самих сторінок лишається в них
  // (`notFound()` у layout продуктової частини): проксі можна обійти
  // прямим запитом до RSC-ендпоінта.
  const role = req.auth?.user?.role;
  if (!canSee(role, req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(homeFor(role), req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Пропускаємо статичні асети й службові файли Next — на них auth-чек
  // не потрібен і тільки додає затримку.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
