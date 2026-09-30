import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Card } from "../../../../ui/Card";
import { Button } from "../../../../ui/Button";
import { Spinner } from "../../../../ui/Spinner";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { EmptyState } from "../../../../ui/EmptyState";
import { toMessage } from "../../../../lib/http";
import { cn } from "../../../../lib/cn";
import { browserTimezone } from "../../../../lib/timezone";
import { dateKeyInUserZone } from "../../../../lib/datetime";
import { useAppointments } from "../../hooks/useAppointments";
import { AppointmentItem } from "../AppointmentItem";
import type { Appointment } from "../../appointments.types";

type ViewMode = "day" | "week" | "month";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const CELLS_PER_MONTH_GRID = 35; // 5 rows of 7
const DEFAULT_HOUR_MIN = 0;
const DEFAULT_HOUR_MAX = 23;
const ROW_HEIGHT_PX = 56; // matches the 3.5rem time-grid rows

const TODAY = new Date();

// Every Date the render path needs is built through these tiny module helpers,
// so the component never touches the Date global itself and rendering stays
// deterministic for a given cursor.
const dateYmd = (y: number, m: number, d: number): Date => new Date(y, m, d);
const dateFromMs = (ms: number): Date => new Date(ms);
const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (start: Date, days: number): Date => {
  const next = new Date(start);
  next.setDate(start.getDate() + days);
  return next;
};
const wrapperScrollTop = (scroller: HTMLElement, target: HTMLElement, offset = 8): void => {
  scroller.scrollTop = Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset);
};
const startOfWeek = (date: Date): Date => dateYmd(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
const daysInMonth = (year: number, month: number): number => dateYmd(year, month + 1, 0).getDate();
const hourInUserZone = (iso: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: browserTimezone(),
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
};
const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: browserTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(iso));
const formatHour = (hour: number): string =>
  new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h12" }).format(new Date(2000, 0, 1, hour));
const formatDayCell = (date: Date): string => `${WEEKDAY_LABELS[date.getDay()]} ${date.getDate()}`;
const formatDayTitle = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(date);
const formatDayHeading = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
const formatClock = (ms: number): string =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(dateFromMs(ms));

/**
 * The schedule: a time grid with dates horizontally, time vertically, and three
 * ways of looking at the same data. Day shows one column, week shows the seven
 * days of the week, and month keeps a classic calendar grid whose cells list
 * their day's bookings time-first. The list query is paginated, but a calendar
 * wants everything, so remaining pages are fetched while the view grows.
 */
