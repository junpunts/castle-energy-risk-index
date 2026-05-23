// Situation Nav — horizontal severity pills (scrollable)
const SEVERITY_COLOR = {
  critical: "#EF4444",
  high:     "#F59E0B",
  medium:   "#60A5FA",
  low:      "#10B981",
};

function SituationNav({ situations, active, onSelect }) {
  const tabs = [{ id: "featured", label: "Featured", contractCount: 0 }, ...situations];
  return (
    <div className="sit-nav">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const color = tab.severity ? SEVERITY_COLOR[tab.severity] : null;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`sit-pill ${isActive ? "is-active" : ""}`}
          >
            {color && <span className="sit-dot" style={{ background: color }} />}
            <span>{tab.label}</span>
            {tab.contractCount > 0 && (
              <span className="sit-count tabular">{tab.contractCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

window.SituationNav = SituationNav;
