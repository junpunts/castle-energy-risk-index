// Contract Card — probability-first prediction market card
function formatVolume(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}
function probColorClass(p) {
  if (p >= 0.7) return "prob-high";
  if (p >= 0.4) return "prob-mid";
  return "prob-low";
}

function ContractCard({ market, onClick, watchlisted, onToggleWatch }) {
  const prob = Math.round(market.probability * 100);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="contract-card"
    >
      <div className="cc-top">
        <span className="cc-event" title={market.eventTitle}>{market.eventTitle}</span>
        <div className="cc-top-right">
          <span className="cc-platform">{market.platform}</span>
          <button
            className={`cc-bookmark ${watchlisted ? "is-on" : ""}`}
            aria-label="Watchlist"
            onClick={(e) => { e.stopPropagation(); onToggleWatch && onToggleWatch(); }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              {watchlisted && <polyline points="9 11 11 13 15 9"/>}
            </svg>
          </button>
        </div>
      </div>
      <h3 className="cc-title">{market.title}</h3>
      <div className="cc-bottom">
        <span className={`cc-prob tabular ${probColorClass(market.probability)}`}>{prob}%</span>
        <div className="cc-meta">
          {market.platform !== "synthetic" && <span className="tabular">{formatVolume(market.volume)}</span>}
          {market.siblingCount > 1 && <span>+{market.siblingCount - 1} more</span>}
        </div>
      </div>
    </div>
  );
}

window.ContractCard = ContractCard;
window.formatVolume = formatVolume;
