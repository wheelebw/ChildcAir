import { useAuth } from "../context/AuthContext";

export function HomePage() {
  const { currentUser } = useAuth();
  const displayName = currentUser?.displayName || currentUser?.email || "there";

  return (
    <section className="page">
      <p className="eyebrow">Authenticated</p>
      <h1>Welcome {displayName}</h1>
      <dl className="user-details">
        <div>
          <dt>Email:</dt>
          <dd>{currentUser?.email}</dd>
        </div>
        <div>
          <dt>Firebase UID:</dt>
          <dd>{currentUser?.uid}</dd>
        </div>
      </dl>
    </section>
  );
}
