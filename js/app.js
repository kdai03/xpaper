/* xPaper — paper trading simulator for tokenized stocks on Solana.
   Virtual cash only. Live reference prices from Solana DEX markets. */
"use strict";

const LS_KEY = "xpaper_v1";

/* ---------- state ---------- */
function freshState() {
  return { cash: STARTING_CASH, positions: {}, trades: [], equity: [], spark: {} };
}
let S = freshState();
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) { const p = JSON.parse(raw); if (p && typeof p.cash === "number") S = Object.assign(freshState(), p); }
} catch (e) {}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }

let PRICES = {};   // mint -> {price, chg24, chg1h, name, img, liq, updated}
let demoSeeded = false;

/* ---------- demo seed (?demo=1) : pre-built portfolio for screenshots/video ---------- */
function seedDemo() {
  if (demoSeeded) return; demoSeeded = true;
  const now = Date.now(), H = 3600e3;
  const px = m => (PRICES[m] && PRICES[m].price) || 100;
  const buys = [
    ["XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", 25, 3.2 * H],
    ["Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", 40, 2.6 * H],
    ["XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", 10, 2.0 * H],
    ["XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", 15, 1.2 * H],
  ];
  S = freshState();
  buys.forEach(([mint, shares, ago], i) => {
    const price = px(mint) * (0.985 + i * 0.004);
    const total = shares * price;
    S.cash -= total;
    S.positions[mint] = { shares, avgCost: price };
    S.trades.push({ t: now - ago, side: "BUY", mint, symbol: sym(mint), shares, price, total });
  });
  // one partial sell
  const m = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const sp = px(m) * 1.01, sq = 10;
  S.positions[m].shares -= sq; S.cash += sq * sp;
  S.trades.push({ t: now - 0.5 * H, side: "SELL", mint: m, symbol: sym(m), shares: sq, price: sp, total: sq * sp });
  // equity curve: gentle climb to current value
  const cur = totalValue();
  for (let i = 40; i >= 0; i--) {
    const drift = (40 - i) / 40 * (cur - STARTING_CASH) + Math.sin(i * 0.7) * cur * 0.0012;
    S.equity.push({ t: now - i * 5 * 60e3, v: STARTING_CASH + drift });
  }
  S.trades.sort((a, b) => a.t - b.t);
  save();
}

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const sym = mint => (TOKENS.find(t => t.mint === mint) || {}).symbol || mint.slice(0, 6);
const tokenOf = mint => TOKENS.find(t => t.mint === mint) || { symbol: sym(mint), name: "Unknown", mint };
function fmtUSD(n) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) { return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; }
function fmtTime(t) {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function priceOf(mint) { return PRICES[mint] ? PRICES[mint].price : null; }
function positionValue(mint, pos) { const p = priceOf(mint); return p == null ? pos.shares * pos.avgCost : pos.shares * p; }
function totalValue() {
  let v = S.cash;
  for (const [mint, pos] of Object.entries(S.positions)) v += positionValue(mint, pos);
  return v;
}
function totalPnL() { return totalValue() - STARTING_CASH; }

/* ---------- prices ---------- */
async function fetchPrices() {
  const badge = $("live-badge");
  try {
    const ids = TOKENS.map(t => t.mint).join(",");
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + ids);
    if (!r.ok) throw new Error("http " + r.status);
    const data = await r.json();
    const best = {};
    for (const p of (data.pairs || [])) {
      if (p.chainId !== "solana") continue;
      const addr = p.baseToken && p.baseToken.address;
      if (!addr || !TOKENS.some(t => t.mint === addr)) continue;
      const liq = (p.liquidity && p.liquidity.usd) || 0;
      if (!best[addr] || liq > best[addr].liq) best[addr] = { pair: p, liq };
    }
    for (const t of TOKENS) {
      const b = best[t.mint];
      if (!b) continue;
      const p = b.pair;
      const price = parseFloat(p.priceUsd);
      if (!isFinite(price) || price <= 0) continue;
      PRICES[t.mint] = {
        price,
        chg24: (p.priceChange && isFinite(+p.priceChange.h24)) ? +p.priceChange.h24 : null,
        chg1h: (p.priceChange && isFinite(+p.priceChange.h1)) ? +p.priceChange.h1 : null,
        img: (p.info && p.info.imageUrl) || null,
        liq: b.liq, updated: Date.now(),
      };
      if (!S.spark[t.mint]) S.spark[t.mint] = [];
      S.spark[t.mint].push(price);
      if (S.spark[t.mint].length > 60) S.spark[t.mint] = S.spark[t.mint].slice(-60);
    }
    badge.classList.add("live");
    badge.innerHTML = '<span class="dot"></span>live · solana dex';
    // equity snapshot
    S.equity.push({ t: Date.now(), v: totalValue() });
    if (S.equity.length > 600) S.equity = S.equity.slice(-600);
    save();
    renderAll();
  } catch (e) {
    badge.classList.remove("live");
    badge.innerHTML = '<span class="dot"></span>reconnecting…';
  }
}

