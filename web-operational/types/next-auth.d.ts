import type { DefaultSession } from "next-auth";
import type { Role } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}
