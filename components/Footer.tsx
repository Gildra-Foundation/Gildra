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
            <a href="#">Tier Lists</a>
            <a href="#">Mythic+</a>
            <a href="#">Raid</a>
            <a href="#">Builds</a>
            <a href="#">Guides</a>
          </div>
          <div className="fcol">
            <h5>Community</h5>
            <a href="#">Discord</a>
            <a href="#">Support Us</a>
            <a href="#">Contact</a>
          </div>
          <div className="fcol foot-prem">
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
