"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardUser } from "@/lib/access";

import { grantAccess, revokeAccess, type ActionState } from "./actions";
import {
  ALL_SCOPES,
  ROLE_HINTS,
  ROLE_LABELS,
  SCOPE_HINTS,
  SCOPE_LABELS,
  type Role,
  type Scope,
} from "@/lib/roles";

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

/**
 * Порядок у дропдауні — від найчастішого до найрідшого, а не за алфавітом:
 * колегам зазвичай видають «Перегляд», і він має бути дефолтом.
 */
const ROLE_ORDER: Role[] = ["viewer", "admin"];

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

  const [role, setRole] = useState<Role>("viewer");
  /**
   * Дефолт нового доступу — тільки операційний.
   *
   * Найменша можлива видимість, а не «як у решти»: помилка в бік суворості
   * коштує одного повідомлення «не бачу сторінку», помилка в інший бік —
   * показаних не тим людям персональних сигналів мешканців.
   */
  const [scopes, setScopes] = useState<Scope[]>(["operations"]);

  const toggle = (s: Scope) =>
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  // Адміну області не звужуються — так само, як у accessFor на сервері.
  const scopesDisabled = role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <form action={addAction} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Пошта Google</span>
            <Input name="email" type="email" placeholder="colleague@gmail.com" />
          </label>

          <div className="flex w-[190px] flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Роль</span>
            {/* Значення їде в FormData прихованим полем: Base UI малює
                список звичайним DOM (заради заокруглених опцій), а не
                нативним <select>, тому саме поле форми треба віддати явно. */}
            <input type="hidden" name="role" value={role} />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              items={ROLE_ORDER.map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">
              {ROLE_HINTS[role]}
            </span>
          </div>

          <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              Хто це (не обовʼязково)
            </span>
            <Input name="note" placeholder="напр. PM" />
          </label>

          <Submit>Видати доступ</Submit>
        </div>

        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
          <legend className="px-1 text-xs text-muted-foreground">
            Що бачить
          </legend>
          {ALL_SCOPES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 text-sm"
              title={SCOPE_HINTS[s]}
            >
              <input
                type="checkbox"
                name="scopes"
                value={s}
                checked={scopesDisabled || scopes.includes(s)}
                disabled={scopesDisabled}
                onChange={() => toggle(s)}
                className="size-4 accent-foreground"
              />
              <span className={scopesDisabled ? "text-muted-foreground" : ""}>
                {SCOPE_LABELS[s]}
              </span>
            </label>
          ))}
          {scopesDisabled && (
            <span className="text-[11px] text-muted-foreground">
              Адміністратор бачить усе — звузити не можна, інакше можна
              замкнути себе поза дашбордом
            </span>
          )}
        </fieldset>
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
              <div className="truncate text-xs text-muted-foreground">
                {u.note && <span className="mr-1.5">{u.note} ·</span>}
                {u.role === "admin"
                  ? "бачить усе"
                  : (u.scopes ?? [])
                      .map((s) => SCOPE_LABELS[s] ?? s)
                      .join(" · ") || "нічого не видно"}
              </div>
            </div>

            <span
              className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              title={ROLE_HINTS[u.role] ?? ""}
            >
              {ROLE_LABELS[u.role] ?? u.role}
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
