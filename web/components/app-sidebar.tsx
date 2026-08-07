"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, Rocket, Star, Users, Wrench } from "lucide-react";

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
 * Сторінки повторюють структуру оригінального Looker-дашборду (5 сторінок),
 * а не зводять усе в одну простиню — кожна сторінка відповідає на одне
 * питання й має власний набір метрик.
 */
const NAV = [
  {
    group: "Продукт",
    items: [
      { href: "/", label: "Аудиторія", icon: Building2, page: "Стор. 1" },
      { href: "/activation", label: "Активація", icon: Rocket, page: "Стор. 2" },
      { href: "/engagement", label: "Залученість", icon: Activity, page: "Стор. 3" },
      { href: "/star", label: "STAR", icon: Star, page: "Стор. 4" },
    ],
  },
  {
    group: "Технічне",
    items: [
      { href: "/health", label: "Стан додатку", icon: Wrench, page: "Стор. 5" },
    ],
  },
];

const ADMIN_ITEM = {
  href: "/admin",
  label: "Доступи",
  icon: Users,
  page: "",
};

export function AppSidebar({ footer, isAdmin }: AppSidebarProps) {
  const pathname = usePathname();

  // Пункт «Доступи» бачить лише адмін. Це виключно UI: сама сторінка
  // віддає 404 не-адміну, а Server Actions перевіряють роль окремо —
  // сховане меню нікого не захищає.
  const nav = isAdmin
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
                    Продуктовий дашборд
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
