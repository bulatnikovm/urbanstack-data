"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addUser, removeUser } from "@/lib/access";
import {
  ALL_SCOPES,
  isRole,
  isScope,
  type Role,
  type Scope,
} from "@/lib/roles";

/**
 * ⚠️ Кожна дія ПЕРЕВІРЯЄ РОЛЬ САМА.
 *
 * Server Action — це публічний HTTP-ендпоінт: те, що кнопка показується
 * лише адмінам, нікого не зупиняє, викликати дію можна й напряму. Тому
 * ховати кнопку — це UI, а справжня перевірка тут.
 */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || session.user.role !== "admin") {
    throw new Error("Потрібні права адміністратора");
  }
  return email;
}

export type ActionState = { error?: string; ok?: string };

export async function grantAccess(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();

  const email = String(formData.get("email") ?? "");
  const roleRaw = String(formData.get("role") ?? "viewer");
  const role: Role = isRole(roleRaw) ? roleRaw : "viewer";
  const note = String(formData.get("note") ?? "");

  /**
   * Області приходять як кілька значень одного поля (галочки). Адміну
   * підставляємо всі — так само, як робить `accessFor` на читанні: інакше
   * знята галочка замикала б адміна поза дашбордом.
   *
   * Порожній набір — помилка вводу, а не «нехай нічого не бачить»: база
   * це теж забороняє (CHECK), але сказати людині зрозумілим текстом краще,
   * ніж віддати 400 від PostgREST.
   */
  const scopes: Scope[] =
    role === "admin" ? [...ALL_SCOPES] : formData.getAll("scopes").map(String).filter(isScope);

  if (!email.trim()) return { error: "Впиши пошту" };
  if (scopes.length === 0) {
    return { error: "Постав хоча б одну галочку в «Що бачить»" };
  }

  const res = await addUser({ email, role, scopes, note, createdBy: admin });
  if (!res.ok) return { error: res.error };

  revalidatePath("/admin");
  return { ok: `${email.trim().toLowerCase()} — доступ видано` };
}

export async function revokeAccess(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "");
  if (!email) return { error: "Не вказано пошту" };

  const res = await removeUser(email);
  if (!res.ok) return { error: res.error };

  revalidatePath("/admin");
  return { ok: `${email} — доступ прибрано` };
}
