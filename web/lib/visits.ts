import "server-only";

/**
 * Журнал відвідувань: хто, коли й на яку сторінку заходив.
 *
 * ── Навіщо, якщо є живі курсори ───────────────────────────────────────────
 * Курсори показують ОДНОЧАСНУ присутність. Людей семеро, ходять вони в різний
 * час, і перетинаються рідко — тож порожня панель означає «зараз нікого», а
 * не «ніхто не заходить». Питання «чи користуються дашбордом узагалі і хто
 * саме» курсори не закривають у принципі; закриває цей журнал.
 *
 * ── Чому service_role, а не anon-ключ ─────────────────────────────────────
 * Пишемо й читаємо ТІЛЬКИ з сервера, тим самим ключем, що й список доступів.
 * У таблиці ввімкнено RLS без політик, тобто для браузера її не існує: ні
 * прочитати чужі відвідування, ні дописати собі зайвий рядок ззовні не можна.
 *
 * ⚠️ Це журнал дій колег, і бачить його лише адмін (сторінка `/admin`).
 * Зберігаємо мінімум: пошта, маршрут, час. Ні IP, ні user-agent, ні
 * параметрів запиту — вони не потрібні, щоб відповісти на питання «чи
 * заходили», а от питань про себе породжують багато.
 */

const REST = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key)) return null;
  return {
    endpoint: `${url}/rest/v1/dashboard_visits`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
};

export type Visit = {
  email: string;
  path: string;
  at: string;
};

/**
 * Записати відвідування.
 *
 * ⚠️ НІКОЛИ не кидає й нічого не повертає: журнал — річ другорядна, і
 * впасти через нього сторінка не має права. Supabase не налаштований, мережа
 * лягла, таблиці немає — дашборд працює далі, просто без запису.
 */
export async function logVisit(email: string, path: string): Promise<void> {
  const rest = REST();
  if (!rest) return;
  try {
    await fetch(rest.endpoint, {
      method: "POST",
      headers: { ...rest.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ email, path }),
      cache: "no-store",
    });
  } catch {
    // Мовчки: див. коментар вище.
  }
}

export type VisitorSummary = {
  email: string;
  /** Останнє відвідування (ISO). */
  lastAt: string;
  /** Остання сторінка, на якій людина була. */
  lastPath: string;
  /** Скільки переглядів за вікно, яке ми читаємо. */
  views: number;
  /** Скільки РІЗНИХ днів людина заходила за це вікно. */
  days: number;
};

/**
 * Хто заходив — згорнуто по людях.
 *
 * Агрегуємо в JS, а не в SQL: PostgREST не дає групування без окремої вʼюхи
 * чи RPC, а рядків тут одиниці тисяч на місяць — сімох людей вистачить на
 * будь-який ноутбук. Заводити заради цього функцію в базі означало б ще одне
 * місце, де живе логіка дашборду.
 */
export async function listVisitors(limit = 2000): Promise<{
  people: VisitorSummary[];
  recent: Visit[];
}> {
  const rest = REST();
  if (!rest) return { people: [], recent: [] };

  let rows: Visit[] = [];
  try {
    const res = await fetch(
      `${rest.endpoint}?select=email,path,at&order=at.desc&limit=${limit}`,
      { headers: rest.headers, cache: "no-store" }
    );
    if (!res.ok) return { people: [], recent: [] };
    rows = (await res.json()) as Visit[];
  } catch {
    return { people: [], recent: [] };
  }

  const byEmail = new Map<string, VisitorSummary & { dates: Set<string> }>();
  for (const r of rows) {
    const acc = byEmail.get(r.email) ?? {
      email: r.email,
      // Рядки відсортовані за спаданням часу, тож ПЕРШИЙ побачений рядок
      // людини — і є останній її візит.
      lastAt: r.at,
      lastPath: r.path,
      views: 0,
      days: 0,
      dates: new Set<string>(),
    };
    acc.views += 1;
    acc.dates.add(r.at.slice(0, 10));
    byEmail.set(r.email, acc);
  }

  const people = [...byEmail.values()]
    .map(({ dates, ...p }) => ({ ...p, days: dates.size }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return { people, recent: rows.slice(0, 50) };
}
