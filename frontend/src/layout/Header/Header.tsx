import { NavLink } from "react-router";
import logo from "../../assets/logo.png";
import { UserMenu } from "../UserMenu";

/**
 * Nav plus identity: brand logo up front, and the user menu (avatar → profile /
 * logout) after it.
 */
export const Header = () => (
  <header className="border-b border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
    <div className="flex w-full items-center justify-between gap-4 py-3 pr-3">
      <NavLink to="/dashboard" className="shrink-0" aria-label="Slotly home">
        <img src={logo} alt="Slotly" className="h-9 w-36 object-cover object-left" />
      </NavLink>
      <UserMenu />
    </div>
  </header>
);