"use client";

import { Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Світла тема — дефолт: дашборд дивляться вдень і в ньому багато дрібних
 * підписів на графіках. Темна лишається як брендова (айдентика UrbanStack
 * майже вся на чорному), але вибором глядача, не нав'язана.
 *
 * `defaultTheme="light"`, а не `"system"` — інакше двоє людей, яким скинули
 * одне посилання, побачать різні дашборди й почнуть звіряти скріншоти.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // ⚠️ Сервер не знає реальну тему (вона приходить з localStorage), тому
  // `resolvedTheme` на сервері завжди `undefined`. Якщо глядач раніше
  // вмикав темну тему, перший клієнтський рендер одразу після гідратації
  // побачить "dark" — і React ловить mismatch на aria-label ("Світла тема"
  // vs "Темна тема"), бо текст обчислювався з theme-залежного стану
  // синхронно. `mounted` тримає перший клієнтський рендер ідентичним
  // серверному (обидва — "не знаємо"), і лише ПІСЛЯ гідратації, окремим
  // рендером, показує реальний стан.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={
        !mounted ? "Перемкнути тему" : isDark ? "Світла тема" : "Темна тема"
      }
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
