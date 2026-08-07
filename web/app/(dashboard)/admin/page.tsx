import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PageBody, Panel } from "@/components/dashboard";
import { listUsers } from "@/lib/access";

import { AccessForm } from "./access-form";

/**
 * Керування доступами. Не в дейт-піклер-шапці, як решта сторінок — тут
 * немає періоду, і `PageHeader` з календарем збивав би з пантелику.
 *
 * ⚠️ `notFound()`, а не редірект: не-адмін не має навіть дізнатися, що
 * така сторінка існує. Справжня перевірка прав — в самих Server Actions
 * (див. actions.ts), тут лише те, що видно.
 */
export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") notFound();

  const users = await listUsers();

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
          note="Вхід тільки через Google. Пошта має збігатися з тією, якою людина логіниться; регістр не важливий. Адміністратор бачить цю сторінку й може керувати доступами, перегляд — лише дашборд."
        >
          <AccessForm users={users} currentEmail={session.user.email ?? ""} />
        </Panel>
      </PageBody>
    </>
  );
}
