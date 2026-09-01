import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { logVisit } from "@/lib/visits";

/**
 * Запис відвідування. Приймає лише маршрут; хто саме — беремо з СЕСІЇ, а не
 * з тіла запиту: інакше будь-хто дописав би в журнал що завгодно від чужого
 * імені.
 *
 * ── Чому окремий ендпоінт, а не `after()` в layout ────────────────────────
 * Перша версія писала журнал прямо з layout через `after()` і брала маршрут
 * із заголовка. Не працювало взагалі — жодного рядка за півдня. Причина в
 * документації Next чорним по білому: серверні компоненти (включно з
 * layout) НЕ МОЖУТЬ використовувати `headers()` і `cookies()` всередині
 * `after` — це дозволено лише в Route Handlers і Server Functions. Виклик
 * кидав виняток до того, як справа доходила до запису, а `try/catch` сидів
 * усередині `logVisit`, куди управління не потрапляло.
 *
 * Друга, не менш важлива причина: layout при переходах між сторінками
 * НЕ рендериться заново — він спільний. Тобто навіть якби запис працював,
 * він ловив би лише повні завантаження, а не переходи.
 *
 * Тут обидві проблеми зникають: Route Handler виконується на кожен запит і
 * має повне право на request-API, а маршрут надсилає клієнт, який точно
 * знає, де він.
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });

  let path = "/";
  try {
    const body = (await req.json()) as { path?: unknown };
    // Беремо лише те, що схоже на внутрішній маршрут: у журналі не місце
    // ні абсолютним посиланням, ні параметрам запиту.
    if (typeof body.path === "string" && body.path.startsWith("/")) {
      path = body.path.split("?")[0].slice(0, 200);
    }
  } catch {
    // Тіла немає або це не JSON — запишемо корінь, ніж нічого.
  }

  await logVisit(email, path);
  return NextResponse.json({ ok: true });
}
