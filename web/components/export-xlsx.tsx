"use client";

import { Check, Download } from "lucide-react";
import { useState } from "react";
import type { SheetData } from "write-excel-file/browser";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SheetPayload } from "@/lib/xlsx";

type CellType = StringConstructor | NumberConstructor;

/**
 * Кнопка «Excel» у шапці таблиці.
 *
 * Приймає вже плоский `SheetPayload` (див. `lib/xlsx.ts`) — через межу
 * server/client компонентів функції не проходять, тому аксесори колонок
 * виконуються на сервері, а сюди їде готовий масив значень.
 *
 * Числа їдуть числами, не рядками ("1 134,21 ₴"): у файлі має бути те, що
 * можна підсумувати й відсортувати, а форматування — справа Excel.
 *
 * Три стани: спокій → «Готую…» з біжучим сяйвом (`.shimmer-busy` у
 * globals.css) → «Готово» з галочкою. Останній потрібен, бо збережений файл
 * зникає в теку завантажень і на екрані не лишає сліду — без нього
 * незрозуміло, чи клік узагалі спрацював.
 */

/**
 * Скільки щонайменше тримати стан «Готую…».
 *
 * Аркуш на кілька сотень рядків збирається за 50-100 мс, і без затримки
 * сяйво встигало б лише блимнути — це читається як збій рендеру, а не як
 * відповідь на клік. 700 мс — приблизно половина циклу анімації, тобто
 * смуга встигає пройти кнопку рівно один раз.
 */
const MIN_BUSY_MS = 700;

/** Скільки тримати «Готово» перед поверненням до звичайного вигляду. */
const DONE_MS = 1400;
export function ExportXlsx({
  sheet,
  fileName,
  sheetName = "Дані",
  label = "Excel",
}: {
  sheet: SheetPayload;
  /** Без розширення — ".xlsx" додається сам. */
  fileName: string;
  sheetName?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const busy = state === "busy";

  async function download() {
    setState("busy");
    const started = Date.now();
    try {
      // Динамічний імпорт — ~100 KB генератора не їдуть у бандл сторінки,
      // а завантажуються за кліком. Шлях саме `/browser`: у пакета немає
      // кореневого export'а, лише node/browser/universal.
      const { default: writeXlsxFile } = await import(
        "write-excel-file/browser"
      );

      // Явна анотація — інакше TS виводить обʼєднання типів рядків і
      // вибирає перевантаження «масив обʼєктів + schema», де кожна колонка
      // зобовʼязана мати поле `cell`.
      const data: SheetData = [
        sheet.columns.map((c) => ({
          value: c.header,
          fontWeight: "bold" as const,
        })),
        ...sheet.rows.map((row) =>
          row.map((v, i) => {
            // `null` як уся клітинка (не `{value: null}`) — так порожня
            // лишається порожньою. Нуль спотворив би середнє у зведеній
            // таблиці, а "—" зробив би колонку текстовою.
            if (v === null) return null;
            return typeof v === "number"
              ? {
                  value: v,
                  type: Number as CellType,
                  format: sheet.columns[i]?.format,
                }
              : { value: String(v), type: String as CellType };
          })
        ),
      ];

      // Браузерна збірка не приймає `fileName` (це опція node-версії), а
      // повертає `{ toBlob, toFile }` — качаємо через `.toFile()`.
      await writeXlsxFile(data, {
        sheet: sheetName,
        columns: sheet.columns.map((c) => ({
          width: c.width ?? Math.max(12, c.header.length + 2),
        })),
      }).toFile(`${fileName}.xlsx`);

      const left = MIN_BUSY_MS - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setState("done");
      setTimeout(() => setState("idle"), DONE_MS);
    } catch (err) {
      setState("idle");
      throw err;
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-7 gap-1.5 text-xs",
        // `disabled:opacity-100` — кнопка на час збірки справді disabled
        // (другий клік почав би другий файл), але напівпрозорою вона гасить
        // і сяйво разом із собою.
        busy && "shimmer-busy disabled:opacity-100"
      )}
      onClick={download}
      disabled={state !== "idle" || sheet.rows.length === 0}
      aria-busy={busy}
    >
      {state === "done" ? (
        <Check className="size-3.5" />
      ) : (
        <Download className="size-3.5" />
      )}
      {/* Обидва підписи в одній клітинці гріда: ширина кнопки = ширина
          найдовшого з них, тож на зміні стану вона не смикається. */}
      <span className="grid">
        <span className="invisible col-start-1 row-start-1">
          {label.length >= 7 ? label : "Готую…"}
        </span>
        <span className="col-start-1 row-start-1">
          {state === "busy" ? "Готую…" : state === "done" ? "Готово" : label}
        </span>
      </span>
    </Button>
  );
}
