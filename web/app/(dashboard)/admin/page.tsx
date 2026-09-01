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
          note="Вхід тільки через Google. Пошта має збігатися з тією, якою людина логіниться; регістр не важливий. «Адміністратор» — обидва дашборди плюс ця сторінка. «Перегляд» — обидва дашборди. «Тільки операційний» — заявки, SLA, CSAT і NPS; продуктового дашборду, «Ризику відтоку» та «Напруги і сегментів» для такої людини не існує (останні два — профілювання мешканців за текстами звернень, це внутрішній інструмент)."
        >
          <AccessForm users={users} currentEmail={session?.user?.email ?? ""} />
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
