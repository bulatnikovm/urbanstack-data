"use client";

import { Check, Pencil, Trash2, UserPlus, X } from "lucide-react";
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

import {
  grantAccess,
  revokeAccess,
  updateAccess,
  type ActionState,
} from "./actions";
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

/**
 * Порядок у дропдауні — від найчастішого до найрідшого, а не за алфавітом:
 * колегам зазвичай видають «Перегляд», і він має бути дефолтом.
 */
const ROLE_ORDER: Role[] = ["viewer", "admin"];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={pending}>
      <UserPlus className="size-3.5" />
      {pending ? "Додаю…" : children}
    </Button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={pending}>
      <Check className="size-3.5" />
      {pending ? "Зберігаю…" : "Зберегти"}
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
 * Підпис над полем. Один компонент на всі колонки рядка — саме він тримає
 * вирівнювання: підписи однакової висоти, тому й самі поля починаються на
 * одному рівні.
 *
 * ⚠️ Рядок вирівняний ПО ВЕРХУ (`items-start`), а не по низу, як було
 * раніше. З `items-end` колонка «Роль» з підказкою під селектом ставала
 * вищою за сусідів і виїжджала вгору — саме це й було видно на екрані.
 * Тепер підказка просто звисає вниз і нікого не рухає, а кнопка отримує
 * порожній підпис-розпірку, щоб не прилипнути до верху.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

function RoleField({
  role,
  onChange,
}: {
  role: Role;
  onChange: (r: Role) => void;
}) {
  return (
    <div className="flex w-[190px] flex-col gap-1.5">
      <FieldLabel>Роль</FieldLabel>
      {/* Значення їде в FormData прихованим полем: Base UI малює список
          звичайним DOM (заради заокруглених опцій), а не нативним
          <select>, тому саме поле форми треба віддати явно. */}
      <input type="hidden" name="role" value={role} />
      <Select
        value={role}
        onValueChange={(v) => onChange(v as Role)}
        items={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
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
  );
}

function ScopesFieldset({
  role,
  scopes,
  onToggle,
}: {
  role: Role;
  scopes: Scope[];
  onToggle: (s: Scope) => void;
}) {
  // Адміну області не звужуються — так само, як у accessFor на сервері.
  const disabled = role === "admin";
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
      <legend className="px-1 text-xs text-muted-foreground">Що бачить</legend>
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
            checked={disabled || scopes.includes(s)}
            disabled={disabled}
            onChange={() => onToggle(s)}
            className="size-4 accent-foreground"
          />
          <span className={disabled ? "text-muted-foreground" : ""}>
            {SCOPE_LABELS[s]}
          </span>
        </label>
      ))}
      {disabled && (
        <span className="text-[11px] text-muted-foreground">
          Адміністратор бачить усе — звузити не можна, інакше можна замкнути
          себе поза дашбордом
        </span>
      )}
    </fieldset>
  );
}

/**
 * Рядок у режимі редагування.
 *
 * Окремий компонент, а не спільний стан у батька, саме заради стану: роль і
 * галочки треба ініціалізувати ТИМ, що вже видано людині, і скинути назад
 * при «Скасувати». Компонент, який монтується на час редагування, робить це
 * сам фактом монтування — без useEffect'ів на синхронізацію.
 *
 * Пошта тут показана, але не редагується: це ключ рядка (див. `updateUser`).
 */