/* ---------- rendering ---------- */
function sparkSVG(mint, w, h) {
  const data = (S.spark[mint] || []).slice(-30);
  if (data.length < 2) return '<span class="muted small">—</span>';
  const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1) * w).toFixed(1)},${(h - (v - min) / rng * (h - 4) - 2).toFixed(1)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${up ? "#14f195" : "#ff5c5c"}" stroke-width="1.6"/></svg>`;
}
function logoHTML(mint, name) {
  const img = PRICES[mint] && PRICES[mint].img;
  return `<span class="token-logo">${img ? `<img src="${img}" alt="" loading="lazy">` : (name || "?").slice(0, 1)}</span>`;
}
function renderMarkets() {
  const tb = $("market-rows");
  tb.innerHTML = TOKENS.map(t => {
    const q = PRICES[t.mint];
    const price = q ? fmtUSD(q.price) : '<span class="muted">…</span>';
    const chg = q && q.chg24 != null
      ? `<span class="${q.chg24 >= 0 ? "up" : "down"} num">${fmtPct(q.chg24)}</span>` : '<span class="muted">—</span>';
    const pos = S.positions[t.mint];
    return `<tr>
      <td><div class="asset-cell">${logoHTML(t.mint, t.name)}
        <div><div class="asset-name">${t.symbol}</div><div class="asset-sub">${t.name} · xStock</div></div></div></td>
      <td class="num">${price}</td>
      <td>${chg}</td>
      <td>${sparkSVG(t.mint, 90, 30)}</td>
      <td style="text-align:right;white-space:nowrap">
        ${pos ? `<span class="muted small">${pos.shares.toFixed(4)} sh</span> ` : ""}
        <button class="btn primary small" onclick="openTrade('${t.mint}')">Trade</button>
      </td></tr>`;
  }).join("");
  $("hero-cash").textContent = fmtUSD(S.cash);
  const npos = Object.keys(S.positions).length;
  $("hero-positions").textContent = npos === 0 ? "no open positions yet" : npos + (npos === 1 ? " open position" : " open positions");
}
function renderPortfolio() {
  const tv = totalValue(), pnl = totalPnL(), pct = pnl / STARTING_CASH * 100;
  $("pill-value").textContent = fmtUSD(tv);
  const pill = $("pill-pnl");
  pill.textContent = (pnl >= 0 ? "+" : "") + fmtUSD(pnl).replace("$-", "-$");
  pill.className = "pill-pnl " + (pnl >= 0 ? "up" : "down");
  $("stat-total").textContent = fmtUSD(tv);
  $("stat-cash").textContent = fmtUSD(S.cash);
  $("stat-invested").textContent = fmtUSD(tv - S.cash);
  const sp = $("stat-pnl");
  sp.textContent = fmtUSD(pnl); sp.className = "stat-value " + (pnl >= 0 ? "up" : "down");
  const spp = $("stat-pnl-pct");
  spp.textContent = fmtPct(pct); spp.className = "stat-sub " + (pnl >= 0 ? "up" : "down");

  const rows = Object.entries(S.positions);
  $("no-positions").style.display = rows.length ? "none" : "block";
  $("position-rows").innerHTML = rows.map(([mint, pos]) => {
    const t = tokenOf(mint), price = priceOf(mint);
    const val = positionValue(mint, pos);
    const pl = price == null ? 0 : (price - pos.avgCost) * pos.shares;
    const plp = pos.avgCost > 0 && price != null ? (price / pos.avgCost - 1) * 100 : 0;
    return `<tr>
      <td><div class="asset-cell">${logoHTML(mint, t.name)}
        <div><div class="asset-name">${t.symbol}</div><div class="asset-sub">${t.name}</div></div></div></td>
      <td class="num">${pos.shares.toFixed(4)}</td>
      <td class="num">${fmtUSD(pos.avgCost)}</td>
      <td class="num">${price == null ? "…" : fmtUSD(price)}</td>
      <td class="num">${fmtUSD(val)}</td>
      <td class="${pl >= 0 ? "up" : "down"} num">${fmtUSD(pl)} <span class="small">(${fmtPct(plp)})</span></td>
      <td style="text-align:right"><button class="btn ghost small" onclick="openTrade('${mint}','sell')">Sell</button></td></tr>`;
  }).join("");
  drawChart();
}
function renderHistory() {
  const rows = [...S.trades].reverse();
  $("trade-count").textContent = rows.length + (rows.length === 1 ? " trade" : " trades");
  $("no-history").style.display = rows.length ? "none" : "block";
  $("history-rows").innerHTML = rows.map(tr => `
    <tr><td class="muted small">${fmtTime(tr.t)}</td>
    <td><span class="${tr.side === "BUY" ? "up" : "down"}" style="font-weight:700">${tr.side}</span></td>
    <td><strong>${tr.symbol}</strong></td>
    <td class="num">${tr.shares.toFixed(4)}</td>
    <td class="num">${fmtUSD(tr.price)}</td>
    <td class="num">${fmtUSD(tr.total)}</td></tr>`).join("");
}
function renderAll() { renderMarkets(); renderPortfolio(); renderHistory(); }

