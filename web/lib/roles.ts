/**
 * Хто що бачить — чисті типи й правила, без жодного звернення до бази.
 *
 * Окремий файл від `lib/access.ts` навмисно: той `server-only` (тримає
 * service_role-ключ Supabase), а ці правила потрібні і клієнтським
 * компонентам — формі в адмінці й сайдбару. Імпорт `access.ts` з клієнта
 * зламав би збірку, а дублювання списку в двох місцях рано чи пізно
 * розійшлося б.
 *
 * ── Дві незалежні осі ─────────────────────────────────────────────────────
 *
 * РОЛЬ відповідає на питання «що людина може РОБИТИ»: `admin` керує списком
 * доступів, `viewer` — ні. Ролей рівно дві, і третьої не буде.
 *
 * ОБЛАСТЬ (scope) відповідає на питання «що людина БАЧИТЬ». Набір областей
 * видається кожному окремо.
 *
 * Спершу видимість була вкладена в роль — зʼявилась третя роль
 * `operations`. Наступна ж вимога (показати ризик відтоку продуктовій
 * команді, але не операційній) вимагала б четвертої, потім пʼятої на кожну
 * нову комбінацію. Дві осі замість однієї закривають це раз і назавжди:
 * нова сторінка — це нова область або наявна, а не нова роль.
 */

export type Role = "admin" | "viewer";

/**
 * · `product`    — продуктовий дашборд: аудиторія, активація, залученість,
 *                  STAR, стан додатку.
 * · `insights`   — ризик відтоку й сегменти напруги. Технічно вони під
 *                  `/operations`, але за змістом це профілювання мешканців
 *                  за текстами їхніх звернень: внутрішній інструмент
 *                  продуктової команди, а не робочий екран операційного
 *                  відділу. Тому окрема область, а не частина `operations`.
 * · `operations` — щоденна операційка: огляд ЖК, SLA, звернення,
 *                  антирейтинг, CSAT, NPS.
 */
export type Scope = "product" | "insights" | "operations";

export const ALL_SCOPES: readonly Scope[] = [
  "product",
  "insights",
  "operations",
];

export const SCOPE_LABELS: Record<Scope, string> = {
  product: "Продуктовий дашборд",
  insights: "Ризик відтоку і сегменти",
  operations: "Операційний дашборд",
};

export const SCOPE_HINTS: Record<Scope, string> = {
  product: "Аудиторія, активація, залученість, STAR, стан додатку",
  insights: "Профілювання мешканців за текстами звернень — внутрішній інструмент",
  operations: "Огляд ЖК, SLA, аналітика звернень, антирейтинг, CSAT, NPS",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Адміністратор",
  viewer: "Перегляд",
};

export const ROLE_HINTS: Record<Role, string> = {
  admin: "Може керувати цим списком доступів",
  viewer: "Тільки дивиться дашборди",
};

/** Що прийшло з бази або з сесії. */
export type Access = { role: Role; scopes: readonly Scope[] };

export const isRole = (v: unknown): v is Role =>
  v === "admin" || v === "viewer";

export const isScope = (v: unknown): v is Scope =>
  v === "product" || v === "insights" || v === "operations";

/** Розбір довільного значення з бази/токена в набір областей. */
export function parseScopes(v: unknown): Scope[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isScope);
}

/**
 * Маршрут → область. Порядок ВАЖЛИВИЙ: перший збіг виграє, тому
 * найконкретніші префікси стоять вище за загальні.
 *
 * `/admin` тут навмисно НЕМАЄ: це не область видимості, а право керувати
 * списком — воно живе на осі ролі.
 *
 * Останній рядок — `"/"` → `product`. Це не «решта продуктова», це
 * ЗАКРИТО ЗА ЗАМОВЧУВАННЯМ: будь-яка нова сторінка в корені автоматично
 * недоступна тим, у кого немає області `product`, поки їй свідомо не
 * призначили іншу. Помилитись можна лише в бік суворості.
 */
const ROUTE_SCOPES: ReadonlyArray<{ prefix: string; scope: Scope }> = [
  { prefix: "/operations/churn", scope: "insights" },
  { prefix: "/operations/segments", scope: "insights" },
  { prefix: "/operations", scope: "operations" },
  { prefix: "/", scope: "product" },
];

export function scopeForPath(pathname: string): Scope {
  const hit = ROUTE_SCOPES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );
  return hit?.scope ?? "product";
}

/** Чи має людина доступ до шляху. */
export function canSee(access: Access | undefined, pathname: string): boolean {
  if (!access) return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return access.role === "admin";
  }
  return access.scopes.includes(scopeForPath(pathname));
}

/**
 * Корінь дашборду для цієї людини — перший, який їй видно.
 *
 * Єдина точка правди: і проксі, і сайдбар, і сторінка входу беруть звідси.
 * Порядок відповідає порядку дашбордів у сайдбарі; `/operations` останнім,
 * бо продуктовий вважається «головним» для тих, хто бачить обидва.
 */
export function homeFor(access: Access | undefined): string {
  if (access?.scopes.includes("product")) return "/";
  if (access?.scopes.includes("operations")) return "/operations";
  // Тільки `insights` — рідкісний, але можливий набір: людина бачить лише
  // ризик відтоку й сегменти. Ведемо на першу з двох сторінок, інакше
  // проксі відправив би її на закритий корінь і закільцював редіректи.
  if (access?.scopes.includes("insights")) return "/operations/churn";
  // Скоупів немає взагалі — база це забороняє (CHECK), але як тип це
  // можливо. Ведемо на /admin: адмін виправить, решта отримає 404 і напише.
  return "/admin";
}
