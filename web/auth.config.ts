import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Allowlist, БЕЗ бази. Микита, Артем, Максим — 5–15 людей на цьому етапі,
 * заводити для цього Postgres-таблицю користувачів немає сенсу (план,
 * §4: "не робимо власну реєстрацію, паролі, інвайти").
 *
 * `ALLOWED_EMAILS` — comma-separated env var, редагується на Vercel без
 * редеплою коду. Порожній список = усі відхиляються (fail closed, не
 * fail open) — заводити явно, а не мовчки пускати всіх, поки хтось не
 * забув налаштувати змінну.
 */
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** `role` поки має лише два значення — гранулярні ролі (product/operations/
 *  finance) додаються у Фазі E, коли підʼїде другий дашборд (план, §10). */
export type Role = "admin" | "viewer";

function roleFor(email: string): Role {
  const admins = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return admins.has(email.toLowerCase()) ? "admin" : "viewer";
}

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ user }) {
      if (!user.email) return false;
      return allowedEmails().has(user.email.toLowerCase());
    },
    jwt({ token, user }) {
      if (user?.email) {
        token.role = roleFor(user.email);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as Role) ?? "viewer";
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
