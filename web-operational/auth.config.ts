import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { accessFor } from "@/lib/access";

/**
 * Хто має доступ — тепер у Supabase (`dashboard_users`), а не в env.
 * Раніше список жив у `ALLOWED_EMAILS`, і додати колегу означало полізти
 * в налаштування Vercel; тепер це робиться зі сторінки `/admin`.
 *
 * `ADMIN_EMAILS` / `ALLOWED_EMAILS` більше не читаються. Роль приходить з
 * того ж рядка таблиці, що й сам дозвіл — двох джерел правди немає.
 */
export type { Role } from "@/lib/access";

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // fail closed: пускаємо ЛИШЕ на явне "ok". Недоступна база — теж
      // відмова: краще не пустити свого, ніж пустити чужого.
      return (await accessFor(user.email)).status === "ok";
    },

    /**
     * Роль перечитується з бази НА КОЖНОМУ запиті, а не лише при вході.
     *
     * Спершу тут було "оновлювати при вході або на `trigger === 'update'`"
     * — і це виявилось хибним двічі. По-перше, роль у вже виданому токені
     * застигала назавжди: Микита мав admin у базі, а в сесії лишався
     * viewer з часів, коли роль бралась з ADMIN_EMAILS, і пункт «Доступи»
     * не з'являвся. По-друге, і це гірше: відкликаєш доступ в адмінці — а
     * старий токен спокійно працює до закінчення терміну.
     *
     * Ціна — один запит до Supabase на запит сторінки. На команді з 5-15
     * людей це ніщо, а відкликання доступу починає діяти негайно.
     */
    async jwt({ token, user }) {
      const email = user?.email ?? token.email;
      if (!email) return token;

      const access = await accessFor(email);
      if (access.status === "denied") {
        // Доступ прибрали — анулюємо сесію, а не лишаємо з роллю viewer.
        return null;
      }
      if (access.status === "ok") {
        token.role = access.role;
      }
      // status === "error" — база не відповіла: лишаємо токен як є.
      // Розлогінювати всіх через хвилинний збій Supabase було б гірше за
      // те, що людина ще трохи походить зі старою роллю.
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.role =
          (token.role as "admin" | "viewer" | undefined) ?? "viewer";
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
