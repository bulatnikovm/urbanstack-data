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
      // fail closed: `accessFor` повертає null і коли пошти немає в
      // списку, і коли база недоступна — обидва випадки означають «не
      // пускаємо». Див. коментар у lib/access.ts.
      return (await accessFor(user.email)) !== null;
    },

    /**
     * Роль кладемо в токен при вході і оновлюємо при кожному оновленні
     * сесії (`trigger === "update"`). Інакше зміна ролі в адмінці не
     * дійшла б до людини, поки та не перелогінилась.
     */
    async jwt({ token, user, trigger }) {
      const email = user?.email ?? token.email;
      if (email && (user || trigger === "update")) {
        token.role = (await accessFor(email)) ?? "viewer";
      }
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
