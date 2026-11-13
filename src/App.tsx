import { useEffect, useRef, useState } from "react";
import { Game, type GameState, type Settings, weapons, type WeaponId } from "./game";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      </>
    ),
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.target}
    </svg>
  );
}

export function GunArt({ id, className = "" }: { id: WeaponId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 360 130" fill="none" aria-hidden="true">
      <g transform="translate(0 7) rotate(-8 180 65)">
        <path d="M36 50 8 60v26l31-3 30-22-3-11Z" fill={id === "ak" ? "#72503b" : "#343a38"} />
        <path d="m62 48 115-1 10 26-110 4-12-8Z" fill="#545a52" />
        <path d="m76 51 90-1v8H76z" fill="#757b70" />
        <path d="m102 73 23-1-10 34-15-2-6-22Z" fill="#303530" />
        <path d="m142 72 24-2 10 28-6 16-17 1-2-23Z" fill={id === "ak" ? "#615d44" : "#343a35"} />
        <path d="m177 48 85 3v17l-80 4Z" fill={id === "ak" ? "#8c6242" : "#3b423a"} />
        <path d="M256 54h75v7h-75zM324 50h13v14h-13z" fill="#74796b" />
        <path d="M181 43h77v5h-77zM244 38h7v14h-7zM316 43h5v11h-5z" fill="#3e453d" />
        <path d="M117 72v13h22l6-13" stroke="#272e28" strokeWidth="4" />
        {id === "m4" && (
          <>
            <path d="M174 45v-9h42v10" stroke="#8b9080" strokeWidth="5" />
            <path d="M192 53h54m-54 5h54m-54 5h54" stroke="#777d6d" strokeWidth="2" />
          </>
        )}
        {id === "awp" && (
          <>
            <path d="M106 38h85v10h-85zM118 24h66v16h-66z" fill="#333b33" />
            <path d="M105 23h16v19h-16zM179 21h17v22h-17z" fill="#707666" />
            <path d="m178 66 85-1-4 14-78 4" fill="#6b7553" />
          </>
        )}
        <path d="m79 44 9-8h25v10" fill="#383e36" />
        <path d="M62 49h7v27h-7zM262 51h5v18h-5z" fill="#242b25" />
      </g>
    </svg>
  );
}

