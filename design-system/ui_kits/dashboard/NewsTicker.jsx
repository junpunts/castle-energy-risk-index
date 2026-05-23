// News Ticker — full-bleed inverted, seamless infinite scroll
function NewsTicker({ items }) {
  const doubled = [...items, ...items];
  const dur = items.length * 5;
  return (
    <div className="news-ticker" style={{ "--ticker-dur": `${dur}s` }}>
      <div className="news-ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="news-item">
            <span className="news-headline">{item.headline}</span>
            {item.source && <span className="news-source">{item.source}</span>}
            <span className="news-dot" aria-hidden="true">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

window.NewsTicker = NewsTicker;
