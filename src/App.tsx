import { useState } from "react";
import { Button } from "@/components/ui/button";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";

function App() {
  const [tab, setTab] = useState<"extract" | "downloads">("extract");
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
          Downloads
        </Button>
      </nav>
      <div className="p-4">{tab === "extract" ? <Game /> : <Downloads />}</div>
    </main>
  );
}

export default App;
