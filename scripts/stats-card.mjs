// Builds dist/stats.svg from live GitHub data. Runs daily in the snake workflow.
// If the API call fails the script throws, the job stops, and yesterday's card stays up.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "dist";
const LOGIN = process.env.GH_LOGIN ?? "jugendrapratap04-max";
const TOKEN = process.env.GH_TOKEN;
const LIVE_PROJECTS = 6; // update by hand when a project goes live or comes down

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection { contributionCalendar { totalContributions } }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
      totalCount
      nodes { defaultBranchRef { target { ... on Commit { history { totalCount } } } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
const json = await res.json();
if (!res.ok || json.errors || !json.data?.user) throw new Error("GitHub API failed: " + JSON.stringify(json.errors ?? json));

const u = json.data.user;
const stats = [
  [u.contributionsCollection.contributionCalendar.totalContributions, "Contributions in the last year"],
  [u.repositories.totalCount, "Public repositories"],
  [u.repositories.nodes.reduce((n, r) => n + (r.defaultBranchRef?.target?.history?.totalCount ?? 0), 0), "Commits across public repos"],
  [LIVE_PROJECTS, "Projects live on the web"],
];

const W = 850, H = 150, COL = 24, ROW = 46, NY = 30;
const FONT = "'Segoe UI',Ubuntu,'Helvetica Neue',Arial,sans-serif";
const block = W / stats.length;

// Each digit is a strip 0-9-0-9. The first frame already shows the real digit,
// then the strip rolls one full turn and lands on the same digit again.
const odometer = (value, cx, bi) => {
  const digits = String(value).split("").map(Number);
  const left = cx - (digits.length * COL) / 2;
  return digits.map((k, c) => {
    const rows = Array.from({ length: 20 }, (_, r) =>
      `<text x="${COL / 2}" y="${NY + 36 + r * ROW}" class="num">${r % 10}</text>`).join("");
    const begin = (0.3 + bi * 0.15 + c * 0.1).toFixed(2);
    return `<g transform="translate(${left + c * COL} 0)" clip-path="url(#win)"><g transform="translate(0 ${-k * ROW})">
      <animateTransform attributeName="transform" type="translate" from="0 ${-k * ROW}" to="0 ${-(k + 10) * ROW}" begin="${begin}s" dur="1.6s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" fill="freeze"/>
      ${rows}</g></g>`;
  }).join("\n  ");
};

const blocks = stats.map(([value, label], i) => {
  const cx = block * i + block / 2;
  return `${odometer(value, cx, i)}
  <rect x="${cx - 14}" y="${NY + ROW + 8}" width="28" height="3" rx="1.5" fill="#38bdf8"/>
  <text x="${cx}" y="${NY + ROW + 34}" class="lbl">${label}</text>`;
}).join("\n  ");

const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const aria = stats.map(([v, l]) => `${v} ${l.toLowerCase()}`).join(", ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats: ${aria}.">
  <title>GitHub stats</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d111c"/><stop offset="1" stop-color="#192642"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#818cf8" stop-opacity=".16"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></radialGradient>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
    <clipPath id="win"><rect x="0" y="${NY}" width="${COL}" height="${ROW}"/></clipPath>
  </defs>
  <style>
    .num{font:700 38px ${FONT};fill:#fff;text-anchor:middle}
    .lbl{font:500 13px ${FONT};fill:#94a3b8;text-anchor:middle}
    .foot{font:400 11px ${FONT};fill:#64748b;text-anchor:end}
  </style>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle r="200" cy="0" fill="url(#glow)"><animate attributeName="cx" dur="15s" repeatCount="indefinite" values="140;360;140"/></circle>
  </g>
  ${blocks}
  <text x="${W - 18}" y="${H - 12}" class="foot">Updated daily · ${date}</text>
</svg>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "stats.svg"), svg);
console.log("stats.svg written:", stats.map(([v, l]) => `${l}=${v}`).join(" | "));
