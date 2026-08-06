"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * ОС/версія — в URL (`?os=&version=`), як і період: посилання на конкретний
 * зріз можна переслати. Немає готового shadcn `<Select>` у проєкті, версій
 * лише 49 — нативний `<select>` дешевший за нову залежність заради одного
 * місця використання.
 */
export function HealthFilters({
  os,
  version,
  versions,
}: {
  os: string;
  version: string;
  versions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 rounded-md border p-0.5">
        {(
          [
            ["all", "Усі ОС"],
            ["android", "Android"],
            ["ios", "iOS"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => set("os", value)}
            className={cn(
              "h-7 rounded-sm px-2.5 text-xs transition-colors",
              os === value
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <select
        value={version}
        onChange={(e) => set("version", e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-xs"
      >
        <option value="all">Усі версії</option>
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
