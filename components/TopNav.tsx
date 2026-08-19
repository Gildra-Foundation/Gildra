export function TopNav() {
  return (
    <header className="topnav">
      <div className="logo">
        <div className="logo-mark">G</div>
        <span className="logo-text">GILDRA</span>
      </div>
      <div className="gsw">
        <button className="gsw-btn" aria-haspopup="true">
          <svg className="i">
            <use href="#gm-wow" />
          </svg>{" "}
          World of Warcraft <span className="caret">▾</span>
        </button>
        <div className="gsw-menu" role="menu">
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#d95c55" }}>
              <use href="#gm-d4" />
            </svg>{" "}
            Diablo IV
          </a>
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#dfc06a" }}>
              <use href="#gm-hs" />
            </svg>{" "}
            Hearthstone
          </a>
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#e8975a" }}>
              <use href="#gm-ow" />
            </svg>{" "}
            Overwatch 2
          </a>
          <a href="#" role="menuitem" className="gsw-more">
            All games →
          </a>
        </div>
      </div>
      <nav className="nav-links">
        <a className="active" href="#">
          Tier Lists
        </a>
        <a href="#">Mythic+</a>
        <a href="#">Raid</a>
        <a href="#">Builds</a>
        <a href="#">Guides</a>
      </nav>
      <div className="nav-spacer" />
      <div className="search">
        <svg className="i">
          <use href="#ic-search" />
        </svg>{" "}
        Search Gildra... <span className="kbd">⌘K</span>
      </div>
      <div className="user">
        <div className="avatar" />
        Alexandér <span className="caret">▾</span>
      </div>
    </header>
  );
}
