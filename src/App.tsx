import { Button } from "@/components/ui/button";
import Browse from "@/pages/Browse";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";
import Settings from "@/pages/Settings";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useAppStore } from "@/store/useAppStore";

function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  useAppEvents();
  const active = useAppStore(
    (s) =>
      Object.values(s.downloads).filter((d) =>
        ["downloading", "queued", "paused"].includes(d.status)
      ).length
  );
  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <nav className="flex gap-2 p-3 border-b border-border">
        <Button
          variant={tab === "browse" ? "default" : "secondary"}
          onClick={() => setTab("browse")}
        >
          Browse
        </Button>
        <Button
          variant={tab === "extract" ? "default" : "secondary"}
          onClick={() => setTab("extract")}
        >
          Extract
        </Button>
        <Button
          variant={tab === "downloads" ? "default" : "secondary"}
          onClick={() => setTab("downloads")}
        >
          Downloads{active > 0 ? ` (${active})` : ""}
        </Button>
        <Button
          variant={tab === "settings" ? "default" : "secondary"}
          onClick={() => setTab("settings")}
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
