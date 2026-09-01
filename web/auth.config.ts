import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { accessFor } from "@/lib/access";
import { isRole, parseScopes } from "@/lib/roles";

/**
 * Хто має доступ — тепер у Supabase (`dashboard_users`), а не в env.
 * Раніше список жив у `ALLOWED_EMAILS`, і додати колегу означало полізти
 * в налаштування Vercel; тепер це робиться зі сторінки `/admin`.
 *
 * `ADMIN_EMAILS` / `ALLOWED_EMAILS` більше не читаються. Роль приходить з
 * того ж рядка таблиці, що й сам дозвіл — двох джерел правди немає.
 */
export type { Access, Role, Scope } from "@/lib/roles";

/**
 * ── Корпоративний вхід (Microsoft Entra ID) ────────────────────────────────
 *
 * Навіщо взагалі: у списку доступів були самі особисті gmail, тобто доступ
 * жив окремо від кадрових процесів — людина йде, її пошта лишається робочою,
 * і закривати треба руками в `/admin`. З M365 достатньо вимкнути обліковий
 * запис, і вхід відвалюється сам.
 *
 * ⚠️ `AUTH_MICROSOFT_ENTRA_ID_ISSUER` МУСИТЬ містити tenant ID. Провайдер за
 * замовчуванням підставляє `/common/` — а це «будь-який обліковий запис
 * Microsoft у світі», включно з особистими. Список доступів (`accessFor`)
 * все одно не пустив би чужого, але сама сторінка входу Microsoft має
 * відмовляти ще до нас.
 *
 * ⚠️ Без завершального `/v2.0` (і БЕЗ слеша в кінці) вхід падає ще на
 * discovery: Auth.js порівнює `issuer` з well-known-документа з нашим рядком
 * СИМВОЛ У СИМВОЛ, а Microsoft віддає його без слеша.
 *
 * Підключення умовне: немає всіх трьох змінних — немає ні провайдера, ні
 * кнопки на вході. Це головна страховка міграції: Google лишається живим,
 * поки всі семеро не перелогіняться корпоративною поштою (див. ANA-17). Якщо
 * зламати обидва провайдери одночасно, закриються всі, включно з єдиним
 * адміном, і повертати доступ доведеться SQL-ом у Supabase.
 */
const entraEnv = () => ({
  clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
});

/** Чи показувати кнопку «Увійти через робочу пошту» на `/login`. */
export function entraEnabled() {
  const { clientId, clientSecret, issuer } = entraEnv();
  return !!(clientId && clientSecret && issuer);
}

function entraProvider() {
  const { clientId, clientSecret, issuer } = entraEnv();
  if (!(clientId && clientSecret && issuer)) return [];

  const base = MicrosoftEntraID({ clientId, clientSecret, issuer });
  // Провайдер типізує `profile` як необовʼязковий, але сам його завжди
  // визначає (там же тягнеться аватарка з Graph — її втрачати не хочемо).
  const baseProfile = base.profile!;

  return [
    {
      ...base,
      /**
       * Пошта в ID-токені Entra — це optional claim `email`, який вмикається
       * руками в Token configuration застосунку. Якщо його не ввімкнули,
       * `user.email` порожній, `signIn` повертає false, і людина, яка в
       * списку доступів Є, отримує «немає доступу» без жодної підказки, чому.
       *
       * Тому запасний варіант — `preferred_username` (для робочих акаунтів це
       * UPN, тобто та сама name@dim9000.com). Ризику «пустити чужого» тут
       * немає: що б сюди не приїхало, воно все одно звіряється зі списком у
       * Supabase, і невідповідність = відмова.
       */
      profile: (async (profile, tokens) => {
        const user = await baseProfile(profile, tokens);
        return { ...user, email: user.email ?? profile.preferred_username };
      }) satisfies typeof baseProfile,
    },
  ];
}

export const authConfig = {
  providers: [Google, ...entraProvider()],
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
        token.scopes = access.scopes;
      }
      // status === "error" — база не відповіла: лишаємо токен як є.
      // Розлогінювати всіх через хвилинний збій Supabase було б гірше за
      // те, що людина ще трохи походить зі старою роллю.
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.role = isRole(token.role) ? token.role : "viewer";
        // Порожній набір = нічого не видно. Це строгіше за «показати все
        // про всяк випадок» і саме тому дефолт саме такий: зіпсований
        // токен має закривати доступ, а не відкривати.
        session.user.scopes = parseScopes(token.scopes);
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
