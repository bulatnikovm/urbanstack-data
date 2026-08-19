"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Flame,
  Gauge,
  Inbox,
  ShieldAlert,
  Timer,
  Users,
} from "lucide-react";

import { UrbanStackMark } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type AppSidebarProps = { footer?: React.ReactNode; isAdmin?: boolean };

/**
 * Три групи: що в нас є (портфель), як ми працюємо (заявки і сервіс), чи
 * лишаються з нами люди (клієнтський досвід). Останньою має зʼявитись CSAT —
 * її місце в «Клієнтському досвіді», поруч із ризиком відтоку.
 *
 * «Огляд ЖК» — на корені `/`: перше, що хоче побачити людина, яка відкрила
 * дашборд, це скільки в нас будинків/квартир/користувачів, а не одразу
 * список ризикованих будинків. Той самий порядок, що на продуктовому
 * дашборді (спершу «Аудиторія», не «Стан додатку»).
 *
 * `page` (номер сторінки Looker) тут порожній навмисно: жодна з цих
 * сторінок не є переносом старої сторінки Looker. У продуктовому дашборді
 * номери є, бо там кожна сторінка дзеркалить сторінку Looker-звіту.
 */
const NAV = [
  {
    group: "Портфель",
    items: [{ href: "/", label: "Огляд ЖК", icon: Building2, page: "" }],
  },
  {
    group: "Заявки і сервіс",
    items: [
      { href: "/sla", label: "Операційна ефективність", icon: Timer, page: "" },
      { href: "/requests", label: "Аналітика звернень", icon: Inbox, page: "" },
      { href: "/load", label: "Антирейтинг і навантаження", icon: Flame, page: "" },
    ],
  },
  {
    group: "Клієнтський досвід",
    items: [
      { href: "/churn", label: "Ризик відтоку", icon: ShieldAlert, page: "" },
      { href: "/segments", label: "Напруга і сегменти", icon: Gauge, page: "" },
    ],
  },
];

const ADMIN_ITEM = { href: "/admin", label: "Доступи", icon: Users, page: "" };

export function AppSidebar({ footer, isAdmin }: AppSidebarProps) {
  const pathname = usePathname();

  // Адмінка доступів живе в продуктовому дашборді — тут її свідомо немає:
  // два редактори одного allowlist це два джерела правди. Пункт лишається в
  // коді, щоб не вигадувати його заново, коли (і якщо) доступи розʼїдуться
  // між дашбордами.
  const nav = isAdmin && false
    ? [...NAV, { group: "Адміністрування", items: [ADMIN_ITEM] }]
    : NAV;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <>
                <UrbanStackMark className="size-8 shrink-0 text-foreground [--brand-mark-fg:var(--sidebar)]" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    UrbanStack
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Операційний дашборд
                  </span>
                </div>
              </>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <>
                      <item.icon />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                        {item.page}
                      </span>
                    </>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {footer}
      <SidebarRail />
    </Sidebar>
  );
}
