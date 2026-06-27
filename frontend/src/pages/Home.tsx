import { useAuth } from "../context/AuthContext";

export function HomePage() {
  const { appContext, currentUser } = useAuth();
  const email = appContext?.user.email || currentUser?.email || "";
  const roles = appContext?.user.roles.join(" / ") || "No role assigned";
  const timezone = appContext?.site?.timezone || "America/Chicago";

  return (
    <section className="page">
      <p className="eyebrow">Admin context</p>
      <h1>Welcome {email}</h1>
      <dl className="user-details">
        <div>
          <dt>Site:</dt>
          <dd>{appContext?.site?.name || "No site assigned"}</dd>
        </div>
        <div>
          <dt>Role:</dt>
          <dd>{roles}</dd>
        </div>
        <div>
          <dt>Classrooms:</dt>
          <dd>{appContext?.classrooms.count ?? 0}</dd>
        </div>
        <div>
          <dt>Timezone:</dt>
          <dd>{timezone}</dd>
        </div>
      </dl>
    </section>
  );
}