/* ---------- equity chart ---------- */
function drawChart() {
  const c = $("equity-chart"), empty = $("chart-empty");
  const data = S.equity.filter(p => isFinite(p.v));
  if (data.length < 2) { empty.style.display = "block"; c.style.display = "none"; return; }
  empty.style.display = "none"; c.style.display = "block";
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || c.parentElement.clientWidth - 42, H = 220;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const vals = data.map(p => p.v);
  let min = Math.min(...vals, STARTING_CASH), max = Math.max(...vals, STARTING_CASH);
  const pad = (max - min) * 0.15 || 100; min -= pad; max += pad;
  const X = i => i / (data.length - 1) * (W - 8) + 4;
  const Y = v => H - 24 - (v - min) / (max - min) * (H - 48);
  // baseline
  ctx.strokeStyle = "#3a4763"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, Y(STARTING_CASH)); ctx.lineTo(W, Y(STARTING_CASH)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#8b98ad"; ctx.font = "11px sans-serif";
  ctx.fillText("start " + fmtUSD(STARTING_CASH), 6, Y(STARTING_CASH) - 5);
  // area
  const up = vals[vals.length - 1] >= STARTING_CASH;
  const col = up ? "#14f195" : "#ff5c5c";
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, up ? "rgba(20,241,149,.25)" : "rgba(255,92,92,.25)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  data.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p.v)) : ctx.moveTo(X(0), Y(p.v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(X(data.length - 1), H); ctx.lineTo(X(0), H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // last value label
  const lv = vals[vals.length - 1];
  ctx.fillStyle = col; ctx.font = "bold 12px sans-serif";
  ctx.fillText(fmtUSD(lv), W - 92, Y(lv) - 8);
}

