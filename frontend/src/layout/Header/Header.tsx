import { NavLink } from "react-router";
import { useAuthStore } from "../../features/auth";

/** Nav plus identity. Renders links only for a signed-in user. */
export const Header = () => {
  const user = useAuthStore((s) => s.user);
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <NavLink to="/" className="text-sm font-semibold text-slate-900">
          Booking
        </NavLink>
        {user && <span className="truncate text-sm text-slate-500">{user.name}</span>}
      </div>
    </header>
  );
};
