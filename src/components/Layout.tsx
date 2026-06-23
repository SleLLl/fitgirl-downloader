import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Download, Library, Link2, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useAppStore } from "@/store/useAppStore";
import "./Layout.css";

const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

type NavTo = "/browse" | "/downloads" | "/library" | "/settings" | "/extract";

function NavItem({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: NavTo;
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active =
    pathname === to || (to === "/browse" && pathname.startsWith("/game"));
  const className = active ? "nav-item nav-item--active" : "nav-item";
  return (
    <Link to={to} className={className}>
      <Icon size={18} aria-hidden />
      <span className="nav-label">{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </Link>
  );
}

export function Layout() {
  useAppEvents();
  const activeCount = useAppStore(
    (s) =>
      Object.values(s.downloads).filter((d) =>
        ACTIVE_STATUSES.includes(d.status)
      ).length
  );

  return (
    <main className="app-shell dark">
      <aside className="sidebar">
        <div className="sidebar-brand">FitGirl</div>
        <nav className="sidebar-nav">
          <NavItem to="/browse" icon={Search} label="Browse" />
          <NavItem
            to="/downloads"
            icon={Download}
            label="Downloads"
            badge={activeCount}
          />
          <NavItem to="/library" icon={Library} label="Library" />
          <NavItem to="/settings" icon={Settings} label="Settings" />
        </nav>
        <div className="sidebar-footer">
          <NavItem to="/extract" icon={Link2} label="Add by link" />
        </div>
      </aside>
      <section className="app-content">
        <Outlet />
      </section>
    </main>
  );
}
