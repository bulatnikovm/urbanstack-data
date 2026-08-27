import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Хто зараз дивиться дашборд — Микита просив, щоб було видно (§4 плану).
 * Серверний компонент: `auth()` читає сесію на сервері, у клієнтський
 * бандл не їде нічого зайвого.
 */
export async function UserMenu() {
  const session = await auth();
  if (!session?.user) return null;

  const { name, email, image, role } = session.user;
  const initials = (name ?? email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton size="lg">
                  <>
                    <Avatar className="size-7 rounded-md">
                      {image && <AvatarImage src={image} alt={name ?? ""} />}
                      <AvatarFallback className="rounded-md text-[10px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {role === "admin" ? "Адмін" : "Переглядач"}
                      </span>
                    </div>
                  </>
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent side="top" align="start" className="w-56">
              {/*
                ⚠️ `DropdownMenuGroup` тут ОБОВʼЯЗКОВИЙ, і це не оформлення.

                `DropdownMenuLabel` — це `Menu.GroupLabel` з Base UI, а він
                вимагає контекст `Menu.Group`. Без обгортки компонент кидає
                «MenuGroupContext is missing» ПІД ЧАС РЕНДЕРУ вмісту меню,
                тобто рівно тоді, коли на нього клікають. У деві це видно як
                Runtime Error, а в проді React повторює рендер, знову
                отримує виняток — і вкладка помирає з «This page couldn't
                load». Симптом виглядав як падіння браузера, а не як помилка
                застосунку, тому й прожив непоміченим: меню відкривали рідко.

                Група обгортає і підпис, і пункт: підпис має щось називати.
                Порожня група з самим лише лейблом задовольнила б Base UI,
                але для скрінрідера означала б «група ні з чого».
              */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <DropdownMenuItem
                    render={<button type="submit" className="w-full" />}
                  >
                    <LogOut />
                    Вийти
                  </DropdownMenuItem>
                </form>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
