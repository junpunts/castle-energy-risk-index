// Situation Hero — highlights a category with a featured event + grid of sub-events
function SituationHero({ label, description, topEvent, featuredEvents = [] }) {
  return (
    <div className="sit-hero">
      <div className="sit-hero-head">
        <div>
          <div className="sit-hero-eyebrow">SITUATION</div>
          <h2 className="sit-hero-title">{label}</h2>
          <p className="sit-hero-desc">{description}</p>
        </div>
        {topEvent && topEvent.topMarket && (
          <div className="sit-hero-top">
            <div className="sit-hero-top-label">TOP MARKET</div>
            <div className="sit-hero-top-title">{topEvent.topMarket.title}</div>
            <div className="sit-hero-top-prob tabular">
              {Math.round(topEvent.topMarket.probability * 100)}%
            </div>
            <div className="sit-hero-top-vol tabular">
              {topEvent.platform} · ${(topEvent.topMarket.volume / 1000).toFixed(0)}K vol
            </div>
          </div>
        )}
      </div>
      <div className="sit-hero-strip">
        {featuredEvents.slice(0, 5).map((e) => e.topMarket && (
          <div key={e.id} className="sit-hero-item">
            <div className="sit-hero-item-prob tabular">{Math.round(e.topMarket.probability * 100)}%</div>
            <div className="sit-hero-item-title">{e.topMarket.title}</div>
            <div className="sit-hero-item-plat">{e.platform}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.SituationHero = SituationHero;
