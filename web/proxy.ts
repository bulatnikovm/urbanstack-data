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

  // Сторінка поза областями цієї людини. Редірект, а не 404: вона не
  // «залізла кудись не туди», вона просто відкрила корінь сайту або старе
  // посилання — і має опинитись на своєму дашборді, а не на сторінці
  // помилки. Справжній захист самих сторінок лишається в них
  // (`requireAccess` → notFound): проксі можна обійти прямим запитом до
  // RSC-ендпоінта.
  const access = req.auth?.user;
  if (!canSee(access, req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(homeFor(access), req.nextUrl.origin));
  }

  /**
   * Прокидаємо маршрут у заголовок запиту — layout інакше його не знає.
   *
   * Серверний компонент не має доступу до свого URL (це не помилка, а
   * дизайн: так layout лишається однаковим для всіх сторінок). А журналу
   * відвідувань потрібно саме «на яку сторінку зайшли», тож шлях кладе сюди
   * той, хто його бачить, — проксі.
   *
   * ⚠️ Локально, коли proxy.ts свідомо відкладений для перегляду без
   * логіна, заголовка немає, і журнал запише «/». На проді проксі є завжди.
   */
  const withPath = new Headers(req.headers);
  withPath.set("x-current-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: withPath } });
});

export const config = {
  // Пропускаємо статичні асети й службові файли Next — на них auth-чек
  // не потрібен і тільки додає затримку.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