const initialState: GameState = {
  health: 100,
  ammo: 30,
  reserve: 90,
  kills: 0,
  deaths: 0,
  time: 90,
  round: 1,
  score: [0, 0],
  alive: 5,
  reloading: false,
  message: "",
  hit: false,
  hurt: false,
  feed: [],
  x: 0,
  z: 17,
  yaw: 0,
  ended: false,
};

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<Game | null>(null);
  const [view, setView] = useState<"lobby" | "playing" | "paused">("lobby");
  const [panel, setPanel] = useState<"loadout" | "guide" | "settings" | null>(null);
  const [weapon, setWeapon] = useState<WeaponId>("ak");
  const [mode, setMode] = useState<"elimination" | "deathmatch">("elimination");
  const [settings, setSettings] = useState<Settings>({
    difficulty: "Normal",
    sensitivity: 1,
    volume: 40,
    bots: 5,
  });
  const [hud, setHud] = useState(initialState);
  const [error, setError] = useState("");
  const [scoreboard, setScoreboard] = useState(false);

  useEffect(() => {
    if (!mount.current) return;
    try {
      const game = new Game(mount.current, setHud, () =>
        setView((v) => (v === "playing" ? "paused" : v)),
      );
      engine.current = game;
      return () => game.dispose();
    } catch {
      setError("WebGL is not available. Please enable hardware acceleration and reload to play.");
    }
  }, []);
  useEffect(() => {
    engine.current?.configure(settings, weapon);
  }, [settings, weapon]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab" && view === "playing") {
        e.preventDefault();
        setScoreboard(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") setScoreboard(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [view]);

  function play(resume = false) {
    if (!engine.current) return;
    setPanel(null);
    setView("playing");
    if (resume) engine.current.resume();
    else engine.current.start(weapon, mode, settings);
  }
  function leave() {
    engine.current?.lobby();
    setView("lobby");
    setPanel(null);
  }
  const active = view !== "lobby";
  const secondsLeft = Math.ceil(hud.time);
  return (
    <main className={`app ${active ? "in-game" : ""}`}>
      <div className="world" ref={mount} />
      {view === "lobby" && (
        <>
          <div className="lobby-shade" />
          <header className="header">
            <a
              className="brand"
              href="#"
              aria-label="Strike Protocol home"
              onClick={(e) => {
                e.preventDefault();
                setPanel(null);
              }}
            >
              <span className="brand-symbol">
                S<span>/</span>P
              </span>
              <span>
                STRIKE<span>PROTOCOL</span>
              </span>
            </a>
            <nav>
              <button className={!panel ? "nav-active" : ""} onClick={() => setPanel(null)}>
                PLAY
              </button>
              <button
                className={panel === "loadout" ? "nav-active" : ""}
                onClick={() => setPanel("loadout")}
              >
                LOADOUT
              </button>
              <button
                className={panel === "guide" ? "nav-active" : ""}
                onClick={() => setPanel("guide")}
              >
                FIELD GUIDE <span>↗</span>
              </button>
            </nav>
            <div className="header-right">
              <span className="offline">
                <i /> LOCAL SESSION
              </span>
              <button
                className="icon-button"
                aria-label="Settings"
                onClick={() => setPanel("settings")}
              >
                <Icon name="settings" />
              </button>
              <div className="avatar">R</div>
              <div className="profile">
                ROOKIE<span>READY FOR DEPLOYMENT</span>
              </div>
            </div>
          </header>
          <section className="hero">
            <div className="eyebrow">
              <span /> TACTICAL FIRST-PERSON SHOOTER <span className="version">V.01</span>
            </div>
            <h1>
              EVERY SHOT.
              <br />
              <span>COUNTS.</span>
            </h1>
            <p>
              No downloads. No waiting. Just you, your loadout,
              <br className="desktop-break" /> and the next round. Get in. Get better.
            </p>
            <div className="hero-tags">
              <span>
                <Icon name="people" size={14} /> BOT OPPONENTS
              </span>
              <span>
                <Icon name="shield" size={14} /> 100% LOCAL
              </span>
              <span>
                <Icon name="target" size={14} /> PURE GUNPLAY
              </span>
            </div>
          </section>
          <div className="map-marker">
            <span className="map-marker-icon">A</span>
            <div>
              DUST SECTOR<span>35° 42′ N &nbsp; 0° 38′ W</span>
            </div>
            <span className="marker-line" />
          </div>
          <div className="map-caption">
            <span className="live-dot" /> LIVE MAP PREVIEW <span>01 / 01</span>
          </div>
          <section className="deploy-panel">
            <div className="deploy-heading">
              <span>
                <span className="tiny-cross">+</span> YOUR NEXT DEPLOYMENT
              </span>
              <span className="session-ready">
                <i /> ALL SYSTEMS READY
              </span>
            </div>
            <div className="deploy-grid">
              <div className="mode-card">
                <div className="card-label">
                  01 <span>GAME MODE</span>
                </div>
                <div className="mode-options">
                  <button
                    className={mode === "elimination" ? "selected" : ""}
                    onClick={() => setMode("elimination")}
                  >
                    ELIMINATION <span className="radio" />
                  </button>
                  <button
                    className={mode === "deathmatch" ? "selected" : ""}
                    onClick={() => setMode("deathmatch")}
                  >
                    DEATHMATCH <span className="radio" />
                  </button>
                </div>
                <p>
                  {mode === "elimination"
                    ? "One life. Clear the bots. First to 5 rounds."
                    : "Fast respawns. 3 minutes. Make every kill count."}
                </p>
              </div>
              <div className="location-card">
                <div className="card-label">
                  02 <span>THE BATTLEGROUND</span>
                </div>
                <div className="location-name">
                  <div className="map-outline">
                    <span>A</span>
                    <i />
                    <b />
                  </div>
                  <div>
                    <h3>DUST SECTOR</h3>
                    <p>
                      Desert compound <span>•</span> Close & mid range
                    </p>
                  </div>
                </div>
                <div className="card-foot">
                  <span>ACTIVE DUTY</span>
                  <span>DAYTIME / CLEAR</span>
                </div>
              </div>
              <button className="weapon-card" onClick={() => setPanel("loadout")}>
                <div className="card-label">
                  03 <span>YOUR LOADOUT</span>
                  <Icon name="chevron" size={15} />
                </div>
                <GunArt id={weapon} />
                <div className="weapon-card-footer">
                  <strong>{weapons[weapon].name}</strong>
                  <span>{weapons[weapon].type}</span>
                </div>
              </button>
              <div className="launch-card">
                <div className="bot-summary">
                  <Icon name="people" size={17} />
                  <span>
                    YOU <b>VS</b> {settings.bots} BOTS
                  </span>
                  <button onClick={() => setPanel("settings")}>
                    {settings.difficulty.toUpperCase()} <Icon name="settings" size={13} />
                  </button>
                </div>
                <button className="deploy-button" onClick={() => play()} disabled={!!error}>
                  DEPLOY NOW <Icon name="arrow" size={23} />
                </button>
                <p>
                  <span /> INSTANT PLAY. NO SIGN-UP REQUIRED.
                </p>
              </div>
            </div>
          </section>
          <footer>
            <span>BUILT FOR THE NEXT ROUND.</span>
            <div>
              <span>
                <kbd>W A S D</kbd> MOVE
              </span>
              <span>
                <kbd>⌁</kbd> AIM & SHOOT
              </span>
              <button onClick={() => setPanel("guide")}>
                VIEW CONTROLS <Icon name="arrow" size={13} />
              </button>
            </div>
            <span>
              UNOFFICIAL FAN PROJECT <i /> NOT AFFILIATED WITH VALVE
            </span>
          </footer>
        </>
      )}
      {active && (
        <>
          <div className="game-top">
            <div className="radar">
              <svg viewBox="0 0 100 100">
                <path
                  d="M8 8h84v84H8zM35 8v25H8m84 0H65V8M8 65h27v27m30 0V65h27M35 35h30v30H35"
                  fill="none"
                  stroke="#b4b59c"
                  strokeWidth="2"
                />
                <circle cx={50 + hud.x * 1.7} cy={50 + hud.z * 1.7} r="3" fill="#eeb95d" />
              </svg>
              <span>DUST SECTOR</span>
            </div>
            <div className="round-score">
              <div>
                <span className="team-you">YOU</span>
                <strong>{hud.score[0]}</strong>
                <span className="round-time">
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
                <strong>{hud.score[1]}</strong>
                <span className="team-bot">BOTS</span>
              </div>
              <p>
                {mode === "elimination"
                  ? `ROUND ${hud.round} · FIRST TO 5`
                  : "DEATHMATCH · 3 MINUTES"}
              </p>
            </div>
            <button
              className="pause-button"
              onClick={() => {
                engine.current?.pause();
                setView("paused");
              }}
            >
              <Icon name="settings" size={17} /> ESC
            </button>
          </div>
          <div className="kill-feed">
            {hud.feed.map((item, i) => (
              <div key={i}>
                <span>{item.killer}</span>
                <span className="feed-gun"> ━╤━ </span>
                {item.victim}
              </div>
            ))}
          </div>
          <div className={`crosshair ${hud.hit ? "hit" : ""}`}>
            <i />
            <i />
            <i />
            <i />
            {hud.hit && <span>×</span>}
          </div>
          {hud.hurt && <div className="damage-flash" />}
          {hud.message && (
            <div className="round-message">
              <span>STRIKE PROTOCOL</span>
              <h2>{hud.message}</h2>
              {hud.ended ? (
                <>
                  <button onClick={() => play()}>
                    PLAY AGAIN <Icon name="arrow" />
                  </button>
                  <button className="text-button" onClick={leave}>
                    BACK TO LOBBY
                  </button>
                </>
              ) : (
                <p>{mode === "deathmatch" ? "RESPAWNING SOON" : "NEXT ROUND STARTING SOON"}</p>
              )}
            </div>
          )}
          <div className="game-bottom">
            <div className="health">
              <Icon name="shield" size={24} />
              <strong>{hud.health}</strong>
              <span>HEALTH</span>
              <div>
                <i style={{ width: `${hud.health}%` }} />
              </div>
            </div>
            <div className="game-status">
              <span>{hud.kills} KILLS</span>
              <span>{hud.alive} HOSTILES</span>
              <span>
                <kbd>TAB</kbd> SCOREBOARD
              </span>
            </div>
            <div className="ammo">
              <span>
                {weapons[weapon].name}
                <small>{hud.reloading ? "RELOADING…" : "R TO RELOAD"}</small>
              </span>
              <strong>{hud.ammo}</strong>
              <span className="reserve">/ {hud.reserve}</span>
            </div>
          </div>
          {scoreboard && (
            <div className="scoreboard">
              <div className="eyebrow">LOCAL MATCH</div>
              <h2>FIELD REPORT</h2>
              <div>
                <span>OPERATOR</span>
                <span>KILLS</span>
                <span>DEATHS</span>
              </div>
              <div>
                <strong>YOU / ROOKIE</strong>
                <strong>{hud.kills}</strong>
                <strong>{hud.deaths}</strong>
              </div>
              <p>{hud.alive} bot opponents remaining this round</p>
            </div>
          )}
          {view === "playing" && (
            <div className="game-hint">
              WASD MOVE <span>•</span> SHIFT WALK <span>•</span> SPACE JUMP <span>•</span> R RELOAD{" "}
              <span>•</span> ESC PAUSE
            </div>
          )}
        </>
      )}
      {view === "paused" && !panel && !hud.ended && (
        <div className="modal-backdrop">
          <section className="modal pause-modal">
            <div className="eyebrow">TAKE A BREATHER</div>
            <h2>MISSION PAUSED.</h2>
            <p>Your match is waiting. Get back out there.</p>
            <button className="deploy-button" onClick={() => play(true)}>
              RESUME MATCH <Icon name="arrow" />
            </button>
            <button className="secondary-button" onClick={() => setPanel("settings")}>
              SETTINGS <Icon name="settings" size={16} />
            </button>
            <button className="text-button" onClick={leave}>
              LEAVE MATCH
            </button>
          </section>
        </div>
      )}
      {panel && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPanel(null);
          }}
        >
          <section className={`modal ${panel === "loadout" ? "loadout-modal" : ""}`}>
            <button
              className="modal-close icon-button"
              onClick={() => setPanel(null)}
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
            <div className="eyebrow">PREPARE. ADAPT. ENGAGE.</div>
            <h2>
              {panel === "loadout"
                ? "CHOOSE YOUR EDGE."
                : panel === "guide"
                  ? "KNOW THE BASICS."
                  : "DIAL IT IN."}
            </h2>
            {panel === "loadout" && (
              <>
                <p>Three classics. Three ways to control the round.</p>
                <div className="loadout-list">
                  {(Object.keys(weapons) as WeaponId[]).map((id) => (
                    <button
                      key={id}
                      className={`loadout-option ${weapon === id ? "selected" : ""}`}
                      onClick={() => setWeapon(id)}
                    >
                      <div className="card-label">
                        {weapons[id].type}
                        <span className="radio" />
                      </div>
                      <GunArt id={id} />
                      <h3>{weapons[id].name}</h3>
                      <p>{weapons[id].description}</p>
                      <div className="gun-stats">
                        <span>
                          DAMAGE <b>{weapons[id].damage}</b>
                        </span>
                        <span>
                          MAGAZINE <b>{weapons[id].mag}</b>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <button className="deploy-button modal-cta" onClick={() => setPanel(null)}>
                  CONFIRM LOADOUT <Icon name="arrow" />
                </button>
              </>
            )}
            {panel === "guide" && (
              <>
                <p>Stay moving. Use cover. Aim for the head.</p>
                <div className="control-list">
                  {[
                    ["W A S D", "Move"],
                    ["MOUSE", "Look around / Left click to fire"],
                    ["RIGHT CLICK", "Aim down sights (hold)"],
                    ["R", "Reload weapon"],
                    ["SHIFT / CTRL", "Walk quietly / Crouch"],
                    ["SPACE", "Jump"],
                    ["TAB", "View scoreboard"],
                    ["ESC", "Pause / Release cursor"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <kbd>{key}</kbd>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="note">
                  Elimination: take out every bot to win a round. First to 5 wins. Deathmatch:
                  respawn and rack up kills for 3 minutes. Click the game to capture your mouse.
                </p>
              </>
            )}
            {panel === "settings" && (
              <>
                <p>Your session. Your rules.</p>
                <div className="settings-list">
                  <label>
                    BOT DIFFICULTY
                    <select
                      value={settings.difficulty}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          difficulty: e.target.value as Settings["difficulty"],
                        })
                      }
                    >
                      <option>Easy</option>
                      <option>Normal</option>
                      <option>Hard</option>
                    </select>
                  </label>
                  <label>
                    BOT OPPONENTS{" "}
                    <select
                      value={settings.bots}
                      onChange={(e) => setSettings({ ...settings, bots: +e.target.value })}
                    >
                      {[3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          {n} bots
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    MOUSE SENSITIVITY <output>{settings.sensitivity.toFixed(1)}</output>
                    <input
                      aria-label="Mouse sensitivity"
                      type="range"
                      min=".2"
                      max="2"
                      step=".1"
                      value={settings.sensitivity}
                      onChange={(e) => setSettings({ ...settings, sensitivity: +e.target.value })}
                    />
                  </label>
                  <label>
                    MASTER VOLUME <output>{settings.volume}%</output>
                    <input
                      aria-label="Master volume"
                      type="range"
                      min="0"
                      max="100"
                      value={settings.volume}
                      onChange={(e) => setSettings({ ...settings, volume: +e.target.value })}
                    />
                  </label>
                </div>
                <p className="note">
                  Difficulty, sensitivity, and audio apply immediately. Bot count and weapon changes
                  apply on your next deployment.
                </p>
                <button className="deploy-button" onClick={() => setPanel(null)}>
                  ALL SET <Icon name="arrow" />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </main>
  );
}