function EditRow({
  user,
  action,
  onCancel,
}: {
  user: DashboardUser;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [scopes, setScopes] = useState<Scope[]>([...(user.scopes ?? [])]);

  const toggle = (s: Scope) =>
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <input type="hidden" name="email" value={user.email} />

      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <FieldLabel>Пошта</FieldLabel>
          <div className="flex h-9 items-center truncate text-sm font-medium">
            {user.email}
          </div>
        </div>

        <RoleField role={role} onChange={setRole} />

        <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <FieldLabel>Хто це (не обовʼязково)</FieldLabel>
          <Input name="note" defaultValue={user.note ?? ""} placeholder="напр. PM" />
        </label>

      </div>

      {/* Кнопки — у нижньому рядку, поруч із галочками, а не четвертою
          колонкою у верхньому. Рядок редагування живе всередині елемента
          списку, тобто вужчий за форму додавання, і пара «Зберегти +
          Скасувати» там регулярно переносилась на власний рядок, лишаючи
          над собою порожню розпірку. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <ScopesFieldset role={role} scopes={scopes} onToggle={toggle} />
        </div>
        <div className="flex shrink-0 gap-2">
          <SaveButton />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={onCancel}
          >
            <X className="size-3.5" />
            Скасувати
          </Button>
        </div>
      </div>
    </form>
  );
}

export function AccessForm({
  users,
  currentEmail,
  lastSeen,
}: {
  users: DashboardUser[];
  currentEmail: string;
  /**
   * Пошта → коли людина востаннє відкривала дашборд («сьогодні», «3 дн.
   * тому», «14 серп.»). Рядок готує СЕРВЕР: рахувати «сьогодні» тут
   * означало б брати його з годинника глядача й ловити розбіжність
   * розмітки при гідратації.
   */
  lastSeen: Record<string, string>;
}) {
  const [addState, addAction] = useActionState(grantAccess, EMPTY);
  const [editState, editAction] = useActionState(updateAccess, EMPTY);
  const [delState, delAction] = useActionState(revokeAccess, EMPTY);

  const message =
    addState.error ??
    editState.error ??
    delState.error ??
    addState.ok ??
    editState.ok ??
    delState.ok;
  const isError = Boolean(addState.error ?? editState.error ?? delState.error);

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

  /** Яку пошту зараз редагуємо. Одночасно — тільки одну. */
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * Закриваємо редактор лише на УСПІХ. При помилці рядок лишається
   * розгорнутим — інакше текст «постав хоча б одну галочку» з'являвся б над
   * згорнутим рядком, і виправляти було б ніде.
   *
   * Правка стану ПІД ЧАС РЕНДЕРУ, а не в useEffect: це підтримана React
   * форма «підлаштуватись під зміну вхідних даних», і вона не дає зайвого
   * проходу з розгорнутим рядком, який глядач встиг би побачити.
   *
   * ⚠️ Порівнюємо ОБ'ЄКТ стану, а не текст `ok`: два поспіль успішні
   * збереження того самого рядка дають однаковий текст, і по рядку
   * редактор удруге вже не закрився б.
   */
  const [seenEdit, setSeenEdit] = useState(editState);
  if (editState !== seenEdit) {
    setSeenEdit(editState);
    if (editState.ok) setEditing(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={addAction} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <FieldLabel>Пошта</FieldLabel>
            <Input
              name="email"
              type="email"
              placeholder="colleague@dim9000.com"
            />
          </label>

          <RoleField role={role} onChange={setRole} />

          <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <FieldLabel>Хто це (не обовʼязково)</FieldLabel>
            <Input name="note" placeholder="напр. PM" />
          </label>

          <div className="flex flex-col gap-1.5">
            {/* Порожній підпис-розпірка: рядок вирівняний по верху, і без нього
                кнопка стала б на рівень підписів, а не самих полів. */}
            <span className="text-xs" aria-hidden>
              &nbsp;
            </span>
            <Submit>Видати доступ</Submit>
          </div>
        </div>

        <ScopesFieldset role={role} scopes={scopes} onToggle={toggle} />
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
            {editing === u.email ? (
              <EditRow
                user={u}
                action={editAction}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
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
                    <span className="ml-1.5">
                      ·{" "}
                      {lastSeen[u.email.toLowerCase()]
                        ? `востаннє ${lastSeen[u.email.toLowerCase()]}`
                        : "ще не заходив"}
                    </span>
                  </div>
                </div>

                <span
                  className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  title={ROLE_HINTS[u.role] ?? ""}
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Змінити доступ ${u.email}`}
                  onClick={() => setEditing(u.email)}
                >
                  <Pencil className="size-3.5" />
                </Button>

                <form action={delAction} className="shrink-0">
                  <input type="hidden" name="email" value={u.email} />
                  <RevokeButton email={u.email} />
                </form>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
