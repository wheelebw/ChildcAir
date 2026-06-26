export type NavItem = {
  id: "home" | "students" | "classrooms" | "communication" | "more";
  label: string;
};

type BottomNavProps = {
  items: NavItem[];
  activeId: NavItem["id"];
  onSelect: (id: NavItem["id"]) => void;
};

const icons: Record<NavItem["id"], string> = {
  home: "H",
  students: "S",
  classrooms: "C",
  communication: "M",
  more: "+"
};

export function BottomNav({ items, activeId, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {icons[item.id]}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
