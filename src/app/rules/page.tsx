"use client";

import { useState } from "react";

const RULE_SECTIONS = [
  "Match Format & Server Settings",
  "Weapon & Class Restrictions",
  "Map Pool & Veto",
  "Technical & Disconnect Rules",
  "Glitches & Disqualification",
] as const;

type RuleSection = (typeof RULE_SECTIONS)[number];
type Division = "boys" | "girls";

const weaponClasses = [
  { name: "Assault", weapons: "AK-47, M4A1, G36c", limit: "Unlimited" },
  { name: "Spec-Ops / SMG", weapons: "AK-74u, MP5", limit: "Max 2" },
  { name: "Sniper", weapons: "M40A3, R700", limit: "Max 1" },
  { name: "Shotgun", weapons: "W1200, M1014", limit: "Max 1" },
];

const bannedItems = [
  [
    "Weapons",
    "All LMGs (RPD, SAW, M60), P90, Skorpion, Barrett .50 Cal, Dragunov",
  ],
  ["Attachments", 'Grenade Launchers ("noob tubes"), Red Dot, ACOG, Silencers'],
  [
    "Equipment",
    "Claymores, C4, RPGs, Stun Grenades — max 1 Frag + 1 Flash/Smoke per player",
  ],
];

const mapPool = ["Crash", "Backlot", "Strike", "District", "Crossfire"];

const matchSettings: Record<
  Division,
  { chips: string[]; rows: string[][]; note?: string }
> = {
  boys: {
    chips: ["S&D", "5v5", "Promod LIVE", "LAN"],
    rows: [
      ["Mode", "Search & Destroy (S&D)"],
      ["Platform / Mod", "CoD4 Promod LIVE / LAN"],
      ["Team Size", "5v5"],
      ["Friendly Fire", "Enabled"],
      ["Killcam", "Disabled"],
      ["3rd Person Spectating", "Disabled"],
      ["Round Timer", "1:45"],
      ["Bomb Fuse", "45s (Plant: 5s / Defuse: 7s)"],
      ["Win Condition", "First to 7 rounds (half-time swap at 6 rounds)"],
    ],
  },
  girls: {
    chips: ["TDM", "5v5", "15 Minutes"],
    rows: [
      ["Mode", "Team Deathmatch (TDM)"],
      ["Platform / Mod", "CoD4 Promod LIVE / LAN"],
      ["Team Size", "5v5"],
      ["Friendly Fire", "Enabled"],
      ["Killcam", "Disabled"],
      ["3rd Person Spectating", "Disabled"],
      ["Match Length", "15 minutes"],
      ["Win Condition", "Highest kill count when time expires"],
      [
        "Tie-Breaker",
        "Sudden death — first kill wins (or per-event overtime rule)",
      ],
    ],
  },
};

const tournamentStages: Record<
  Division,
  { title: string; rules: string[]; emphasis?: string }[]
> = {
  boys: [
    {
      title: "Initial Rounds & Group Stage — Best of 1",
      emphasis: "First to 7 rounds",
      rules: [
        "Win condition: first to 7 rounds, single map.",
        "A coin toss takes place before the match.",
        "Coin Toss Winner: Chooses the map.",
        "Coin Toss Loser: Chooses the starting side (Attack / Defend).",
      ],
    },
    {
      title: "Semi-Finals — Best of 3 Maps",
      rules: [
        "A coin toss takes place before the map veto.",
        "Coin Toss Winner: Bans 1 map.",
        "Coin Toss Loser: Bans 1 map.",
        "The remaining 3 maps form the available series maps.",
        "Coin Toss Winner: Chooses the starting side for Map 1.",
      ],
    },
    {
      title: "Grand Finals — Best of 3 Maps",
      emphasis: "First to 13 rounds per map",
      rules: [
        "Each map is played until one team reaches 13 round wins.",
        "The team that reaches 13 rounds first wins that map.",
        "The first team to win 2 maps wins the Grand Final.",
        "Map 3 is played only if the series is tied 1–1 after the first two maps.",
      ],
    },
  ],
  girls: [
    {
      title: "Initial Rounds & Group Stage — Best of 1",
      rules: [
        "A coin toss takes place before the match.",
        "Coin Toss Winner: Chooses the map.",
        "Coin Toss Loser: Chooses the starting spawn side.",
      ],
    },
    {
      title: "Semi-Finals — Best of 3 Maps",
      rules: [
        "A coin toss takes place before the map veto.",
        "Coin Toss Winner: Bans 1 map.",
        "Coin Toss Loser: Bans 1 map.",
        "The remaining 3 maps form the available series maps.",
        "Coin Toss Winner: Chooses the starting spawn side for Map 1.",
        "Map 3 is played only if the series is tied 1–1 after the first two maps.",
      ],
    },
    {
      title: "Grand Finals — Best of 3 Maps",
      rules: [
        "Win condition: The team with the highest kill total wins the map.",
        "Map 3 is played only if the series is tied 1–1 after the first two maps.",
        "Each map lasts 15 minutes.",
      ],
    },
  ],
};

