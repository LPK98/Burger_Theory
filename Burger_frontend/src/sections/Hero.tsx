/**
 * SECTION 01 — the hero headline layer.
 *
 * It lives inside the pinned scene in ExplodedBurger.tsx so the burger you land on is
 * the same burger that comes apart as you scroll. This component is only the type:
 * the two headline lines sit behind and in front of the burger like a typographic bun.
 * ExplodedBurger.css places them from the burger's outline, so they always clear it;
 * the tagline hangs from the first line's cap height and the cue stands on the second's baseline.
 */
export function HeroCopy() {
  return (
    <div className="scene-hero">
      <h1 id="hero-title" className="hero-title display">
        <span className="hero-line hero-line-1">
          <span className="line-mask">
            <span className="line-inner">Not just</span>
          </span>
        </span>{' '}
        <span className="hero-line hero-line-2">
          <span className="line-mask">
            <span className="line-inner">a burger.</span>
          </span>
        </span>
      </h1>

      {/* Outer elements belong to the scroll timeline, inner spans to the load intro. */}
      <p className="hero-tagline display-sm" data-anim="hero-meta">
        <span className="block" data-anim="hero-meta-in">
          Built different.
          <br />
          Tastes different.
        </span>
      </p>

      <div className="hero-cue ui" data-anim="hero-meta" aria-hidden="true">
        <span className="hero-cue-inner" data-anim="hero-meta-in">
          <span className="cue-track">
            <span className="cue-line" />
          </span>
          <span className="cue-label">Scroll to take it apart</span>
        </span>
      </div>
    </div>
  )
}