export const AppointmentCalendar = () => {
  const { data, isPending, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useAppointments();

  const [view, setView] = useState<ViewMode>("week");
  const [cursorMs, setCursorMs] = useState<number>(TODAY.getTime());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!dayDialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDayDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayDialogOpen]);

  const appointments = useMemo(() => data?.pages.flatMap((p) => p.appointments) ?? [], [data]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const key = dateKeyInUserZone(appointment.startsAt);
      const next = map.get(key) ? [...map.get(key)!, appointment] : [appointment];
      map.set(key, next.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    }
    return map;
  }, [appointments]);

  const cursor = dateFromMs(cursorMs);
  const cursorDateKey = localDateKey(cursor);
  const isMonthView = view === "month";

  const visibleDates = useMemo<Date[]>(() => {
    if (view === "day") return [dateFromMs(cursorMs)];
    const start = startOfWeek(dateFromMs(cursorMs));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, cursorMs]);

  const visibleKeySet = useMemo(() => new Set(visibleDates.map(localDateKey)), [visibleDates]);

  // Day/week rows: one per hour spanning the earliest to latest booking, widened
  // to a sane business window when nothing is booked.
  const hours = useMemo(() => {
    let min = DEFAULT_HOUR_MIN;
    let max = DEFAULT_HOUR_MAX;
    for (const appointment of appointments) {
      if (!visibleKeySet.has(dateKeyInUserZone(appointment.startsAt))) continue;
      const start = hourInUserZone(appointment.startsAt);
      if (start < min) min = Math.max(0, start);
      const end = start + Math.ceil(appointment.durationMinutes / 60);
      if (end > max) max = Math.min(23, end);
    }
    return Array.from({ length: Math.max(1, max - min + 1) }, (_, i) => min + i);
  }, [appointments, visibleKeySet]);

  const slotsByDayHour = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      if (!visibleKeySet.has(dateKeyInUserZone(appointment.startsAt))) continue;
      const cell = `${dateKeyInUserZone(appointment.startsAt)}:${hourInUserZone(appointment.startsAt)}`;
      const existing = map.get(cell);
      if (existing) existing.push(appointment);
      else map.set(cell, [appointment]);
    }
    return map;
  }, [appointments, visibleKeySet]);

  const monthCells = isMonthView ? monthGrid(cursor.getFullYear(), cursor.getMonth()) : [];
  const sevenDayDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(dateFromMs(cursorMs), i)),
    [cursorMs],
  );
  const sevenDayCount = useMemo(
    () => sevenDayDates.reduce((count, date) => count + (byDay.get(localDateKey(date))?.length ?? 0), 0),
    [sevenDayDates, byDay],
  );

  const moveCursor = (delta: number) => {
    if (view === "day") setCursorMs(addDays(dateFromMs(cursorMs), delta).getTime());
    else if (view === "week") setCursorMs(addDays(dateFromMs(cursorMs), delta * 7).getTime());
    else setCursorMs(shiftMonth(cursorMs, delta));
  };

  const pickDay = (date: Date) => {
    setCursorMs(date.getTime());
    setView("day");
  };

  return (
    <Card className="relative flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Calendar view">
          {VIEWS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors duration-150",
                view === value
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => moveCursor(-1)} aria-label="Previous day" className="px-2">
            ‹
          </Button>
          <button
            type="button"
            onClick={() => setCursorMs(TODAY.getTime())}
            title="Go to today"
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-indigo-50/70"
          >
            {formatDayTitle(cursor)}
          </button>
          <Button variant="ghost" size="sm" onClick={() => moveCursor(1)} aria-label="Next day" className="px-2">
            ›
          </Button>
        </div>
        <span className="rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-sm shadow-indigo-600/25">
          {formatClock(nowMs)}
        </span>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto" ref={scrollerRef}>
        {isPending ? (
          <div className="flex justify-center py-12">
            <Spinner label="Loading schedule" />
          </div>
        ) : isError ? (
          <ErrorMessage message={toMessage(error)} />
        ) : isMonthView ? (
          <MonthGrid
            cells={monthCells}
            month={cursor.getMonth()}
            byDay={byDay}
            cursorDateKey={cursorDateKey}
            onPick={pickDay}
            scrollerRef={scrollerRef}
          />
        ) : (
          <TimeGrid
            dates={visibleDates}
            hours={hours}
            slots={slotsByDayHour}
            cursorDateKey={cursorDateKey}
            nowMs={nowMs}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setDayDialogOpen(true)}
        aria-label="Show appointments for the next seven days"
        title="Show appointments for the next seven days"
        className="absolute bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 transition-colors duration-150 hover:from-indigo-500 hover:to-violet-500"
      >
        <CalendarIcon />
        {sevenDayCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold tabular-nums text-white">
            {sevenDayCount}
          </span>
        )}
      </button>

      {dayDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            aria-hidden
            onClick={() => setDayDialogOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Appointments for the next seven days"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-indigo-950/20"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/25">
                  <CalendarIcon />
                </span>
                <div>
                  <p className="text-sm text-slate-500">Appointments</p>
                  <p className="text-lg font-semibold leading-tight text-slate-900">Next 7 days</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
                  {sevenDayCount} total
                </span>
                <button
                  type="button"
                  onClick={() => setDayDialogOpen(false)}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700"
                >
                  <XIcon />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white px-5 py-4">
              {sevenDayCount === 0 ? (
                <EmptyState title="No appointments" description="Nothing booked in the next seven days." />
              ) : (
                sevenDayDates
                  .filter((date) => (byDay.get(localDateKey(date))?.length ?? 0) > 0)
                  .map((date) => {
                    const key = localDateKey(date);
                    const list = byDay.get(key) ?? [];
                    return (
                      <section key={key}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-indigo-500" />
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                            {formatDayHeading(date)}
                          </h3>
                          <span className="h-px flex-1 bg-slate-200" />
                          <span className="text-[11px] font-medium tabular-nums text-slate-400">{list.length}</span>
                        </div>
                        <div className="space-y-3">
                          {list.map((appointment) => (
                            <AppointmentItem key={appointment.id} appointment={appointment} />
                          ))}
                        </div>
                      </section>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const shiftMonth = (ms: number, delta: number): number => {
  const d = dateFromMs(ms);
  const targetMonth = d.getMonth() + delta;
  const year = d.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(d.getDate(), daysInMonth(year, month));
  return dateYmd(year, month, day).getTime();
};

function monthGrid(year: number, month: number): Date[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  // Five sequential weeks: trailing days of the previous month, this month, then
  // the leading days of the next — the grid is always full at exactly 5 rows.
  const firstCell = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: CELLS_PER_MONTH_GRID }, (_, i) => addDays(firstCell, i));
}

function MonthGrid({
  cells,
  month,
  byDay,
  cursorDateKey,
  onPick,
  scrollerRef,
}: {
  cells: Date[];
  month: number;
  byDay: Map<string, Appointment[]>;
  cursorDateKey: string;
  onPick: (date: Date) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const todayRef = useRef<HTMLButtonElement>(null);

  // Entering month view can leave "today" cell hidden below the fold; reveal it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const today = todayRef.current;
    if (!scroller || !today) return;
    wrapperScrollTop(scroller, today);
  }, [scrollerRef]);

  return (
    <div className="h-full">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div
        className="grid min-h-full min-w-0 grid-cols-7 gap-1"
        style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(min-content, 1fr))` }}
      >
        {cells.map((date) => {
          const key = localDateKey(date);
          const isOutOfMonth = date.getMonth() !== month;
          const dayAppointments = byDay.get(key) ?? [];
          const isToday = localDateKey(TODAY) === key;
          const isCursor = key === cursorDateKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(date)}
              ref={isToday ? todayRef : undefined}
              className={cn(
                "flex min-h-24 flex-col gap-1 overflow-hidden rounded-lg border p-1.5 text-left transition-colors duration-150",
                isCursor
                  ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                  : isOutOfMonth
                    ? "border-slate-100 bg-slate-50/60 hover:border-slate-200 hover:bg-slate-100/60"
                    : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  isToday ? "text-indigo-600" : isOutOfMonth ? "text-slate-300" : "text-slate-600",
                )}
              >
                {date.getDate()}
              </span>
              <span className="flex flex-col gap-0.5 overflow-hidden">
                {dayAppointments.slice(0, 3).map((a) => (
                  <span
                    key={a.id}
                    className={cn(
                      "truncate rounded-md px-1 py-0.5 text-[11px] leading-4",
                      a.status === "cancelled"
                        ? isOutOfMonth ? "bg-slate-100 text-slate-300 line-through" : "bg-slate-100 text-slate-400 line-through"
                        : isOutOfMonth ? "bg-slate-200/60 text-slate-400" : "bg-indigo-600/10 text-indigo-700",
                    )}
                    title={a.service}
                  >
                    {formatTime(a.startsAt)} {a.service}
                  </span>
                ))}
                {dayAppointments.length > 3 && (
                  <span className={cn("px-1 text-[11px]", isOutOfMonth ? "text-slate-400" : "text-slate-500")}>
                    +{dayAppointments.length - 3} more
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  dates,
  hours,
  slots,
  cursorDateKey,
  nowMs,
}: {
  dates: Date[];
  hours: number[];
  slots: Map<string, Appointment[]>;
  cursorDateKey: string;
  nowMs: number;
}) {
  const gridScrollerRef = useRef<HTMLDivElement>(null);
  const todayKey = localDateKey(dateFromMs(nowMs));
  const hasToday = dates.some((date) => localDateKey(date) === todayKey);
  const todayIndex = dates.findIndex((date) => localDateKey(date) === todayKey);

  // Vertical position of "now" measured in the grid's fixed-height rows.
  const firstHour = hours[0] ?? 0;
  const now = dateFromMs(nowMs);
  const elapsedMinutes = now.getHours() * 60 + now.getMinutes() - firstHour * 60;
  const nowTop = (elapsedMinutes / 60) * ROW_HEIGHT_PX;
  const showNow = hasToday && nowTop >= 0 && nowTop <= hours.length * ROW_HEIGHT_PX;

  // Bring the current time into focus once per rendered grid content (the set of
  // visible days). Switching day/week changes that key, so re-entering today's
  // grid refocuses; the ticking clock only moves nowTop without re-scrolling.
  const focusedGridRef = useRef<string | null>(null);
  const gridKey = dates.map(localDateKey).join("|");
  useEffect(() => {
    if (!showNow || focusedGridRef.current === gridKey) return;
    const scroller = gridScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = Math.max(0, nowTop - ROW_HEIGHT_PX);
    if (todayIndex > 0) {
      const colLeft = todayIndex * 128; // min column width, 8rem
      if (colLeft + 128 > scroller.scrollLeft + scroller.clientWidth) {
        scroller.scrollLeft = Math.max(0, colLeft + 128 - scroller.clientWidth);
      }
    }
    focusedGridRef.current = gridKey;
  }, [showNow, nowTop, todayIndex, gridKey]);

  const dayColumns = `repeat(${dates.length}, minmax(8rem, 1fr))`;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200">
      <div ref={gridScrollerRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        {/* Day headers: sticky in the vertical axis. A block-level child of the
            scroller (not a grid item), so its clamp box spans the whole column. */}
        <div
          className="min-w-max border-b border-slate-200"
          style={{ position: "sticky", top: 0, zIndex: 20, backgroundColor: "white" }}
        >
          <div className="grid" style={{ gridTemplateColumns: `3.5rem ${dayColumns}` }}>
            <div
              className="border-r border-slate-200"
              style={{ position: "sticky", left: 0, zIndex: 30, backgroundColor: "white" }}
            />
            {dates.map((date) => {
              const key = localDateKey(date);
              const isCursor = key === cursorDateKey;
              const isToday = localDateKey(TODAY) === key;
              return (
                <div
                  key={key}
                  className={cn(
                    "border-l border-slate-200 px-2 py-1.5 text-xs font-medium",
                    isCursor ? "bg-indigo-50 text-indigo-700" : isToday ? "text-indigo-600" : "text-slate-600",
                  )}
                >
                  {formatDayCell(date)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Hour labels + slot cells. The hour column is a sticky flex panel in
            the horizontal axis; the day grid next to it carries the slots. */}
        <div className="flex min-w-max">
          <div
            className="flex w-14 shrink-0 flex-col border-r border-slate-200"
            style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: "white" }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-14 shrink-0 border-t border-slate-100 pr-2 pt-1.5 text-right text-xs text-slate-400"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
          <div
            className="relative grid flex-1"
            style={{ gridTemplateColumns: dayColumns, gridTemplateRows: `repeat(${hours.length}, 3.5rem)` }}
          >
            {hours.map((hour) =>
              dates.map((date) => {
                const key = `${localDateKey(date)}:${hour}`;
                const daySlots = slots.get(key) ?? [];
                return (
                  <div key={key} className="flex flex-col gap-1 overflow-hidden border-l border-t border-slate-100 p-1">
                    {daySlots.map((a) => (
                      <span
                        key={a.id}
                        className={cn(
                          "truncate rounded-md px-1.5 py-1 text-xs",
                          a.status === "cancelled"
                            ? "bg-slate-100 text-slate-400 line-through"
                            : "bg-indigo-600/10 text-indigo-700",
                        )}
                        title={`${formatTime(a.startsAt)} · ${a.durationMinutes} min`}
                      >
                        {formatTime(a.startsAt)} {a.service}
                      </span>
                    ))}
                  </div>
                );
              }),
            )}

            {showNow && todayIndex >= 0 && (
              <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop }}>
                <div className="relative h-0">
                  <div className="absolute inset-x-0 -top-px border-t-2 border-rose-500" />
                  <span
                    className="absolute -top-3 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm"
                    style={{ left: `${(todayIndex / dates.length) * 100}%` }}
                  >
                    {formatClock(nowMs)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const CalendarIcon = () => (
  <svg
    aria-hidden
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
    />
  </svg>
);

const XIcon = () => (
  <svg
    aria-hidden
    className="size-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

