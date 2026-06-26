import { useState } from "react";
import { BottomNav, type NavItem } from "./components/BottomNav";
import { ClassroomsPage } from "./pages/Classrooms";
import { CommunicationPage } from "./pages/Communication";
import { HomePage } from "./pages/Home";
import { MorePage } from "./pages/More";
import { StudentsPage } from "./pages/Students";

const navItems: NavItem[] = [
  { id: "home", label: "Home" },
  { id: "students", label: "Students" },
  { id: "classrooms", label: "Classrooms" },
  { id: "communication", label: "Communication" },
  { id: "more", label: "More" }
];

function renderPage(activePage: NavItem["id"]) {
  switch (activePage) {
    case "students":
      return <StudentsPage />;
    case "classrooms":
      return <ClassroomsPage />;
    case "communication":
      return <CommunicationPage />;
    case "more":
      return <MorePage />;
    case "home":
    default:
      return <HomePage />;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<NavItem["id"]>("home");

  return (
    <div className="app-shell">
      <main className="app-main">{renderPage(activePage)}</main>
      <BottomNav items={navItems} activeId={activePage} onSelect={setActivePage} />
    </div>
  );
}
