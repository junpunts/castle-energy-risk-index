// Marketplace Navbar — sticky top bar with wordmark + auth
function MarketplaceNavbar({ onLogin, onSignup }) {
  return (
    <nav className="mkp-nav">
      <div className="mkp-nav-inner">
        <a className="mkp-logo" href="#">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <rect x="2" y="10" width="3" height="10" rx="0.5"/>
            <rect x="7" y="6" width="3" height="14" rx="0.5"/>
            <rect x="12" y="10" width="3" height="10" rx="0.5"/>
            <rect x="17" y="4" width="3" height="16" rx="0.5"/>
            <rect x="2" y="7" width="3" height="2"/>
            <rect x="12" y="7" width="3" height="2"/>
            <rect x="7" y="3" width="3" height="2"/>
            <rect x="17" y="1" width="3" height="2"/>
          </svg>
          <span className="mkp-wordmark">Castle</span>
        </a>
        <div className="mkp-nav-right">
          <button className="mkp-nav-link" onClick={onLogin}>Log In</button>
          <button className="mkp-nav-cta" onClick={onSignup}>Sign Up</button>
        </div>
      </div>
    </nav>
  );
}

window.MarketplaceNavbar = MarketplaceNavbar;
