"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  ClipboardList,
  Flame,
  Gauge,
  Heart,
  Inbox,
  LineChart,
  Rocket,
  ShieldAlert,
  Smile,
  Star,
  Timer,
  Users,
  Wrench,
} from "lucide-react";

import { Dim9000Mark } from "@/components/brand";
import { canSee, homeFor, type Access } from "@/lib/roles";
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

type AppSidebarProps = {
  footer?: React.ReactNode;
  /**
   * Меню фільтрується ТИМ САМИМ `canSee`, що й проксі та сторінки — не
   * власним списком «що кому показувати». Інакше меню й доступ розходяться
   * вже на другій правці: пункт є, а сторінка віддає 404.
   *
   * Ховати пункт — це UI, а не захист: сторінки самі викликають
   * `requireAccess` (`lib/guard.ts`), а проксі редіректить. Але показувати
   * кнопку, яка веде в 404, — гірше, ніж не показувати нічого.
   */
  access?: Access;
};

/**
 * Два дашборди в одному застосунку.
 *
 * Спершу вони були двома окремими Next-проєктами й двома деплоями. Це
 * означало другий OAuth-клієнт, другий набір змінних, другий логін для тих
 * самих людей — і, найгірше, 123 однакові файли компонентів у двох теках,
 * які вже почали розходитись. Тепер це один застосунок: продуктовий у
 * корені (старі посилання не ламаються), операційний під `/operations`.
 *
 * Перемикач у шапці сайдбара, а не пункт у меню: домени рівноправні, і
 * вкладати один в інший списком було б брехнею про структуру.
 */
const DASHBOARDS = [
  { id: "product", root: "/", label: "Продуктовий", icon: LineChart },
  { id: "operations", root: "/operations", label: "Операційний", icon: ClipboardList },
] as const;

/**
 * Продуктові сторінки повторюють структуру оригінального Looker-дашборду
 * (5 сторінок) — кожна відповідає на одне питання й має власний набір
 * метрик.
 */
const PRODUCT_NAV = [
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

/**
 * Три групи: що в нас є (портфель), як ми працюємо (заявки і сервіс), чи
 * лишаються з нами люди (клієнтський досвід).
 *
 * «Задоволеність» стоїть ПЕРЕД «Ризиком відтоку» навмисно: опитування це
 * пряме питання мешканцю, а ризик відтоку — наша здогадка з непрямих
 * сигналів. Спершу те, що люди сказали самі.
 *
 * «Огляд ЖК» — на корені домену: перше, що хоче побачити людина, це
 * скільки в нас будинків/квартир/користувачів, а не одразу список
 * ризикованих будинків.
 *
 * `page` (номер сторінки Looker) тут порожній навмисно: жодна з цих
 * сторінок не є переносом старої сторінки Looker.
 */
const OPERATIONS_NAV = [
  {
    group: "Портфель",
    items: [
      { href: "/operations", label: "Огляд ЖК", icon: Building2, page: "" },
    ],
  },
  {
    group: "Заявки і сервіс",
    items: [
      { href: "/operations/sla", label: "Операційна ефективність", icon: Timer, page: "" },
      { href: "/operations/requests", label: "Аналітика звернень", icon: Inbox, page: "" },
      { href: "/operations/load", label: "Антирейтинг і навантаження", icon: Flame, page: "" },
    ],
  },
  {
    group: "Клієнтський досвід",
    items: [
      { href: "/operations/csat", label: "Задоволеність", icon: Smile, page: "" },
    { href: "/operations/nps", label: "NPS", icon: Heart, page: "" },
      { href: "/operations/churn", label: "Ризик відтоку", icon: ShieldAlert, page: "" },
      { href: "/operations/segments", label: "Напруга і сегменти", icon: Gauge, page: "" },
    ],
  },
];

const ADMIN_ITEM = { href: "/admin", label: "Доступи", icon: Users, page: "" };

export function AppSidebar({ footer, access }: AppSidebarProps) {
  const pathname = usePathname();
  /**
   * Без сесії (локальний перегляд із відкладеним proxy.ts) показуємо все:
   * ховати меню нема від кого, а порожній сайдбар виглядав би як поломка.
   * У проді сесія є завжди — туди без неї не пускає проксі.
   */
  const visible = (href: string) => !access || canSee(access, href);

  /**
   * Домен = набір своїх сторінок, а не один кореневий маршрут.
   *
   * Перша версія рахувала домен видимим, якщо видно його КОРІНЬ. На цьому
   * зламалась продуктова команда: їй видно `/operations/churn` і
   * `/operations/segments` (область `insights`), але не `/operations` —
   * тобто пункти в меню були недосяжні, бо перемикач вів на закриту
   * сторінку й зникав разом із нею. Тепер вхід у домен — ПЕРША видима
   * сторінка цього домену, і домен зникає лише тоді, коли не видно жодної.
   */
  const domains = DASHBOARDS.map((d) => {
    const nav = d.id === "operations" ? OPERATIONS_NAV : PRODUCT_NAV;
    const items = nav.flatMap((g) => g.items).filter((i) => visible(i.href));
    return { ...d, nav, entry: items[0]?.href ?? null };
  }).filter((d) => d.entry !== null);

  const inOperations =
    pathname === "/operations" || pathname.startsWith("/operations/");
  const current =
    domains.find((d) => d.id === (inOperations ? "operations" : "product")) ??
    domains[0];

  /**
   * «Доступи» стоять ПЕРЕД дашбордами і показуються на обох, а не в хвості
   * продуктового меню (як було). Дві причини: список доступів один на
   * обидва домени, тож ховати його на одному з них — брехня про структуру;
   * і це не «ще один звіт», а керування середовищем, тому місце йому
   * зверху. Бачить лише адмін: `canSee` для `/admin` дивиться на роль, а
   * не на області.
   */
  const base = current?.nav ?? [];
  const withAdmin = visible(ADMIN_ITEM.href)
    ? [{ group: "Адміністрування", items: [ADMIN_ITEM] }, ...base]
    : base;
  // Групи, з яких після фільтра нічого не лишилось, прибираємо цілком —
  // порожній заголовок «Клієнтський досвід» без пунктів читається як збій.
  const nav = withAdmin
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => visible(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={homeFor(access)} />}>
              <>
                <Dim9000Mark className="size-8 shrink-0 text-foreground [--brand-mark-fg:var(--sidebar)]" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    DIM9000
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {current?.label} дашборд
                  </span>
                </div>
              </>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/*
          Перемикач — два звичайні посилання, а не випадайка.

          Спершу тут був DropdownMenu (як у меню користувача внизу). Проблема
          не в тому, що він не працює, а в тому, що це найважливіший елемент
          навігації: людина, яка не здогадається клікнути в шапку, другого
          дашборду просто не побачить. Два видимі рядки прибирають це
          питання й заразом коштують один клік замість двох.
        */}
        <SidebarMenu className={domains.length > 1 ? undefined : "hidden"}>
          {domains.map((d) => (
            <SidebarMenuItem key={d.id}>
              <SidebarMenuButton
                isActive={d.id === current?.id}
                tooltip={`${d.label} дашборд`}
                render={<Link href={d.entry as string} />}
              >
                <>
                  <d.icon />
                  <span>{d.label}</span>
                </>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
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