/* ---------- trade modal ---------- */
let tradeMint = null, tradeSide = "buy";
window.openTrade = function (mint, side) {
  tradeMint = mint; tradeSide = side === "sell" ? "sell" : "buy";
  const t = tokenOf(mint), q = PRICES[mint];
  $("tm-logo").outerHTML = logoHTML(mint, t.name).replace('class="token-logo"', 'class="token-logo" id="tm-logo"');
  $("tm-symbol").textContent = t.symbol;
  $("tm-name").textContent = t.name + " · xStock on Solana";
  $("tm-price").textContent = q ? fmtUSD(q.price) : "loading…";
  $("tm-shares").value = "";
  setSide(tradeSide);
  updateTradeCalc();
  $("trade-modal").classList.add("open");
};
function setSide(side) {
  tradeSide = side;
  $("side-buy").classList.toggle("active", side === "buy");
  $("side-sell").classList.toggle("active", side === "sell");
  $("tm-submit").textContent = side === "buy" ? "Place buy order" : "Place sell order";
  $("tm-avail-label").textContent = side === "buy" ? "Cash available" : "Shares held";
  updateTradeCalc();
}
$("side-buy").onclick = () => setSide("buy");
$("side-sell").onclick = () => setSide("sell");
$("tm-close").onclick = () => $("trade-modal").classList.remove("open");
$("trade-modal").addEventListener("click", e => { if (e.target.id === "trade-modal") $("trade-modal").classList.remove("open"); });
$("tm-shares").addEventListener("input", updateTradeCalc);
document.querySelectorAll(".chip").forEach(ch => ch.onclick = () => {
  const q = parseFloat(ch.dataset.q), t = tokenOf(tradeMint), price = priceOf(tradeMint);
  if (!price) return;
  let shares;
  if (tradeSide === "buy") shares = (S.cash * q) / price;
  else { const pos = S.positions[tradeMint]; shares = pos ? pos.shares * q : 0; }
  $("tm-shares").value = shares > 0 ? shares.toFixed(4) : "";
  updateTradeCalc();
});
function updateTradeCalc() {
  const price = priceOf(tradeMint);
  const shares = parseFloat($("tm-shares").value) || 0;
  $("tm-total").textContent = price && shares > 0 ? fmtUSD(shares * price) : "$0.00";
  if (tradeSide === "buy") $("tm-avail").textContent = fmtUSD(S.cash);
  else { const pos = S.positions[tradeMint]; $("tm-avail").textContent = pos ? pos.shares.toFixed(4) + " sh" : "0 sh"; }
}
function toast(msg, err) {
  const d = document.createElement("div");
  d.className = "toast" + (err ? " err" : ""); d.textContent = msg;
  $("toasts").appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
$("tm-submit").onclick = () => {
  const t = tokenOf(tradeMint), price = priceOf(tradeMint);
  const shares = parseFloat($("tm-shares").value);
  if (!price) return toast("Price not loaded yet — try again in a moment.", true);
  if (!isFinite(shares) || shares <= 0) return toast("Enter a share amount greater than zero.", true);
  if (tradeSide === "buy") {
    const cost = shares * price;
    if (cost > S.cash + 1e-9) return toast(`Not enough virtual cash (need ${fmtUSD(cost)}).`, true);
    S.cash -= cost;
    const pos = S.positions[tradeMint] || { shares: 0, avgCost: 0 };
    pos.avgCost = (pos.avgCost * pos.shares + cost) / (pos.shares + shares);
    pos.shares += shares;
    S.positions[tradeMint] = pos;
    S.trades.push({ t: Date.now(), side: "BUY", mint: tradeMint, symbol: t.symbol, shares, price, total: cost });
    toast(`Bought ${shares.toFixed(4)} ${t.symbol} @ ${fmtUSD(price)} (virtual)`);
  } else {
    const pos = S.positions[tradeMint];
    if (!pos || pos.shares < shares - 1e-9) return toast(`You only hold ${(pos ? pos.shares : 0).toFixed(4)} shares.`, true);
    const proceeds = shares * price;
    pos.shares -= shares;
    if (pos.shares < 1e-9) delete S.positions[tradeMint];
    S.cash += proceeds;
    S.trades.push({ t: Date.now(), side: "SELL", mint: tradeMint, symbol: t.symbol, shares, price, total: proceeds });
    toast(`Sold ${shares.toFixed(4)} ${t.symbol} @ ${fmtUSD(price)} (virtual)`);
  }
  S.equity.push({ t: Date.now(), v: totalValue() });
  save(); renderAll();
  $("trade-modal").classList.remove("open");
};

/* ---------- nav / misc ---------- */
document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".view").forEach(x => x.classList.remove("active"));
  tab.classList.add("active");
  $("view-" + tab.dataset.view).classList.add("active");
  if (tab.dataset.view === "portfolio") drawChart();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("goto-markets").onclick = e => { e.preventDefault(); document.querySelector('[data-view="markets"]').click(); };
$("hero-trade-btn").onclick = () => {
  document.querySelector('[data-view="markets"]').click();
  document.querySelector(".market-table").scrollIntoView({ behavior: "smooth" });
};
$("reset-btn").onclick = () => {
  if (!confirm("Reset your virtual portfolio back to $100,000 cash?")) return;
  const spark = S.spark;
  S = freshState(); S.spark = spark;
  save(); renderAll(); toast("Demo reset — $100,000 virtual cash restored.");
};
window.addEventListener("resize", () => { if ($("view-portfolio").classList.contains("active")) drawChart(); });

/* ---------- boot ---------- */
(async function boot() {
  renderAll();
  await fetchPrices();
  if (new URLSearchParams(location.search).get("demo") === "1" && !localStorage.getItem("xpaper_demo")) {
    localStorage.setItem("xpaper_demo", "1");
    seedDemo(); renderAll();
  }
  setInterval(fetchPrices, PRICE_POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchPrices(); });
})();