const technicalRules: Record<Division, string[][]> = {
  boys: [
    [
      "Disconnect Before First Blood",
      "Round restarts (if under 30s, no kills).",
    ],
    [
      "Disconnect After First Blood",
      "Round plays out; player rejoins next round.",
    ],
    [
      "Macros & Scripts",
      "Rapid-fire or scroll-wheel fire binds are strictly banned.",
    ],
  ],
  girls: [
    [
      "Disconnect Within First 60 Seconds",
      "Match restarts if no significant score gap.",
    ],
    [
      "Disconnect After 60 Seconds",
      "Match plays out; player may rejoin at any time.",
    ],
    [
      "Macros & Scripts",
      "Rapid-fire or scroll-wheel fire binds are strictly banned.",
    ],
  ],
};

const fairPlay: Record<
  Division,
  { prohibited: string[]; note?: string; penalties: string[] }
> = {
  boys: {
    prohibited: [
      "Elevator glitches",
      "Sky-walking",
      "Going out of bounds",
      "Bomb defusing through solid walls/boxes",
    ],
    note: "Ghosting: Dead players cannot call out enemy positions to living teammates.",
    penalties: ["1st Offense: Round forfeit", "2nd Offense: Instant match DQ"],
  },
  girls: {
    prohibited: [
      "Elevator glitches",
      "Sky-walking",
      "Going out of bounds",
      "Spawn-camping/spawn-trapping abuse (may result in warning or penalty at admin discretion)",
      "Ghosting or coordinating with spectators is not allowed",
    ],
    penalties: [
      "1st Offense: Warning + score adjustment (5 kills deducted)",
      "2nd Offense: Instant match DQ",
    ],
  },
};

