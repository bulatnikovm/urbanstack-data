"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardUser } from "@/lib/access";

import { grantAccess, revokeAccess, type ActionState } from "./actions";

const EMPTY: ActionState = {};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={pending}>
      <UserPlus className="size-3.5" />
      {pending ? "Додаю…" : children}
    </Button>
  );
}

function RevokeButton({ email }: { email: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-[var(--status-critical)]"
      disabled={pending}
      aria-label={`Прибрати доступ ${email}`}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function AccessForm({
  users,
  currentEmail,
}: {
  users: DashboardUser[];
  currentEmail: string;
}) {
  const [addState, addAction] = useActionState(grantAccess, EMPTY);
  const [delState, delAction] = useActionState(revokeAccess, EMPTY);
  const message = addState.error ?? delState.error ?? addState.ok ?? delState.ok;
  const isError = Boolean(addState.error ?? delState.error);

  return (
    <div className="flex flex-col gap-4">
      <form action={addAction} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Пошта Google</span>
          <Input name="email" type="email" placeholder="colleague@gmail.com" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Роль</span>
          <select
            name="role"
            defaultValue="viewer"
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="viewer">Перегляд</option>
            <option value="admin">Адміністратор</option>
          </select>
        </label>

        <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Хто це (не обовʼязково)</span>
          <Input name="note" placeholder="напр. PM" />
        </label>

        <Submit>Видати доступ</Submit>
      </form>

      {message && (
        <p
          className={
            isError
              ? "text-xs text-[var(--status-critical)]"
              : "text-xs text-[var(--status-good)]"
          }
        >
          {message}
        </p>
      )}

      <ul className="flex flex-col divide-y rounded-lg border">
        {users.map((u) => (
          <li key={u.email} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                {u.email}
                {u.email.toLowerCase() === currentEmail.toLowerCase() && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    це ти
                  </span>
                )}
              </div>
              {u.note && (
                <div className="truncate text-xs text-muted-foreground">
                  {u.note}
                </div>
              )}
            </div>

            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {u.role === "admin" ? "Адміністратор" : "Перегляд"}
            </span>

            <form action={delAction} className="shrink-0">
              <input type="hidden" name="email" value={u.email} />
              <RevokeButton email={u.email} />
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
