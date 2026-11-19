import React, { useEffect, useRef, useState } from 'react';
import { RageQuitWrapper, RageQuitRef, EFFECTS, type DestructionEffect } from 'domolition';

type Effect = DestructionEffect;

// Tracks the OS "Reduce motion" setting live, so flipping it in System Settings
// updates the page without a reload.
const useReducedMotion = () => {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

// A one-liner per engine so the deck explains itself without a manual.
const BLURB: Record<Effect, string> = {
  grid: 'Clean rectangles, blown outward. The classic.',
  glass: 'Voronoi fracture, cracks hold for a beat, then it goes.',
  implode: 'Zero-g collapse. Everything falls toward the middle and vanishes.',
  collapse: 'Controlled demolition. A rumble, then it caves in on its own footprint.',
  slice: 'One katana stroke. The halves hang for a beat, then slide apart and drop.',
  melt: 'Structural integrity: gone. The whole thing drips off the screen.',
  disintegrate: 'I don’t feel so good. Turns to dust and drifts away.',
};

export const App = () => {
  // The imperative handle is the whole point of the library. A parent button
  // reaches in and pulls the trigger. We also use reset() to put it all back.
  const shatterRef = useRef<RageQuitRef>(null);
  const [effect, setEffect] = useState<Effect>('grid');

  // Three states, not two: 'intact' → 'demolishing' (physics running) → 'rubble'.
  // The middle one is what lets us grey the controls out mid-explosion.
  const [phase, setPhase] = useState<'intact' | 'demolishing' | 'rubble'>('intact');

  // Visitors with Reduce Motion on get the library's real behaviour (a quick fade),
  // plus an explicit opt-in to see the full effect. Without this, the range just
  // looks broken to them.
  const reducedMotion = useReducedMotion();
  const [playAnyway, setPlayAnyway] = useState(false);

  const demolish = () => {
    setPhase('demolishing');
    shatterRef.current?.triggerShatter();
  };

  const rebuild = () => {
    // reset() restores opacity/pointer-events and tears the Matter world down,
    // so the same panel is demolishable again, no remount, no key hack.
    shatterRef.current?.reset();
    setPhase('intact');
  };

  return (
    <div className="page">
      {/* --- Top bar: the chartreuse chip + wordmark, straight from the kit --- */}
      <header className="topbar">
        <div className="wordmark">
          <span className="chip">D</span>
          <b>DOMolition</b>
        </div>
        <nav className="links mono">
          <a href="https://www.npmjs.com/package/domolition" target="_blank" rel="noreferrer">
            npm
          </a>
          <a href="https://github.com/zakiaminn/DOMolition" target="_blank" rel="noreferrer">
            GitHub&nbsp;↗
          </a>
        </nav>
      </header>

      {/* --- Hero: the swipe underline is the house signature, so one word wears it --- */}
      <section className="hero">
        <p className="eyebrow">Live firing range</p>
        <h1>
          Some UI deserves to be <span className="swipe">demolished</span>.
        </h1>
        <p>
          The panel below is a real, rendered React tree, fully interactive until
          you pull the trigger. Pick an engine, hit Demolish, and DOMolition
          snapshots it, chops it into physics bodies, and throws it across your
          screen. Rebuild puts it back like nothing happened.
        </p>
        <InstallChip />
      </section>

      {/* --- Control deck: engine picker + the two big buttons --- */}
      <div className="deck">
        <span className="label">Engine</span>
        <div className="segments" role="group" aria-label="Destruction engine">
          {EFFECTS.map((e) => (
            <button
              key={e}
              data-active={effect === e}
              // Locking the picker mid-explosion keeps the running sim honest.
              // Swap the engine only once the rubble's been rebuilt.
              disabled={phase !== 'intact'}
              onClick={() => setEffect(e)}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="spacer" />

        <button
          className="btn btn-demolish shatter-fx"
          onClick={demolish}
          disabled={phase !== 'intact'}
        >
          {phase === 'demolishing' ? 'Demolishing…' : 'Demolish'}
        </button>
        <button
          className="btn btn-rebuild"
          onClick={rebuild}
          disabled={phase === 'intact'}
        >
          Rebuild
        </button>
      </div>

      {reducedMotion && (
        <div className="motion-note" role="status">
          <p>
            {playAnyway ? (
              <>
                <b>Playing the full effect.</b> Your Reduce Motion setting is on; switch
                this off to see what those users get by default.
              </>
            ) : (
              <>
                <b>Reduce Motion is on</b> in your system settings, so DOMolition skips the
                animation and just fades the panel out. That's the right call in a real app.
              </>
            )}
          </p>
          <button
            className="btn btn-rebuild motion-note__toggle"
            aria-pressed={playAnyway}
            onClick={() => setPlayAnyway((v) => !v)}
          >
            {playAnyway ? 'Respect my setting' : 'Play anyway'}
          </button>
        </div>
      )}

      <p className="footnote">
        Now firing: <code className="mono">effect="{effect}"</code> · {BLURB[effect]}
      </p>

      {/* --- The victim. A mock analyst dashboard, on-brand, waiting to die. ---
          effect is keyed off state; onShatterComplete flips us to 'rubble' so
          the Rebuild button lights up exactly when the bodies fall asleep. */}
      <div style={{ marginTop: 24 }}>
        <RageQuitWrapper
          ref={shatterRef}
          effect={effect}
          shardCount={220}
          rows={14}
          cols={12}
          onShatterComplete={() => setPhase('rubble')}
          reducedMotion={playAnyway ? 'ignore' : 'respect'}
        >
          <MockDashboard />
        </RageQuitWrapper>
      </div>

      <UseAnywhere effect={effect} />
    </div>
  );
};

// One-click copy of the install command. The fastest path from "ha, cool" to a dependency.
const InstallChip = () => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText('npm i domolition');
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked: the text is right there to select */
    }
  };
  return (
    <div className="install">
      <code className="mono">npm i domolition</code>
      <button className="install__copy" onClick={copy} aria-label="Copy install command">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

// The two ways in: the React wrapper, or one plain function for everything else.
// Snippets follow the engine picked above so they're copy-paste ready.
const UseAnywhere = ({ effect }: { effect: Effect }) => (
  <section className="usage">
    <h2>Use it anywhere</h2>
    <div className="usage__grid">
      <div className="snippet">
        <div className="snippet__label mono">React</div>
        <pre className="mono">{`import { RageQuitWrapper } from 'domolition';

const ref = useRef(null);

<button onClick={() => ref.current.triggerShatter()}>
  Delete
</button>
<RageQuitWrapper ref={ref} effect="${effect}">
  <Card />
</RageQuitWrapper>`}</pre>
      </div>
      <div className="snippet">
        <div className="snippet__label mono">Vanilla JS · Vue · Svelte · anything</div>
        <pre className="mono">{`import { shatter } from 'domolition/vanilla';

const card = document.querySelector('#card');
const boom = shatter(card, { effect: '${effect}' });

await boom.finished;
card.remove();   // or boom.reset() to undo`}</pre>
      </div>
    </div>
  </section>
);

// A believable little dashboard. Figures on the mono, brand accents where the
// data lives. Nothing here knows it's about to be tessellated.
const MockDashboard = () => (
  <div className="panel">
    <div className="panel__head">
      <span className="panel__title">
        <span className="chip" style={{ width: 24, height: 24, fontSize: 12 }}>
          Z
        </span>
        <b>Pipeline Health</b>
      </span>
      <span className="status">All systems nominal</span>
    </div>

    <div className="stats">
      <div className="stat">
        <div className="k">Rows ingested</div>
        <div className="v mono tnum">1,284,902</div>
        <div className="d up mono">▲ 4.2% vs last run</div>
      </div>
      <div className="stat">
        <div className="k">Avg latency</div>
        <div className="v mono tnum">112 ms</div>
        <div className="d down mono">▼ 8.0% faster</div>
      </div>
      <div className="stat">
        <div className="k">Failed jobs</div>
        <div className="v mono tnum">0</div>
        <div className="d up mono">· clean streak: 31d</div>
      </div>
    </div>

    <div className="rows">
      <div className="row">
        <div>
          <div className="name">nightly_etl · orders</div>
          <div className="sub mono">last run 02:14 · 3.1M rows</div>
        </div>
        <span className="pill">passing</span>
      </div>
      <div className="row">
        <div>
          <div className="name">dbt_build · marts</div>
          <div className="sub mono">last run 02:31 · 428 models</div>
        </div>
        <span className="pill">passing</span>
      </div>
      <div className="row">
        <div>
          <div className="name">reverse_etl · crm_sync</div>
          <div className="sub mono">last run 02:47 · 96k contacts</div>
        </div>
        <span className="pill">passing</span>
      </div>
    </div>
  </div>
);
