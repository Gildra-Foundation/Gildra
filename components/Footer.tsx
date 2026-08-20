export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div className="foot-brand">
          <div className="logo">
            <div className="logo-mark">G</div>
            <span className="logo-text">GILDRA</span>
          </div>
          <p>
            Gaming intelligence for Azeroth — live tier lists, meta statistics
            and guides.
          </p>
        </div>
        <div className="foot-cols">
          <div className="fcol">
            <h5>Content</h5>
            <a href="/tier-lists">Tier Lists</a>
            <a href="/#meta">Mythic+</a>
            <a href="/#raid">Raid</a>
            <a href="/tier-lists#builds">Builds</a>
            <a href="/#guides">Guides</a>
          </div>
          <div className="fcol">
            <h5>Community</h5>
            <span className="dead-link" title="Coming soon">Discord</span>
            <span className="dead-link" title="Coming soon">Support Us</span>
            <span className="dead-link" title="Coming soon">Contact</span>
          </div>
          <div className="fcol foot-prem" id="premium">
            <h5>Premium</h5>
            <p>Remove ads and support Gildra development.</p>
            <button className="btn-gold">Go Premium</button>
          </div>
        </div>
      </div>
      <div className="foot-legal">
        World of Warcraft® and all related artwork are trademarks or registered
        trademarks of Blizzard Entertainment, Inc. Gildra is an unofficial
        fan-made concept and is not affiliated with or endorsed by Blizzard
        Entertainment.
      </div>
    </footer>
  );
}
