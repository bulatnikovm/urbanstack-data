import "server-only";

/**
 * Список доступів до дашборду — у Supabase, а не в env.
 *
 * Чому саме тут база, коли вся решта дашборду — закомічений JSON: цей
 * список редагує ЛЮДИНА в рантаймі. У JSON так не запишеш — кожне
 * додавання колеги означало б коміт і перезбірку.
 *
 * Ходимо в PostgREST звичайним `fetch`, без `@supabase/supabase-js`:
 * запитів рівно чотири, а модуль тягнеться в proxy (він перевіряє
 * авторизацію до рендеру), і туди зайвого краще не класти.
 *
 * ⚠️ Ключ — service_role: він обходить RLS. Тому файл `server-only`, а
 * значення живе тільки в змінних середовища. У браузер не потрапляє
 * ніколи; якщо колись знадобиться читати список з клієнта — заводити
 * окрему RLS-політику, а не тягнути цей ключ.
 */

export type Role = "admin" | "viewer";

export type DashboardUser = {
  email: string;
  role: Role;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

const REST = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key)) return null;
  return {
    endpoint: `${url}/rest/v1/dashboard_users`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
};

/**
 * Google може віддати пошту в іншому регістрі, ніж її вписали в адмінці
 * ("Ivan@Gmail.com" проти "ivan@gmail.com"), — тому скрізь порівнюємо в
 * нижньому регістрі, і в базі на це є унікальний індекс по lower(email).
 */
const norm = (email: string) => email.trim().toLowerCase();

async function query<T>(path: string, init?: RequestInit): Promise<T | null> {
  const rest = REST();
  if (!rest) return null;
  const res = await fetch(`${rest.endpoint}${path}`, {
    ...init,
    headers: { ...rest.headers, ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[access] Supabase:", res.status, await res.text());
    return null;
  }
  return res.status === 204 ? ([] as T) : ((await res.json()) as T);
}

/**
 * Чи пускаємо цю пошту. Повертає роль або `null`.
 *
 * ⚠️ Fail CLOSED: якщо Supabase недоступний або змінні не налаштовані —
 * повертаємо `null`, тобто не пускаємо нікого. Протилежний вибір (пускати,
 * коли база мовчить) перетворив би збій бази на відкриті двері.
 */
export async function accessFor(email: string): Promise<Role | null> {
  const rows = await query<Array<{ role: Role }>>(
    `?select=role&email=eq.${encodeURIComponent(norm(email))}`
  );
  return rows?.[0]?.role ?? null;
}

export async function listUsers(): Promise<DashboardUser[]> {
  return (await query<DashboardUser[]>("?select=*&order=created_at.asc")) ?? [];
}

export async function addUser(input: {
  email: string;
  role: Role;
  note?: string;
  createdBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = norm(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Це не схоже на поштову адресу" };
  }

  const rest = REST();
  if (!rest) return { ok: false, error: "Supabase не налаштований" };

  const res = await fetch(rest.endpoint, {
    method: "POST",
    headers: { ...rest.headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      email,
      role: input.role,
      note: input.note?.trim() || null,
      created_by: input.createdBy,
    }),
    cache: "no-store",
  });

  if (res.status === 409) {
    return { ok: false, error: "Ця пошта вже в списку" };
  }
  if (!res.ok) {
    console.error("[access] addUser:", res.status, await res.text());
    return { ok: false, error: "Не вдалося додати — глянь логи" };
  }
  return { ok: true };
}

export async function removeUser(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rest = REST();
  if (!rest) return { ok: false, error: "Supabase не налаштований" };

  // Останнього адміна прибрати не можна: інакше в дашборд не зайде вже
  // ніхто, і повертати доступ доведеться руками через SQL.
  const target = norm(email);
  const admins = await query<Array<{ email: string }>>(
    "?select=email&role=eq.admin"
  );
  if (
    admins &&
    admins.length <= 1 &&
    admins.some((a) => norm(a.email) === target)
  ) {
    return { ok: false, error: "Це останній адмін — залишишся без доступу" };
  }

  const res = await fetch(
    `${rest.endpoint}?email=eq.${encodeURIComponent(target)}`,
    { method: "DELETE", headers: rest.headers, cache: "no-store" }
  );
  if (!res.ok) {
    console.error("[access] removeUser:", res.status, await res.text());
    return { ok: false, error: "Не вдалося прибрати — глянь логи" };
  }
  return { ok: true };
}
