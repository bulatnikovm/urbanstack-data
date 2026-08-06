"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import type { SheetData } from "write-excel-file/browser";

import { Button } from "@/components/ui/button";
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
 */
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
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={download}
      disabled={busy || sheet.rows.length === 0}
    >
      <Download className="size-3.5" />
      {busy ? "Готую…" : label}
    </Button>
  );
}
