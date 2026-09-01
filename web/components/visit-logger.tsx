"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Повідомляє серверу, на яку сторінку зайшли. Нічого не малює.
 *
 * Клієнтський компонент, бо тільки клієнт знає про ПЕРЕХОДИ: спільний layout
 * при навігації між сторінками не рендериться заново, а серверний компонент
 * і так не знає власного маршруту. `usePathname` бачить обидва випадки —
 * і повне завантаження, і клік у меню.
 *
 * Чому не `after()` в layout — у шапці `app/api/visit/route.ts`.
 */
export function VisitLogger() {
  const pathname = usePathname();
  // Захист від подвійного запису: у режимі розробки React монтує компонент
  // двічі, та й сам `usePathname` може віддати те саме значення повторно.
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;

    /**
     * `keepalive` — щоб запит пережив перехід на іншу сторінку: без нього
     * браузер має право обірвати його разом зі старим документом, і саме
     * останній перегляд (той, після якого людина пішла) губився б найчастіше.
     */
    void fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
      // Журнал другорядний: не вдалось — і не треба, сторінці байдуже.
    }).catch(() => {});
  }, [pathname]);

  return null;
}
