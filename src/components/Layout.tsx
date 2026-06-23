import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useAppStore } from "@/store/useAppStore";

const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

type NavTo = "/browse" | "/extract" | "/downloads" | "/library" | "/settings";

function NavLink({ to, label }: { to: NavTo; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || (to === "/browse" && pathname.startsWith("/game"));
  return (
    <Link
      to={to}
      className={buttonVariants({ variant: active ? "default" : "secondary" })}
    >
      {label}
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
  const downloadsLabel =
    activeCount > 0 ? `Downloads (${activeCount})` : "Downloads";

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <nav className="flex gap-2 p-3 border-b border-border">
        <NavLink to="/browse" label="Browse" />
        <NavLink to="/extract" label="Extract" />
        <NavLink to="/downloads" label={downloadsLabel} />
        <NavLink to="/library" label="Library" />
        <NavLink to="/settings" label="Settings" />
      </nav>
      <div className="p-4">
        <Outlet />
      </div>
    </main>
  );
}
