"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { ChevronUp, MousePointer2, Users } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";

import {
  CURSOR_HZ,
  CURSOR_IDLE_MS,
  liveChannel,
  liveColor,
  liveLabel,
  pageLabel,
  PRESENCE_CHANNEL,
  type CursorPoint,
  type LivePeer,
  type LiveUser,
} from "@/lib/live";
import { cn } from "@/lib/utils";

/**
 * Живі курсори й присутність. Загальний задум, межі й обмеження трафіку —
 * у шапці `lib/live.ts`, тут лише механіка.
 *
 * Компонент монтується ВСІМ (інакше не буде кого показувати), але малює
 * щось тільки спостерігачеві — `canWatch` приходить із сервера.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Клієнт створюється ОДИН раз на вкладку, а не на кожен рендер: кожен
 * `createClient` піднімає власний websocket, і при навігації між сторінками
 * їх би накопичувалось стільки, скільки переходів.
 */
let client: ReturnType<typeof createClient> | null = null;
function supabase() {
  if (!URL_ || !KEY_) return null;
  if (!client) {
    client = createClient(URL_, KEY_, {
      auth: { persistSession: false },
      // Ліміт подій на секунду в самому клієнті — щоб навіть помилка в
      // тротлінгу нижче не перетворилась на потоп у каналі.
      realtime: { params: { eventsPerSecond: CURSOR_HZ } },
    });
  }
  return client;
}

const STORAGE_KEY = "live-cursors-on";

