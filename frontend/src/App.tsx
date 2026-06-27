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

function renderPage(activePage: NavItem["id"], initialStudentId: string, onOpenStudent: (studentId: string) => void) {
  switch (activePage) {
    case "students":
      return <StudentsPage initialStudentId={initialStudentId} />;
    case "classrooms":
      return <ClassroomsPage onOpenStudent={onOpenStudent} />;
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
  const { appContextError, appContextLoading, currentUser, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState<NavItem["id"]>("home");
  const [initialStudentId, setInitialStudentId] = useState("");

  function openStudentProfile(studentId: string) {
    setInitialStudentId(studentId);
    setActivePage("students");
  }

  function selectNavPage(pageId: NavItem["id"]) {
    setInitialStudentId("");
    setActivePage(pageId);
  }

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

  if (appContextLoading) {
    return (
      <main className="loading-screen">
        <p>Loading your ChildcAir site...</p>
      </main>
    );
  }

  if (appContextError) {
    return (
      <main className="login-screen">
        <section className="login-panel" aria-live="polite">
          <p className="eyebrow">Access pending</p>
          <h1>Not invited yet</h1>
          <p className="page-copy">{appContextError}</p>
          <button className="primary-button" type="button" onClick={logout}>
            Logout
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span>ChildcAir</span>
        <button className="text-button" type="button" onClick={logout}>
          Logout
        </button>
      </header>
      <main className="app-main">{renderPage(activePage, initialStudentId, openStudentProfile)}</main>
      <BottomNav items={navItems} activeId={activePage} onSelect={selectNavPage} />
    </div>
  );
}
