"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addUser, removeUser, type Role } from "@/lib/access";

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
  const role: Role = roleRaw === "admin" ? "admin" : "viewer";
  const note = String(formData.get("note") ?? "");

  if (!email.trim()) return { error: "Впиши пошту" };

  const res = await addUser({ email, role, note, createdBy: admin });
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
