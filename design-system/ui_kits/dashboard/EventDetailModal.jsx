// Event Detail Modal — click a contract card to open
function EventDetailModal({ market, onClose }) {
  if (!market) return null;
  const prob = Math.round(market.probability * 100);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-platform">{market.platform.toUpperCase()}</span>
            <div className="modal-event">{market.eventTitle}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
          </button>
        </div>
        <h2 className="modal-title">{market.title}</h2>
        <div className="modal-prob-row">
          <div className="modal-prob-block">
            <div className="modal-label">YES</div>
            <div className="modal-prob tabular prob-high">{prob}%</div>
          </div>
          <div className="modal-prob-block">
            <div className="modal-label">NO</div>
            <div className="modal-prob tabular">{100 - prob}%</div>
          </div>
          <div className="modal-prob-block">
            <div className="modal-label">VOLUME</div>
            <div className="modal-value tabular">{window.formatVolume(market.volume)}</div>
          </div>
          <div className="modal-prob-block">
            <div className="modal-label">RESOLVES</div>
            <div className="modal-value">{market.expiryDate}</div>
          </div>
        </div>
        <div className="modal-chart">
          <svg viewBox="0 0 400 100" preserveAspectRatio="none">
            <path d="M0,70 L40,65 L80,72 L120,55 L160,48 L200,42 L240,38 L280,30 L320,34 L360,28 L400,30"
                  fill="none" stroke="#246075" strokeWidth="1.5"/>
            <path d="M0,70 L40,65 L80,72 L120,55 L160,48 L200,42 L240,38 L280,30 L320,34 L360,28 L400,30 L400,100 L0,100 Z"
                  fill="rgba(36,96,117,0.08)"/>
          </svg>
          <div className="modal-chart-axis">
            <span>30d ago</span><span>today</span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="modal-cta">Buy protection →</button>
          <button className="modal-secondary">Add to watchlist</button>
        </div>
      </div>
    </div>
  );
}

window.EventDetailModal = EventDetailModal;
