import { useState } from "react";
import { IncidentsPage } from "./Incidents";

export function MorePage() {
  const [activeTool, setActiveTool] = useState<"menu" | "incidents">("menu");

  if (activeTool === "incidents") {
    return <IncidentsPage onBack={() => setActiveTool("menu")} />;
  }

  return (
    <section className="page">
      <p className="eyebrow">Settings</p>
      <h1>More</h1>
      <p className="page-copy">Administration, documents, billing links, and account tools will live here.</p>
      <div className="tool-list">
        <button className="tool-card" type="button" onClick={() => setActiveTool("incidents")}>
          <strong>Incidents</strong>
          <small>Create and review student incident reports.</small>
        </button>
      </div>
    </section>
  );
}