function RuleList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-2 h-1 w-1 shrink-0 bg-ember-600"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RulesPage() {
  const [division, setDivision] = useState<Division>("boys");
  const [openSection, setOpenSection] = useState<RuleSection | null>(
    RULE_SECTIONS[0],
  );

  const selectDivision = (nextDivision: Division) => {
    setDivision(nextDivision);
    setOpenSection(RULE_SECTIONS[0]);
  };

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10">
      <div>
        <h1 className="section-title">Rules and Regulations</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-500">
          // Final Tournament Rules
        </p>
      </div>

      <div
        className="mt-6 grid grid-cols-2 border border-night-700 bg-night-900 p-1"
        role="tablist"
        aria-label="Tournament division"
      >
        {(
          [
            ["boys", "Boys’ S&D"],
            ["girls", "Girls’ TDM"],
          ] as const
        ).map(([value, label]) => {
          const selected = division === value;
          return (
            <button
              key={value}
              id={`${value}-division-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="division-rules"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectDivision(value)}
              className={`min-h-11 px-3 py-2 font-display text-base font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ember-600 sm:text-lg ${selected ? "bg-ember-600 text-night-page" : "text-zinc-400 hover:bg-ember-600/5 hover:text-white"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        id="division-rules"
        role="tabpanel"
        aria-labelledby={`${division}-division-tab`}
        className="mt-2 space-y-2"
      >
        {RULE_SECTIONS.map((section, index) => {
          const isOpen = openSection === section;
          const panelId = `${division}-rules-panel-${index}`;
          const buttonId = `${division}-rules-button-${index}`;

          return (
            <section
              key={`${division}-${section}`}
              className="card !translate-y-0 overflow-hidden hover:!shadow-none"
            >
              <h2>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() =>
                    setOpenSection((current) =>
                      current === section ? null : section,
                    )
                  }
                  className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-ember-600/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ember-600 sm:px-5"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-ember-600/60">
                      0{index + 1}
                    </span>
                    <span className="font-display text-base font-bold uppercase tracking-[0.06em] text-white sm:text-lg">
                      {section}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                  >
                    <span className="absolute left-0 top-[7px] h-px w-4 bg-ember-600" />
                    <span className="absolute left-[7px] top-0 h-4 w-px bg-ember-600" />
                  </span>
                </button>
              </h2>

              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-night-700 px-4 py-5 sm:px-5">
                    {section === RULE_SECTIONS[0] && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                          {matchSettings[division].chips.map((item) => (
                            <span
                              key={item}
                              className="border border-ember-600/50 bg-ember-600/10 px-2.5 py-1 text-ember-400"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                        <dl className="grid gap-px overflow-hidden border border-night-700 bg-night-700 sm:grid-cols-2">
                          {matchSettings[division].rows.map(
                            ([label, value]) => (
                              <div
                                key={label}
                                className="flex flex-col gap-1 bg-night-900 px-3 py-2.5 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
                              >
                                <dt className="text-sm text-zinc-400">
                                  {label}
                                </dt>
                                <dd className="font-mono text-xs font-bold uppercase text-ember-400 min-[420px]:text-right">
                                  {value}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                        {matchSettings[division].note && (
                          <p className="border-l-2 border-ember-600 px-3 py-2 text-sm text-zinc-300">
                            {matchSettings[division].note}
                          </p>
                        )}
                      </div>
                    )}

                    {section === RULE_SECTIONS[1] && (
                      <div className="space-y-5">
                        <div>
                          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                            Class Limits
                          </h3>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {weaponClasses.map((item) => (
                              <div
                                key={item.name}
                                className="border border-night-700 bg-night-page/40 p-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <h4 className="font-display text-lg uppercase tracking-[0.05em] text-white">
                                    {item.name}
                                  </h4>
                                  <span className="font-mono text-[10px] font-bold uppercase text-ember-400">
                                    {item.limit}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-zinc-400">
                                  <span className="font-mono text-[10px] uppercase text-zinc-500">
                                    Weapons:{" "}
                                  </span>
                                  {item.weapons}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="border-l-2 border-ember-600 bg-ember-600/5 p-4">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-ember-400">
                            Strictly Banned
                          </h3>
                          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                            {bannedItems.map(([label, value]) => (
                              <div key={label}>
                                <dt className="font-bold text-zinc-200">
                                  {label}
                                </dt>
                                <dd className="mt-1 text-zinc-400">{value}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="mt-4 grid gap-2 border-t border-ember-600/20 pt-3 text-sm text-zinc-300 sm:grid-cols-2">
                            <p>
                              <strong className="text-ember-400">
                                Equipment Limit:
                              </strong>{" "}
                              1 Frag + 1 Flash/Smoke per player
                            </p>
                            <p>
                              <strong className="text-ember-400">
                                Perks & Killstreak Rewards:
                              </strong>{" "}
                              Disabled
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {section === RULE_SECTIONS[2] && (
                      <div className="space-y-5">
                        <div>
                          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                            Map Pool
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {mapPool.map((map) => (
                              <span
                                key={map}
                                className="border border-night-700 bg-night-page/40 px-3 py-1.5 font-mono text-xs uppercase text-zinc-300"
                              >
                                {map}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          {tournamentStages[division].map((stage) => (
                            <article
                              key={stage.title}
                              className={`border p-4 ${stage.emphasis ? "border-ember-600 bg-ember-600/5" : "border-night-700 bg-night-page/40"}`}
                            >
                              <h3 className="font-display text-lg font-bold uppercase tracking-[0.05em] text-white">
                                {stage.title}
                              </h3>
                              {stage.emphasis && (
                                <p className="mt-2 border-y border-ember-600/30 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-ember-400">
                                  {stage.emphasis}
                                </p>
                              )}
                              <div className="mt-3">
                                <RuleList items={stage.rules} />
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {section === RULE_SECTIONS[3] && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {technicalRules[division].map(([title, detail]) => (
                          <div
                            key={title}
                            className="border-l-2 border-ember-600/60 px-3 py-1"
                          >
                            <h3 className="font-bold text-zinc-200">{title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                              {detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {section === RULE_SECTIONS[4] && (
                      <div className="space-y-5">
                        <div>
                          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                            Prohibited
                          </h3>
                          <RuleList items={fairPlay[division].prohibited} />
                        </div>
                        {fairPlay[division].note && (
                          <p className="border-l-2 border-ember-600 px-3 py-2 text-sm leading-relaxed text-zinc-400">
                            {fairPlay[division].note}
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {fairPlay[division].penalties.map(
                            (penalty, penaltyIndex) => (
                              <div
                                key={penalty}
                                className={`border border-ember-600 p-3 ${penaltyIndex ? "bg-ember-600/10" : "bg-ember-600/5"}`}
                              >
                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ember-400">
                                  {penaltyIndex + 1}
                                  {penaltyIndex === 0 ? "st" : "nd"} Offense
                                </span>
                                <strong className="mt-1 block font-display text-lg uppercase text-white">
                                  {penalty}
                                </strong>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