/**
 * Тумблер у localStorage — через `useSyncExternalStore`, а не через
 * `useState` + читання в ефекті.
 *
 * Читати localStorage прямо в `useState` не можна: на сервері його немає,
 * і розмітка розійшлася б при гідратації. Читати в ефекті й класти в стан
 * теж не варіант — це синхронний `setState` в тілі ефекту, тобто зайвий
 * каскад рендерів (на що й лається react-hooks/set-state-in-effect).
 * `useSyncExternalStore` — рівно той інструмент: сервер віддає дефолт,
 * клієнт одразу читає реальне значення.
 *
 * Побічний приз: підписка на `storage` синхронізує тумблер МІЖ ВКЛАДКАМИ.
 * Вимкнув курсори в одній — вони згасли в усіх, а не лишились жити в
 * забутій вкладці, яка продовжує просити чужі координати.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readToggle() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    // Приватне вікно чи заблоковані cookies — лишаємось на дефолті.
    return true;
  }
}

export function LivePresence({
  me,
  canWatch,
}: {
  me: LiveUser;
  canWatch: boolean;
}) {
  const pathname = usePathname();

  /**
   * Тумблер «показувати курсори». Прохання Микити: чужа стрілка, яка
   * їздить по таблиці, заважає читати цифри, і вимикати її має бути
   * швидше, ніж закривати вкладку.
   *
   * Стан у localStorage, тому переживає перезавантаження. Читаємо в
   * ефекті, а не в `useState`: на сервері localStorage немає, і читання
   * при ініціалізації дало б розбіжність розмітки при гідратації.
   */
  const on = useSyncExternalStore(subscribe, readToggle, () => true);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "0" : "1");
    } catch {}
    notify();
  }, [on]);

  /**
   * Стан підключення до каналу.
   *
   * Без нього фіча не має способу довести, що вона жива: порожня панель
   * однаково виглядає і коли нікого немає, і коли не доїхали змінні
   * оточення чи впав вебсокет («а може, воно не працює» — Микита,
   * 2026-09-01). Тепер це два різні стани й дві різні крапки.
   */
  const [status, setStatus] = useState<string>("CONNECTING");
  /** Розгорнутий список присутніх. */
  const [open, setOpen] = useState(false);
  const [peers, setPeers] = useState<LivePeer[]>([]);
  /** Курсор + локальна мітка часу отримання — з неї рахується «не
   *  активний» (чому не з presence — див. lib/live.ts). */
  type Seen = CursorPoint & { at: number };
  const [cursors, setCursors] = useState<Record<string, Seen>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<RealtimeChannel | null>(null);
  // Актуальні значення для колбека `subscribe`, який замикається один раз
  // на все життя каналу й інакше бачив би стан на момент підключення.
  const pathnameRef = useRef(pathname);
  const watchingRef = useRef(false);

  const watching = canWatch && on;

  // Чи є в каналі КИМОСЬ увімкнений перегляд. Поки немає — координати не
  // шле ніхто, і це головна економія трафіку (див. lib/live.ts).
  // Слати координати має сенс лише якщо спостерігач дивиться ЦЮ САМУ
  // сторінку: курсор на чужій сторінці нікому не показати.
  const watched = peers.some(
    (p) => p.watch && p.path === pathname && p.email !== me.email
  );

  // ── Канал присутності: ОДИН на весь дашборд ─────────────────────────
  // Не перепідключається при переходах між сторінками — змінюється лише
  // поле `path` у `track` (див. наступний ефект). Інакше кожен перехід рвав
  // би вебсокет і на секунду «виносив» тебе зі списку в усіх.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;

    const channel = sb.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: me.email } },
    });
    presenceRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<LivePeer>();
        setPeers(
          Object.values(state)
            .map((entries) => entries[entries.length - 1])
            .filter(Boolean)
        );
      })
      .subscribe((status) => {
        setStatus(status);
        if (status === "SUBSCRIBED") {
          void channel.track({
            ...me,
            path: pathnameRef.current,
            watch: watchingRef.current,
          } satisfies LivePeer);
        }
      });

    return () => {
      void sb.removeChannel(channel);
      presenceRef.current = null;
      setStatus("CONNECTING");
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.email]);

  // Сторінка або тумблер змінились — оновлюємо запис присутності, не
  // чіпаючи саме зʼєднання.
  useEffect(() => {
    pathnameRef.current = pathname;
    watchingRef.current = watching;
    const channel = presenceRef.current;
    if (!channel) return;
    void channel.track({ ...me, path: pathname, watch: watching } satisfies LivePeer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, watching]);

  // ── Канал курсорів: на сторінку ─────────────────────────────────────
  // Тут лише координати. Присутність сюди не пишемо: хто де — питання
  // глобальне, і відповідає на нього канал вище.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;

    const channel = sb.channel(liveChannel(pathname));
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as CursorPoint;
        if (p.email === me.email) return;
        setCursors((prev) => ({ ...prev, [p.email]: { ...p, at: Date.now() } }));
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
      channelRef.current = null;
      setCursors({});
    };
  }, [pathname, me.email]);

  // ── Відправка своєї позиції ─────────────────────────────────────────
  useEffect(() => {
    if (!watched) return;

    const interval = 1000 / CURSOR_HZ;
    let last = 0;
    let queued: { x: number; y: number } | null = null;

    const send = () => {
      const channel = channelRef.current;
      if (!channel || !queued) return;
      void channel.send({
        type: "broadcast",
        event: "cursor",
        payload: { email: me.email, ...queued } satisfies CursorPoint,
      });
      queued = null;
    };

    const onMove = (e: MouseEvent) => {
      // Координати рахуємо від контентної колонки, а не від вікна: у
      // глядача може бути 1280 в ширину, а в того, кого показуємо, 1920 —
      // відсотки вікна поставили б стрілку сантиметрів на десять убік.
      const main = document.querySelector("main");
      if (!main || document.hidden) return;
      const rect = main.getBoundingClientRect();
      if (rect.width === 0) return;
      queued = {
        x: (e.clientX - rect.left) / rect.width,
        // `clientY - rect.top` не залежить від прокрутки: обидва значення
        // виміряні у вікні, тож різниця — це відстань від верху контенту.
        y: e.clientY - rect.top,
      };
      const now = performance.now();
      if (now - last >= interval) {
        last = now;
        send();
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    const flush = window.setInterval(send, interval);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearInterval(flush);
    };
  }, [watched, me.email]);

  /**
   * «Зараз» тримаємо в СТАНІ, а не кличемо `Date.now()` у рендері.
   *
   * Рендер має бути чистим: `Date.now()` у ньому дає різний результат на
   * кожному проході, тож «активний / не активний» міг би змінитись від
   * будь-якого стороннього перерендеру, а не від того, що людина справді
   * перестала рухати мишею. Тік рідкий (2 с) — це не анімація, а
   * прибирання за тими, хто пішов на іншу вкладку.
   */
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!canWatch) return;
    // Перший тік — теж через таймер, а не синхронно в тілі ефекту: прямий
    // setState там дає зайвий каскад рендерів. Затримка в перші 2 секунди
    // ні на що не впливає — до неї просто ніхто ще не встиг «застаріти».
    const t = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(t);
  }, [canWatch]);

  if (!URL_ || !KEY_ || !canWatch) return null;

  const others = peers.filter((p) => p.email !== me.email);
  // Курсори — лише від тих, хто на цій самій сторінці. Решта видно в
  // списку присутніх із підписом, де вони.
  const onThisPage = others.filter((p) => p.path === pathname);
  const live = status === "SUBSCRIBED";

  return (
    <>
      {watching && (
        <CursorLayer cursors={cursors} peers={onThisPage} now={now} />
      )}

      {/*
        Панель у нижньому правому куті, а не в шапці сторінки. Шапку малює
        `PageHeader` окремо на кожній сторінці, і щоб додати туди щось із
        layout, довелося б протягувати контекст через усі сторінки заради
        однієї приколюхи. Кут — самодостатній і нікому не заважає.
      */}
      {live && open && others.length > 0 && (
        <ul className="fixed right-4 bottom-16 z-50 w-64 overflow-hidden rounded-xl border bg-card/95 py-1 shadow-lg backdrop-blur">
          {others.map((p) => (
            <li key={p.email}>
              <Link
                href={p.path as never}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <Avatar
                  peer={p}
                  here={p.path === pathname}
                  idle={now - (cursors[p.email]?.at ?? 0) > CURSOR_IDLE_MS}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {liveLabel(p)}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {pageLabel(p.path)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
        {/*
          Крапка стану каналу. Зелена — підключено, тобто «нікого» справді
          означає «нікого». Червона — звʼязку немає, і порожній список нічого
          не доводить.
        */}
        <span
          className="size-1.5 shrink-0 rounded-full"
          title={
            live
              ? "Канал підключено — присутність оновлюється в реальному часі"
              : `Немає звʼязку з каналом (${status}). Порожній список нічого не означає.`
          }
          style={{
            background: live
              ? "var(--status-good)"
              : status === "CONNECTING"
                ? "var(--status-warning)"
                : "var(--status-critical)",
          }}
        />
        <Users className="size-3.5 shrink-0 text-muted-foreground" />
        {!live ? (
          <span className="text-[11px] text-muted-foreground">
            Немає звʼязку
          </span>
        ) : others.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Крім тебе — нікого
          </span>
        ) : (
          <div className="flex -space-x-1.5">
            {others.map((p) => (
              <Avatar
                key={p.email}
                peer={p}
                here={p.path === pathname}
                idle={now - (cursors[p.email]?.at ?? 0) > CURSOR_IDLE_MS}
              />
            ))}
          </div>
        )}
        {/*
          Підпис «хто де». Заради нього все й затівалось: побачити, що
          Микола сидить на SLA, корисніше за його стрілку — і видно це
          навіть коли ти сам на іншій сторінці.
        */}
        {live && others.length > 0 && (
          <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
            {others.length === 1
              ? `${liveLabel(others[0])} · ${pageLabel(others[0].path)}`
              : `${others.length} онлайн`}
          </span>
        )}
        {/*
          Розгорнутий список — бо головне питання «хто зараз у дашборді і де»,
          а не «чия це стрілка». Аватарки на нього відповідають лише через
          наведення, тобто по одній людині за раз.
        */}
        {live && others.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            title={open ? "Згорнути список" : "Хто зараз у дашборді"}
            className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent"
          >
            <ChevronUp
              className={cn("size-3 transition-transform", open && "rotate-180")}
            />
          </button>
        )}
        <button
          onClick={toggle}
          title={
            on
              ? "Сховати чужі курсори (не заважатимуть читати таблиці)"
              : "Показати чужі курсори"
          }
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            on
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          <MousePointer2 className="size-3" />
        </button>
      </div>
    </>
  );
}

function Avatar({
  peer,
  idle,
  here,
}: {
  peer: LivePeer;
  idle: boolean;
  /** Людина на тій самій сторінці, що й ти, — тобто її курсор видно. */
  here: boolean;
}) {
  const color = liveColor(peer.email);
  return (
    <span
      title={`${liveLabel(peer)} · ${pageLabel(peer.path)}${
        here ? "" : " (інша сторінка)"
      }${idle ? " · не активний" : ""}`}
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-medium text-white transition-opacity",
        // Пригашуємо і тих, хто мовчить, і тих, хто на іншій сторінці:
        // яскраві — це ті, чиї курсори ти зараз бачиш.
        (idle || !here) && "opacity-40"
      )}
      style={{ background: color }}
    >
      {peer.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={peer.image}
          alt=""
          className="size-full rounded-full object-cover"
        />
      ) : (
        liveLabel(peer).charAt(0).toUpperCase()
      )}
    </span>
  );
}

