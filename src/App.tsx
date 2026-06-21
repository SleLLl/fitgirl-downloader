import { useState } from "react";
import { Button } from "@/components/ui/button";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useAppStore } from "@/store/useAppStore";

function App() {
  const [tab, setTab] = useState<"extract" | "downloads">("extract");
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
      </nav>
      <div className="p-4">
        <div hidden={tab !== "extract"}>
          <Game />
        </div>
        <div hidden={tab !== "downloads"}>
          <Downloads />
        </div>
      </div>
    </main>
  );
}

export default App;
