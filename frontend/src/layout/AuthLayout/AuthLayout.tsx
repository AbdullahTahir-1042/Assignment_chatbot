import type { ReactNode } from "react";
import { Card } from "../../ui/Card";
import logo from "../../assets/logo.png";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Full-screen chrome for the signed-out pages (login, signup). Rendered outside
 * AppShell, so this is the app's own face for anyone landing here. Two columns
 * on desktop -- form on the left, brand logo on the right -- stacked on a single
 * narrow column with a compact logo up top on small screens. Decorative glows
 * are aria-hidden and pointer-events-none, so they neither confuse screen
 * readers nor block clicks.
 */
export const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => (
  <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-indigo-100 px-4 py-10">
    <div aria-hidden className="pointer-events-none absolute -top-36 -right-28 size-96 rounded-full bg-indigo-200/60 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute -bottom-44 -left-28 size-[28rem] rounded-full bg-sky-200/70 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 size-72 rounded-full bg-white/60 blur-3xl" />

    <div className="relative mx-auto grid w-full max-w-5xl items-center gap-6 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col">
        <div className="mb-6 self-center lg:hidden">
          <img src={logo} alt="Slotly" className="w-44 sm:w-56" />
        </div>

        <Card className="rounded-2xl border-slate-200/70 p-6 shadow-[0_20px_45px_-18px_rgb(15_23_42_/_0.25)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">{footer}</div>
        </Card>
      </div>

      <div className="hidden flex-col items-center lg:flex">
        <img src={logo} alt="Slotly" className="w-full max-w-md" />
        <p className="mt-6 max-w-xs text-center text-sm text-slate-500">
          Appointments, booked in plain language.
        </p>
      </div>
    </div>
  </main>
);