/**
 * Шар із чужими курсорами.
 *
 * ── Чому пружина, а не власна інтерполяція ────────────────────────────────
 * Перша версія рахувала проміжну точку сама, у циклі `requestAnimationFrame`
 * (`cur + (target - cur) * 0.2`). Працювало, але виглядало «гумово»: рух
 * однаково млявий і на короткому смиканні, і на кидку через пів екрана.
 * `useSpring` із motion (він уже в залежностях) дає фізику замість лінійного
 * наближення — курсор доганяє швидко й зупиняється без хвоста, як у
 * прикладі Animate UI, який скинув Микита.
 *
 * Позиція лишається в системі координат КОНТЕНТУ й перераховується в
 * геометрію глядача на кожному кадрі: інакше при прокрутці чужа стрілка
 * висіла б на місці екрана, хоча вказувала вона на блок сторінки.
 */
function CursorLayer({
  cursors,
  peers,
  now,
}: {
  cursors: Record<string, CursorPoint & { at: number }>;
  peers: LivePeer[];
  /** Спільний «зараз» із батька — щоб рендер лишався чистим. */
  now: number;
}) {
  const byEmail = new Map(peers.map((p) => [p.email, p]));

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Object.entries(cursors).map(([email, point]) => {
        const peer = byEmail.get(email);
        if (!peer || now - point.at > CURSOR_IDLE_MS) return null;
        return (
          <Cursor key={email} point={point} peer={peer} />
        );
      })}
    </div>
  );
}

