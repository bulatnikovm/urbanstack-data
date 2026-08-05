import { Gauge, TriangleAlert } from "lucide-react";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Цей email не має доступу до дашборду. Напиши Микиті.",
  Configuration: "Помилка налаштування входу. Напиши Микиті.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const sp = await searchParams;
  const callbackUrl =
    typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/";
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Gauge className="size-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Продуктовий дашборд UrbanStack
          </h1>
          <p className="text-sm text-muted-foreground">
            Доступ лише для команди
          </p>
        </div>
      </div>

      {error && (
        <div className="flex max-w-sm items-start gap-2 rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/8 px-3.5 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-critical)]" />
          <span className="text-muted-foreground">
            {ERROR_MESSAGES[error] ?? "Не вдалося увійти. Спробуй ще раз."}
          </span>
        </div>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
      >
        <Button type="submit" size="lg" className="gap-2">
          <GoogleIcon className="size-4" />
          Увійти через Google
        </Button>
      </form>
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1a11 11 0 0 0-9.82 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
