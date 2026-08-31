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
import { MousePointer2, Users } from "lucide-react";

import {
  CURSOR_HZ,
  CURSOR_IDLE_MS,
  liveChannel,
  liveColor,
  liveLabel,
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

  const [peers, setPeers] = useState<LivePeer[]>([]);
  /** Курсор + локальна мітка часу отримання — з неї рахується «не
   *  активний» (чому не з presence — див. lib/live.ts). */
  type Seen = CursorPoint & { at: number };
  const [cursors, setCursors] = useState<Record<string, Seen>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  const watching = canWatch && on;

  // Чи є в каналі КИМОСЬ увімкнений перегляд. Поки немає — координати не
  // шле ніхто, і це головна економія трафіку (див. lib/live.ts).
  const watched = peers.some((p) => p.watch && p.email !== me.email);

  // ── Канал: присутність ──────────────────────────────────────────────
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;

    const channel = sb.channel(liveChannel(pathname), {
      config: { presence: { key: me.email } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<LivePeer>();
        setPeers(
          Object.values(state)
            .map((entries) => entries[entries.length - 1])
            .filter(Boolean)
        );
      })
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as CursorPoint;
        if (p.email === me.email) return;
        setCursors((prev) => ({ ...prev, [p.email]: { ...p, at: Date.now() } }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ ...me, watch: watching } satisfies LivePeer);
        }
      });

    return () => {
      void sb.removeChannel(channel);
      channelRef.current = null;
      setPeers([]);
      setCursors({});
    };
    // `watching` навмисно НЕ в залежностях: перепідключати канал через
    // тумблер — це рвати з'єднання на кожен клік. Прапорець оновлюється
    // окремим `track` нижче.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, me.email]);

  // Тумблер міняє лише прапорець присутності — щоб інші дізнались, що
  // дивитись більше нікому, і перестали слати.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.track({ ...me, watch: watching } satisfies LivePeer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

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

  return (
    <>
      {watching && <CursorLayer cursors={cursors} peers={others} now={now} />}

      {/*
        Панель у нижньому правому куті, а не в шапці сторінки. Шапку малює
        `PageHeader` окремо на кожній сторінці, і щоб додати туди щось із
        layout, довелося б протягувати контекст через усі сторінки заради
        однієї приколюхи. Кут — самодостатній і нікому не заважає.
      */}
      <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
        <Users className="size-3.5 shrink-0 text-muted-foreground" />
        {others.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Крім тебе — нікого
          </span>
        ) : (
          <div className="flex -space-x-1.5">
            {others.map((p) => (
              <Avatar
                key={p.email}
                peer={p}
                idle={now - (cursors[p.email]?.at ?? 0) > CURSOR_IDLE_MS}
              />
            ))}
          </div>
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

function Avatar({ peer, idle }: { peer: LivePeer; idle: boolean }) {
  const color = liveColor(peer.email);
  return (
    <span
      title={`${liveLabel(peer)}${idle ? " · не активний" : ""}`}
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-medium text-white transition-opacity",
        idle && "opacity-40"
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
 * Позиція перераховується в геометрію ГЛЯДАЧА на кожному кадрі, а не
 * запам'ятовується в пікселях: інакше при прокрутці сторінки чужа стрілка
 * лишалась би висіти на місці екрана, хоча вказувала вона на контент.
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
  const [frame, setFrame] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const pos = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const main = document.querySelector("main");
      if (main) {
        const rect = main.getBoundingClientRect();
        const next: Record<string, { x: number; y: number }> = {};
        for (const [email, p] of Object.entries(cursors)) {
          const target = {
            x: rect.left + p.x * rect.width,
            y: rect.top + p.y,
          };
          // Проміжна точка між поточною і цільовою: повідомлення приходять
          // 10 разів на секунду, і без згладжування стрілка стрибала б
          // ривками. 0.2 — компроміс: менше тягнеться, більше смикається.
          const cur = pos.current[email] ?? target;
          next[email] = {
            x: cur.x + (target.x - cur.x) * 0.2,
            y: cur.y + (target.y - cur.y) * 0.2,
          };
        }
        pos.current = next;
        setFrame(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cursors]);

  const byEmail = new Map(peers.map((p) => [p.email, p]));

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Object.entries(frame).map(([email, p]) => {
        const peer = byEmail.get(email);
        const seen = cursors[email];
        if (!peer || !seen || now - seen.at > CURSOR_IDLE_MS) return null;
        const color = liveColor(email);
        return (
          <div
            key={email}
            className="absolute top-0 left-0 will-change-transform"
            style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
          >
            <MousePointer2
              className="size-4 drop-shadow"
              style={{ color, fill: color }}
            />
            <span
              className="ml-3 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white"
              style={{ background: color }}
            >
              {liveLabel(peer)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
