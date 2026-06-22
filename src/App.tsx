import { Button } from "@/components/ui/button";
import Browse from "@/pages/Browse";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";
import Settings from "@/pages/Settings";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useAppStore, type Tab } from "@/store/useAppStore";

const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const activeCount = useAppStore(
    (s) =>
      Object.values(s.downloads).filter((d) =>
        ACTIVE_STATUSES.includes(d.status)
      ).length
  );

  useAppEvents();

  const selectTab = (target: Tab) => () => setTab(target);
  const variantFor = (target: Tab) => (tab === target ? "default" : "secondary");
  const downloadsLabel =
    activeCount > 0 ? `Downloads (${activeCount})` : "Downloads";

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <nav className="flex gap-2 p-3 border-b border-border">
        <Button variant={variantFor("browse")} onClick={selectTab("browse")}>
          Browse
        </Button>
        <Button variant={variantFor("extract")} onClick={selectTab("extract")}>
          Extract
        </Button>
        <Button
          variant={variantFor("downloads")}
          onClick={selectTab("downloads")}
        >
          {downloadsLabel}
        </Button>
        <Button
          variant={variantFor("settings")}
          onClick={selectTab("settings")}
        >
          Settings
        </Button>
      </nav>

      <div className="p-4">
        <div hidden={tab !== "browse"}>
          <Browse />
        </div>
        <div hidden={tab !== "extract"}>
          <Game />
        </div>
        <div hidden={tab !== "downloads"}>
          <Downloads />
        </div>
        <div hidden={tab !== "settings"}>
          <Settings />
        </div>
      </div>
    </main>
  );
}

export default App;
