import { useState } from "react";
import { BottomNav, type NavItem } from "./components/BottomNav";
import { useAuth } from "./context/AuthContext";
import { ClassroomsPage } from "./pages/Classrooms";
import { CommunicationPage } from "./pages/Communication";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
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
  const { currentUser, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState<NavItem["id"]>("home");

  if (loading) {
    return (
      <main className="loading-screen">
        <p>Loading...</p>
      </main>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span>ChildcAir</span>
        <button className="text-button" type="button" onClick={logout}>
          Logout
        </button>
      </header>
      <main className="app-main">{renderPage(activePage)}</main>
      <BottomNav items={navItems} activeId={activePage} onSelect={setActivePage} />
    </div>
  );
}
