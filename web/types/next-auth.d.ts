import type { DefaultSession } from "next-auth";
import type { Role, Scope } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      /** Що можна РОБИТИ: керувати списком доступів чи ні. */
      role: Role;
      /** Що видно. Порожній масив — нічого; див. lib/roles.ts. */
      scopes: Scope[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    scopes?: Scope[];
  }
}
