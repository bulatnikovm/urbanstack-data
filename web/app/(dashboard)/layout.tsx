import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
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
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar
        footer={
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
