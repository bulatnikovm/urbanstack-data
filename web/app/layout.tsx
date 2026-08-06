import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
import "./globals.css";

/**
 * Кирилиця обов'язкова — увесь інтерфейс українською. Geist зі скафолду має
 * тільки latin.
 *
 * ⚠️ Імена змінних мають бути саме --font-sans / --font-mono: globals.css
 * містить `@theme inline { --font-sans: var(--font-sans) }`, тобто Tailwind
 * бере токен з CSS-змінної з ТИМ САМИМ іменем. Зі скафолдним
 * `--font-geist-sans` вона не визначена, `font-sans` не резолвиться, і вся
 * сторінка падає на дефолтний серифний шрифт браузера.
 */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Продуктовий дашборд UrbanStack",
  description:
    "Продуктові метрики UrbanStack — аудиторія, активація, залученість, STAR",
  // Іконка вкладки — `app/icon.svg`, Next підхоплює її за конвенцією.
  // Кольори там зафіксовані (чорна плашка, білі літери): favicon малюється
  // поза сторінкою, `currentColor` там нема від чого успадковувати.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uk"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