const SPRING = { stiffness: 520, damping: 42, mass: 0.6 } as const;

function Cursor({
  point,
  peer,
}: {
  point: CursorPoint;
  peer: LivePeer;
}) {
  const color = liveColor(peer.email);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, SPRING);
  const y = useSpring(rawY, SPRING);

  // Перерахунок у координати ГЛЯДАЧА щокадрово: сторінка може прокручуватись
  // під нерухомим чужим курсором, і тоді екранна точка змінюється без жодного
  // нового повідомлення.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const main = document.querySelector("main");
      if (main) {
        const rect = main.getBoundingClientRect();
        rawX.set(rect.left + point.x * rect.width);
        rawY.set(rect.top + point.y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [point, rawX, rawY]);

  return (
    <motion.div className="absolute top-0 left-0" style={{ x, y }}>
      {/*
        Стрілка з БІЛОЮ обводкою: без неї курсор кольору людини губиться на
        темних графіках і темній темі. Та сама причина, чому системний
        курсор скрізь має контур.
      */}
      <svg
        width="20"
        height="22"
        viewBox="0 0 20 22"
        fill="none"
        className="drop-shadow-sm"
      >
        <path
          d="M3.5 2.2 L15.5 12.4 L9.6 13.1 L12.2 18.6 L9.4 19.9 L6.8 14.3 L3.5 17.6 Z"
          fill={color}
          stroke="white"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <motion.span
        initial={{ opacity: 0, scale: 0.8, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="ml-4 -mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap text-white shadow-sm"
        style={{ background: color }}
      >
        {liveLabel(peer)}
      </motion.span>
    </motion.div>
  );
}
