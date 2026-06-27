import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listCustomListItems, type CustomListItem } from "../services/api";

type IncidentLocationFieldProps = {
  location: string;
  otherLocation: string;
  onLocationChange: (value: string) => void;
  onOtherLocationChange: (value: string) => void;
};

export function IncidentLocationField({
  location,
  otherLocation,
  onLocationChange,
  onOtherLocationChange
}: IncidentLocationFieldProps) {
  const { currentUser } = useAuth();
  const [locations, setLocations] = useState<CustomListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadLocations() {
      if (!currentUser) {
        return;
      }

      setError("");

      try {
        const token = await currentUser.getIdToken();
        setLocations(await listCustomListItems(token, "incident_location"));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load incident locations.");
      }
    }

    void loadLocations();
  }, [currentUser]);

  return (
    <>
      <label className="field">
        <span>Location</span>
        <select value={location} onChange={(event) => onLocationChange(event.target.value)}>
          <option value="">Select location</option>
          {locations.map((item) => (
            <option key={item.id} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {location === "Other" ? (
        <label className="field">
          <span>Other location</span>
          <input value={otherLocation} onChange={(event) => onOtherLocationChange(event.target.value)} />
        </label>
      ) : null}
      {error ? <p className="form-error field--wide">{error}</p> : null}
    </>
  );
}
