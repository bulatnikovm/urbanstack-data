// Файл vendored (Bklit), локально патчений — те саме, що й три правки в
// shadcn `chart.tsx` (див. web/README.md). Оригінал був на "en-US": вісь X
// і заголовок тултипа показували "Jul 27" на україномовному дашборді.
// ⚠️ `npx shadcn add @bklit/...` перезаписує цей файл без -o — з -o теж, це
// вже сталося один раз (2026-08-06). Патч треба переносити вручну щоразу.
export const shortDateFmt = new Intl.DateTimeFormat("uk-UA", {
  month: "short",
  day: "numeric",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("uk-UA", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("uk-UA").format;
