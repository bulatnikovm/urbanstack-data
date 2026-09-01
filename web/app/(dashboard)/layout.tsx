import { Suspense } from "react";
import { after } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { isWatcher } from "@/lib/live";
import { logVisit } from "@/lib/visits";
import { LivePresence } from "@/components/live-presence";
import { StaleNotice } from "@/components/stale-notice";
import { UserMenu } from "@/components/user-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Оболонка авторизованої частини дашборду. Винесено з кореневого layout
 * в route group (dashboard), щоб `/login` міг рендеритись БЕЗ сайдбара —
 * інакше неавторизований глядач бачив би повну навігацію на екрані входу.
 *
 * `middleware.ts` — перша лінія захисту (редірект на /login до рендеру).
 * Ця обгортка — друга: якщо middleware колись пропустить щось (напр. race
 * після виходу), `UserMenu` тут все одно читає сесію на сервері.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  /**
   * Журнал відвідувань. `after` — щоб запис у Supabase не стояв між людиною
   * й сторінкою: колбек виконується ПІСЛЯ того, як відповідь пішла в
   * браузер. Впасти він теж не може — `logVisit` ковтає будь-яку помилку
   * (журнал другорядний, дашборд важливіший).
   *
   * Пишеться на КОЖЕН перехід між сторінками, і це навмисно: питання не
   * лише «чи заходив», а й «що дивився».
   */
  const visitor = session?.user?.email;
  if (visitor) {
    after(async () => {
      const h = await headers();
      await logVisit(visitor, h.get("x-current-path") ?? "/");
    });
  }

  return (
    <SidebarProvider>
      <AppSidebar
        access={session?.user}
        footer={
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">
        {/*
          Смуга «дані не оновились» — над сторінкою, а не всередині кожної:
          свіжість зрізу однакова для всіх сторінок обох дашбордів, і
          питання «чому цифри ті самі, що вчора» виникає на будь-якій із
          них. У нормальний день компонент не малює нічого.
        */}
        <StaleNotice />
        {children}
        {/*
          Живі курсори. Компонент монтується ВСІМ, у кого є сесія — інакше
          не буде кого показувати, — але малює щось лише спостерігачеві.
          Рішення «хто спостерігач» приймається тут, на сервері: у
          клієнтський бандл їде вже готове `canWatch`, і перемкнути його в
          DevTools не можна. Деталі — lib/live.ts.
        */}
        {session?.user?.email && (
          <LivePresence
            me={{
              email: session.user.email,
              name: session.user.name ?? "",
              image: session.user.image ?? null,
            }}
            canWatch={isWatcher(session.user.email)}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
