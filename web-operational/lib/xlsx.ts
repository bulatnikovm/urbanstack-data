/**
 * Підготовка таблиці до вивантаження в Excel.
 *
 * ⚠️ Навіщо окремий крок, а не колонки з аксесорами прямо в компоненті:
 * сторінки — серверні компоненти, кнопка експорту — клієнтський, а через цю
 * межу React НЕ пропускає функції ("Functions cannot be passed directly to
 * Client Components"). Тому аксесори виконуються ТУТ, на сервері, а далі
 * їде вже плоский масив значень.
 */

export type SheetColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Ширина колонки в символах. */
  width?: number;
  /** Excel-формат числа, напр. "#,##0.00" або "0.0%". */
  format?: string;
};

/** Плоский, серіалізовний опис аркуша — те, що можна віддати в клієнт. */
export type SheetPayload = {
  columns: Array<{ header: string; width?: number; format?: string }>;
  rows: Array<Array<string | number | null>>;
};

export function buildSheet<T>(
  rows: T[],
  columns: Array<SheetColumn<T>>
): SheetPayload {
  return {
    columns: columns.map(({ header, width, format }) => ({
      header,
      width,
      format,
    })),
    rows: rows.map((row) =>
      columns.map((c) => {
        const v = c.value(row);
        return v === undefined || v === "" ? null : v;
      })
    ),
  };
}
