import { auth } from "@/auth";
import { PageBody, Panel } from "@/components/dashboard";
import { listUsers } from "@/lib/access";
import { listVisitors } from "@/lib/visits";
import { n, snapshotLabel } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { AccessForm } from "./access-form";
import { requireAccess } from "@/lib/guard";

/**
 * Коротке «востаннє заходив» для рядка списку доступів.
 *
 * ⚠️ Рахується НА СЕРВЕРІ й їде в клієнт готовим рядком. Інакше «сьогодні»
 * бралося б з годинника глядача, і розмітка сервера з розміткою браузера
 * розходились би при гідратації — рівно той клас помилки, який видно лише
 * в консолі й лише в частини людей.
 *
 * Доба — київська, як і скрізь у дашборді (свіжість даних, місяці): в
 * інших одиницях «сьогодні» означало б інший день.
 */
function lastSeenLabel(iso: string): string {
  const kyivDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(d);
  const days = Math.round(
    (Date.parse(kyivDay(new Date())) - Date.parse(kyivDay(new Date(iso)))) /
      86_400_000
  );
  if (days <= 0) return "сьогодні";
  if (days === 1) return "вчора";
  if (days < 7) return `${days} дн. тому`;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Kyiv",
  }).format(new Date(iso));
}

/**
 * Керування доступами. Не в дейт-піклер-шапці, як решта сторінок — тут
 * немає періоду, і `PageHeader` з календарем збивав би з пантелику.
 *
 * ⚠️ `notFound()`, а не редірект: не-адмін не має навіть дізнатися, що
 * така сторінка існує. Справжня перевірка прав — в самих Server Actions
 * (див. actions.ts), тут лише те, що видно.
 */
export default async function AdminPage() {
  // Область `admin` видана лише ролі admin — правило живе в lib/roles.ts,
  // а не тут, щоб проксі, сайдбар і сторінка не розходились у трактуванні.
  // Справжня перевірка прав на ЗАПИС — окремо в actions.ts: Server Action
  // це публічний ендпоінт, і сховати сторінку недостатньо.
  await requireAccess("/admin");
  const session = await auth();

  const users = await listUsers();
  const { people } = await listVisitors();

  /**
   * «Востаннє заходив» — тим самим запитом, що й панель нижче, тільки
   * розгорнуте в мапу по пошті. Під час переїзду на корпоративний вхід це
   * головне, що хочеться бачити просто в списку доступів: хто вже
   * перелогінився робочою поштою, а в кого рядок є і мовчить.
   */
  const lastSeen = Object.fromEntries(
    people.map((p) => [p.email.toLowerCase(), lastSeenLabel(p.lastAt)])
  );

  return (
    <>
      <header className="flex flex-col gap-1 border-b px-4 py-4 md:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Доступи</h1>
        <p className="text-sm text-muted-foreground">
          Хто може заходити в дашборд. Зміни діють одразу — перезбирати
          нічого не треба.
        </p>
      </header>

      <PageBody>
        <Panel
          title={`Команда — ${users.length}`}
          note="Вхід через робочу пошту (M365) або через Google. Пошта в рядку має збігатися з тією, якою людина логіниться; регістр не важливий. Олівець змінює роль, області й підпис уже виданого доступу — саму пошту ні: це ключ рядка, і «та сама людина під іншою адресою» робиться як новий доступ плюс прибраний старий. «Адміністратор» бачить усе плюс цю сторінку; областями керує колонка «Що бачить». «Востаннє» береться з журналу відвідувань, який ведеться з 01.09.2026 — «ще не заходив» означає «немає в журналі», а не обов'язково «жодного разу за весь час»."
        >
          <AccessForm
            users={users}
            currentEmail={session?.user?.email ?? ""}
            lastSeen={lastSeen}
          />
        </Panel>

        <Panel
          title="Хто заходив"
          note="Останні 2 000 переглядів сторінок. Живі курсори показують, хто тут ПРЯМО ЗАРАЗ, і при семи людях порожня панель — це майже завжди «зараз нікого», а не «ніхто не ходить». Це — відповідь на друге питання."
        >
          {people.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              Записів ще немає. Журнал почав вестись 01.09.2026 — усе, що було
              раніше, ніде не збереглось.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пошта</TableHead>
                  <TableHead>Востаннє</TableHead>
                  <TableHead>Остання сторінка</TableHead>
                  <TableHead className="text-right">Переглядів</TableHead>
                  <TableHead className="text-right">Днів</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.email}>
                    <TableCell className="font-medium">{p.email}</TableCell>
                    <TableCell
                      className="whitespace-nowrap"
                      title={p.lastAt}
                    >
                      {snapshotLabel(p.lastAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.lastPath}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(p.views)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(p.days)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
