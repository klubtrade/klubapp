// deck/build-deck.js
// Builds the KLUB investor deck as a .pptx.
// Run with: node build-deck.js

const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches
pres.author = 'KLUB';
pres.company = 'KLUB Labs';
pres.title = 'KLUB — Members-only on-chain perps';

// ---------------------------------------------------------------------------
// Palette + constants (matches product)
// ---------------------------------------------------------------------------

const C = {
  bg: '0A0A0A',
  surface: '171717',
  border: '3F3F46',
  borderSubtle: '262626',
  fg: 'FAFAFA',
  fgSecondary: 'A3A3A3',
  fgMuted: '525252',
  accent: 'A78BFA',
  accentBright: 'C4B5FD',
  long: '10B981',
  short: 'EF4444',
  yellow: 'EAB308',
};

const FONT_HEAD = 'Calibri'; // Geist not available in PowerPoint; Calibri is the nearest clean sans
const FONT_MONO = 'Consolas';

const W = 13.333;
const H = 7.5;

// Shared small-caps header helper
function smallcaps(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.6,
    y: opts.y ?? 0.55,
    w: opts.w ?? 6,
    h: 0.25,
    fontFace: FONT_MONO,
    fontSize: 9,
    charSpacing: 6,
    bold: true,
    color: opts.color ?? C.fgMuted,
    align: 'left',
    margin: 0,
  });
}

// Footer on every slide
function addFooter(slide, pageNum, total) {
  slide.addText('KLUB · MEMBERS-ONLY ON-CHAIN PERPS', {
    x: 0.6, y: H - 0.4, w: 8, h: 0.25,
    fontFace: FONT_MONO, fontSize: 8, charSpacing: 4,
    color: C.fgMuted, margin: 0,
  });
  slide.addText(`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, {
    x: W - 1.8, y: H - 0.4, w: 1.3, h: 0.25,
    fontFace: FONT_MONO, fontSize: 8,
    color: C.fgMuted, align: 'right', margin: 0,
  });
}

// Live-dot + brand strip on every slide
function addTopStrip(slide) {
  // accent dot
  slide.addShape('ellipse', {
    x: 0.6, y: 0.3, w: 0.08, h: 0.08,
    fill: { color: C.accent }, line: { color: C.accent },
  });
  slide.addText('KLUB', {
    x: 0.78, y: 0.24, w: 1.5, h: 0.25,
    fontFace: FONT_MONO, fontSize: 9, charSpacing: 6, bold: true,
    color: C.fg, margin: 0,
  });
}

// Dark background fill
function darkBg(slide) {
  slide.background = { color: C.bg };
}

const TOTAL_SLIDES = 12;

// ---------------------------------------------------------------------------
// Slide 01 — Title
// ---------------------------------------------------------------------------
(function title() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);

  // Huge brand
  slide.addText('KLUB', {
    x: 0.6, y: 2.1, w: 8, h: 1.8,
    fontFace: FONT_HEAD, fontSize: 160, bold: true,
    color: C.fg, charSpacing: -4, margin: 0,
  });

  // Tagline
  slide.addText('Trade with the klub.', {
    x: 0.6, y: 4.1, w: 8, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 36,
    color: C.accent, margin: 0,
  });

  // Subline
  slide.addText('Members-only on-chain perps. Built on Bulk Exchange.', {
    x: 0.6, y: 4.85, w: 8, h: 0.5,
    fontFace: FONT_HEAD, fontSize: 18,
    color: C.fgSecondary, margin: 0,
  });

  // Date + series chip bottom-right
  slide.addText('SEED ROUND · 2026', {
    x: W - 3.5, y: H - 1.1, w: 2.8, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
    color: C.accent, align: 'right', margin: 0,
  });
  slide.addText('INVESTOR DECK', {
    x: W - 3.5, y: H - 0.8, w: 2.8, h: 0.3,
    fontFace: FONT_MONO, fontSize: 9, charSpacing: 6,
    color: C.fgMuted, align: 'right', margin: 0,
  });
})();

// ---------------------------------------------------------------------------
// Slide 02 — Problem
// ---------------------------------------------------------------------------
(function problem() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'THE PROBLEM');

  slide.addText([
    { text: 'On-chain perps\nwere built for quants.\n', options: { color: C.fg, breakLine: true } },
    { text: 'Retail pays the tuition.', options: { color: C.fgSecondary } },
  ], {
    x: 0.6, y: 1.2, w: 8.5, h: 2.8,
    fontFace: FONT_HEAD, fontSize: 54, bold: true,
    margin: 0,
  });

  // Big stat callout
  slide.addText('~60%', {
    x: 8.8, y: 1.5, w: 4, h: 1.8,
    fontFace: FONT_MONO, fontSize: 110, bold: true,
    color: C.accent, align: 'right', charSpacing: -2, margin: 0,
  });
  slide.addText('of retail liquidated\nwithin their first 30 days', {
    x: 8.8, y: 3.4, w: 4, h: 0.8,
    fontFace: FONT_HEAD, fontSize: 14,
    color: C.fgSecondary, align: 'right', margin: 0,
  });

  // Four causes row
  const causes = [
    { n: '01', t: 'Can\'t size positions', d: 'Think in dollars, not exposure.' },
    { n: '02', t: 'Don\'t understand funding', d: 'Think it\'s a fee. It\'s a rent.' },
    { n: '03', t: 'No way to practice', d: 'Testnet exists; nobody finds it.' },
    { n: '04', t: 'No on-ramp that fits', d: 'Three bridges, one fat finger.' },
  ];
  causes.forEach((c, i) => {
    const x = 0.6 + i * 3.05;
    slide.addShape('rect', {
      x, y: 4.6, w: 2.85, h: 1.8,
      fill: { color: C.surface },
      line: { color: C.borderSubtle, width: 0.75 },
    });
    slide.addText(c.n, {
      x: x + 0.2, y: 4.75, w: 2.5, h: 0.3,
      fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
      color: C.accent, margin: 0,
    });
    slide.addText(c.t, {
      x: x + 0.2, y: 5.15, w: 2.5, h: 0.5,
      fontFace: FONT_HEAD, fontSize: 16, bold: true,
      color: C.fg, margin: 0,
    });
    slide.addText(c.d, {
      x: x + 0.2, y: 5.75, w: 2.5, h: 0.6,
      fontFace: FONT_HEAD, fontSize: 11,
      color: C.fgSecondary, margin: 0,
    });
  });

  addFooter(slide, 2, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 03 — Why now
// ---------------------------------------------------------------------------
(function whyNow() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'WHY NOW');

  slide.addText('The plumbing is finally world-class.\nThe cockpit for retail isn\'t.', {
    x: 0.6, y: 1.2, w: 12, h: 1.8,
    fontFace: FONT_HEAD, fontSize: 40, bold: true,
    color: C.fg, margin: 0,
  });

  const reasons = [
    {
      t: 'Matching engines caught up',
      d: 'On-chain perps now run at 5–20ms matching latency (Bulk, Hyperliquid). Speed is no longer the bottleneck — interface is.',
    },
    {
      t: 'Agent wallets are first-class',
      d: 'Bulk and others expose scoped, revocable signing keys natively. Non-custodial copy trading is buildable today in a way it wasn\'t 18 months ago.',
    },
    {
      t: 'Retail capital is migrating on-chain',
      d: 'Fiat on-ramps into Solana are mainstream (Coinbase, MoonPay, Stripe). The last-mile problem retail faced in 2022 is solved.',
    },
    {
      t: 'Regulatory pressure reshaping CEX experience',
      d: 'US-market CEX retreat is accelerating migration to permissionless venues — for the 95% of the world not locked out.',
    },
  ];

  reasons.forEach((r, i) => {
    const x = 0.6 + (i % 2) * 6.1;
    const y = 3.3 + Math.floor(i / 2) * 1.85;
    // accent square bullet
    slide.addShape('rect', {
      x, y: y + 0.12, w: 0.1, h: 0.1,
      fill: { color: C.accent }, line: { color: C.accent },
    });
    slide.addText(r.t, {
      x: x + 0.3, y, w: 5.5, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 18, bold: true,
      color: C.fg, margin: 0,
    });
    slide.addText(r.d, {
      x: x + 0.3, y: y + 0.45, w: 5.5, h: 1.2,
      fontFace: FONT_HEAD, fontSize: 12,
      color: C.fgSecondary, margin: 0,
    });
  });

  addFooter(slide, 3, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 04 — Solution
// ---------------------------------------------------------------------------
(function solution() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'THE SOLUTION');

  slide.addText([
    { text: 'Every tool a pro has.\n', options: { color: C.fg, breakLine: true } },
    { text: 'Every guardrail retail needs.', options: { color: C.accent } },
  ], {
    x: 0.6, y: 1.2, w: 12, h: 1.8,
    fontFace: FONT_HEAD, fontSize: 44, bold: true,
    margin: 0,
  });

  // 3-column feature grid
  const cols = [
    {
      head: 'FOLLOW',
      body: 'Opt-in leaderboard of traders, ranked net of fees and funding. One-tap mirror with allocation caps, stop-loss override, pause.',
    },
    {
      head: 'THE MATH',
      body: 'Pre-trade calculator: liquidation price, PnL at target, loss at stop, funding per 8h, breakeven move, R:R. Screams when the stop is beyond liquidation.',
    },
    {
      head: 'ALERTS',
      body: 'Liquidation alerts at 25% / 10% / 3% buffer. Push, email, Telegram. One-tap actions: add margin, reduce, close. Fires whether the app is open or not.',
    },
  ];

  cols.forEach((c, i) => {
    const x = 0.6 + i * 4.15;
    slide.addShape('rect', {
      x, y: 3.3, w: 3.9, h: 2.8,
      fill: { color: C.surface },
      line: { color: C.border, width: 0.75 },
    });
    slide.addText(c.head, {
      x: x + 0.3, y: 3.5, w: 3.6, h: 0.3,
      fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
      color: C.accent, margin: 0,
    });
    slide.addText(c.body, {
      x: x + 0.3, y: 3.95, w: 3.6, h: 2,
      fontFace: FONT_HEAD, fontSize: 13,
      color: C.fgSecondary, margin: 0,
      valign: 'top',
    });
  });

  // Bottom row: three V2 pills, evenly distributed
  slide.addText('+ V2:', {
    x: 0.6, y: 6.3, w: 0.7, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, bold: true,
    color: C.fgMuted, margin: 0,
  });
  const v2 = ['BASIS — funding vault', 'THE DESK — arb engine', 'KLUB PRO — terminal'];
  v2.forEach((s, i) => {
    slide.addText(s, {
      x: 1.35 + i * 3.85, y: 6.3, w: 3.8, h: 0.3,
      fontFace: FONT_MONO, fontSize: 9,
      color: C.fgSecondary, margin: 0,
    });
  });

  addFooter(slide, 4, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 05 — Product demo (screenshot-free narrative)
// ---------------------------------------------------------------------------
(function product() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'PRODUCT · THE HERO MOMENT');

  slide.addText('The calculator that shows the liquidation price\nbefore you hit the button.', {
    x: 0.6, y: 1.2, w: 12, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 32, bold: true,
    color: C.fg, margin: 0,
  });

  // Fake "calculator panel" — using shapes
  const panelX = 0.6, panelY = 3.2, panelW = 6, panelH = 3.6;
  slide.addShape('rect', {
    x: panelX, y: panelY, w: panelW, h: panelH,
    fill: { color: C.surface },
    line: { color: C.border, width: 1 },
  });
  // accent corner brackets
  [['tl', panelX, panelY], ['br', panelX + panelW - 0.15, panelY + panelH - 0.15]].forEach(([, x, y]) => {
    slide.addShape('rect', { x, y, w: 0.15, h: 0.03, fill: { color: C.accent }, line: { color: C.accent } });
    slide.addShape('rect', { x, y, w: 0.03, h: 0.15, fill: { color: C.accent }, line: { color: C.accent } });
  });

  slide.addText('LIQUIDATION', {
    x: panelX + 0.4, y: panelY + 0.4, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
    color: C.fgMuted, margin: 0,
  });
  slide.addText('$58,940', {
    x: panelX + 0.4, y: panelY + 0.8, w: 5, h: 1.4,
    fontFace: FONT_MONO, fontSize: 78, bold: true,
    color: C.accent, charSpacing: -2, margin: 0,
  });
  slide.addText('12.6% adverse move from entry · BTC-USD', {
    x: panelX + 0.4, y: panelY + 2.3, w: 5.2, h: 0.3,
    fontFace: FONT_MONO, fontSize: 11,
    color: C.fgSecondary, margin: 0,
  });
  // Bar
  slide.addShape('rect', {
    x: panelX + 0.4, y: panelY + 2.75, w: 5.2, h: 0.05,
    fill: { color: C.borderSubtle }, line: { color: C.borderSubtle },
  });
  slide.addShape('rect', {
    x: panelX + 0.4, y: panelY + 2.75, w: 1.2, h: 0.05,
    fill: { color: C.yellow }, line: { color: C.yellow },
  });
  slide.addText('⚠ YOUR STOP IS BEYOND LIQUIDATION. TIGHTEN OR REDUCE LEVERAGE.', {
    x: panelX + 0.4, y: panelY + 3, w: 5.2, h: 0.4,
    fontFace: FONT_MONO, fontSize: 9, charSpacing: 4, bold: true,
    color: C.short, margin: 0,
  });

  // Right-side narrative
  const rx = 7.3;
  slide.addText('What retail sees everywhere else:', {
    x: rx, y: panelY + 0.1, w: 5.5, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 15, bold: true,
    color: C.fgSecondary, margin: 0,
  });
  slide.addText([
    { text: '"10x leverage · Enter long"', options: { italic: true, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Liquidation price? Calculate it yourself. Funding? Hope it\'s negative. Stop below liq? Good luck.', options: {} },
  ], {
    x: rx, y: panelY + 0.5, w: 5.5, h: 1.3,
    fontFace: FONT_HEAD, fontSize: 13,
    color: C.fgMuted, margin: 0,
  });

  slide.addText('What the klub sees:', {
    x: rx, y: panelY + 2, w: 5.5, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 15, bold: true,
    color: C.fg, margin: 0,
  });
  slide.addText([
    { text: 'Liq price: $58,940 (12.6% buffer)\n', options: { breakLine: true } },
    { text: 'Funding: $0.81 / 8h at 0.01% rate\n', options: { breakLine: true } },
    { text: 'Stop beyond liq: CAUGHT, red warning\n', options: { breakLine: true } },
    { text: 'R:R: 1.94 : 1 computed live', options: {} },
  ], {
    x: rx, y: panelY + 2.4, w: 5.5, h: 1.6,
    fontFace: FONT_MONO, fontSize: 11,
    color: C.fgSecondary, margin: 0,
  });

  addFooter(slide, 5, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 06 — Market size
// ---------------------------------------------------------------------------
(function market() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'MARKET');

  slide.addText('Big enough to matter.\nSpecific enough to win.', {
    x: 0.6, y: 1.2, w: 12, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 36, bold: true,
    color: C.fg, margin: 0,
  });

  // Three size rings (TAM / SAM / SOM)
  const rings = [
    { label: 'TAM', value: '~30M', sub: 'Global retail perpetual-futures traders (CEX + DEX)', color: C.accent },
    { label: 'SAM', value: '~10M', sub: 'Retail ex-US/UK comfortable on-chain', color: C.accentGlow },
    { label: 'SOM (Y1)', value: '~100k', sub: 'Waitlist-gated early cohort, mainnet + testnet batches', color: C.fg },
  ];

  rings.forEach((r, i) => {
    const x = 0.6 + i * 4.2;
    slide.addShape('rect', {
      x, y: 3.3, w: 3.9, h: 2.6,
      fill: { color: C.surface },
      line: { color: C.borderSubtle, width: 0.75 },
    });
    slide.addText(r.label, {
      x: x + 0.3, y: 3.5, w: 3.6, h: 0.3,
      fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
      color: C.fgMuted, margin: 0,
    });
    slide.addText(r.value, {
      x: x + 0.3, y: 3.85, w: 3.6, h: 1.1,
      fontFace: FONT_MONO, fontSize: 60, bold: true,
      color: r.color, charSpacing: -2, margin: 0,
    });
    slide.addText(r.sub, {
      x: x + 0.3, y: 5, w: 3.6, h: 0.8,
      fontFace: FONT_HEAD, fontSize: 11,
      color: C.fgSecondary, margin: 0, valign: 'top',
    });
  });

  slide.addText('Volumes: on-chain perps volumes crossed $2T annualized in 2024, with retail share rising as CEX alternatives expand.', {
    x: 0.6, y: 6.15, w: 12, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 11, italic: true,
    color: C.fgMuted, margin: 0,
  });

  addFooter(slide, 6, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 07 — Business model
// ---------------------------------------------------------------------------
(function model() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'BUSINESS MODEL');

  slide.addText('Four revenue streams.\nNo token at launch.', {
    x: 0.6, y: 1.2, w: 12, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 36, bold: true,
    color: C.fg, margin: 0,
  });

  const rows = [
    { n: '01', t: 'Copy-trade performance fee', d: '20% on net mirrored PnL. Split 10% leader / 10% platform.', tag: 'V1' },
    { n: '02', t: 'Basis vault management fee', d: '2% management + 20% performance on funding-harvest yield.', tag: 'V2' },
    { n: '03', t: 'Ramp rebate', d: '10–30 bps from the ramp provider on retail deposits.', tag: 'V1' },
    { n: '04', t: 'Integrator PFOF share', d: 'Revenue share with Bulk on routed volume, pending integrator terms.', tag: 'V1' },
  ];

  rows.forEach((r, i) => {
    const y = 3.2 + i * 0.85;
    slide.addShape('rect', {
      x: 0.6, y, w: 12.1, h: 0.75,
      fill: { color: C.surface },
      line: { color: C.borderSubtle, width: 0.5 },
    });
    slide.addText(r.n, {
      x: 0.9, y, w: 0.6, h: 0.75,
      fontFace: FONT_MONO, fontSize: 11, charSpacing: 4, bold: true,
      color: C.accent, valign: 'middle', margin: 0,
    });
    slide.addText(r.t, {
      x: 1.6, y, w: 5, h: 0.75,
      fontFace: FONT_HEAD, fontSize: 16, bold: true,
      color: C.fg, valign: 'middle', margin: 0,
    });
    slide.addText(r.d, {
      x: 6.6, y, w: 5, h: 0.75,
      fontFace: FONT_HEAD, fontSize: 12,
      color: C.fgSecondary, valign: 'middle', margin: 0,
    });
    slide.addShape('rect', {
      x: 11.85, y: y + 0.25, w: 0.6, h: 0.25,
      fill: { color: r.tag === 'V1' ? C.accent : C.borderSubtle },
      line: { color: r.tag === 'V1' ? C.accent : C.border },
    });
    slide.addText(r.tag, {
      x: 11.85, y: y + 0.25, w: 0.6, h: 0.25,
      fontFace: FONT_MONO, fontSize: 8, charSpacing: 4, bold: true,
      color: r.tag === 'V1' ? C.bg : C.fgMuted, align: 'center', valign: 'middle', margin: 0,
    });
  });

  addFooter(slide, 7, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 08 — Competition
// ---------------------------------------------------------------------------
(function competition() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'COMPETITION');

  slide.addText('Everyone\'s building for the quants again.\nWe\'re the only one building the cockpit.', {
    x: 0.6, y: 1.2, w: 12.1, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 28, bold: true,
    color: C.fg, margin: 0,
  });

  // 2x2 grid
  const mtx = [
    {
      x: 0.6, y: 3.2, t: 'Direct DEXes',
      names: 'Hyperliquid · dYdX · GMX',
      d: 'Great engines, pro-trader UX. Retail welcome but not catered to. No in-product copy trading or liquidation coaching.',
      color: C.fgSecondary,
    },
    {
      x: 6.75, y: 3.2, t: 'Social-trading attempts',
      names: 'SocialFi copy-trade apps · FTW copy · eToro clones',
      d: 'Gross-PnL leaderboards, custodial models, weak risk disclosure. Retail-washing, not retail-serving.',
      color: C.fgSecondary,
    },
    {
      x: 0.6, y: 5.2, t: 'Yield aggregators',
      names: 'Liminal · Ethena-adjacent',
      d: 'Single vault products. Not a front-end superapp — they compete with our Basis feature, not the whole KLUB.',
      color: C.fgSecondary,
    },
    {
      x: 6.75, y: 5.2, t: 'KLUB',
      names: 'The category we\'re defining',
      d: 'Retail-first cockpit: opt-in leaderboard, live pre-trade math, liquidation alerts, testnet journal, ramp. Non-custodial throughout.',
      color: C.accent,
      accent: true,
    },
  ];

  mtx.forEach((m) => {
    slide.addShape('rect', {
      x: m.x, y: m.y, w: 6, h: 1.8,
      fill: { color: m.accent ? C.bg : C.surface },
      line: { color: m.accent ? C.accent : C.borderSubtle, width: m.accent ? 1.5 : 0.5 },
    });
    slide.addText(m.t, {
      x: m.x + 0.3, y: m.y + 0.2, w: 5.6, h: 0.35,
      fontFace: FONT_HEAD, fontSize: 16, bold: true,
      color: m.color, margin: 0,
    });
    slide.addText(m.names, {
      x: m.x + 0.3, y: m.y + 0.6, w: 5.6, h: 0.3,
      fontFace: FONT_MONO, fontSize: 9, charSpacing: 3,
      color: m.accent ? C.accent : C.fgMuted, margin: 0,
    });
    slide.addText(m.d, {
      x: m.x + 0.3, y: m.y + 0.95, w: 5.6, h: 0.8,
      fontFace: FONT_HEAD, fontSize: 11,
      color: C.fgSecondary, margin: 0,
    });
  });

  addFooter(slide, 8, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 09 — Moat
// ---------------------------------------------------------------------------
(function moat() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'MOAT');

  slide.addText('The leaderboard is a network effect.\nThe leaders are hand-curated.', {
    x: 0.6, y: 1.2, w: 12.1, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 32, bold: true,
    color: C.fg, margin: 0,
  });

  const moats = [
    {
      h: 'Curated leader roster',
      d: 'Manually onboarded, opt-in, non-exclusive — but the roster is the product. A cloned KLUB without these 20 names is a shell.',
    },
    {
      h: 'Compliance posture',
      d: 'Non-custodial throughout, geoblocked at launch, disclosure-first. A competitor that cuts these corners moves faster now, faster to a C&D later.',
    },
    {
      h: 'Bulk integrator partnership',
      d: 'Formal relationship with the exchange, potential PFOF share, preferential data access. Replicable only by negotiation, not by forking UI.',
    },
    {
      h: 'Product taste',
      d: 'The Math, the stress-test slider, the alert tier system — all small decisions whose composite is what retail actually feels. Hard to reverse-engineer, easy to copy superficially.',
    },
  ];

  moats.forEach((m, i) => {
    const x = 0.6 + (i % 2) * 6.1;
    const y = 3.3 + Math.floor(i / 2) * 1.9;
    // accent marker
    slide.addShape('rect', {
      x, y: y + 0.08, w: 0.08, h: 0.25,
      fill: { color: C.accent }, line: { color: C.accent },
    });
    slide.addText(m.h, {
      x: x + 0.3, y, w: 5.5, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 18, bold: true,
      color: C.fg, margin: 0,
    });
    slide.addText(m.d, {
      x: x + 0.3, y: y + 0.45, w: 5.5, h: 1.3,
      fontFace: FONT_HEAD, fontSize: 12,
      color: C.fgSecondary, margin: 0,
    });
  });

  addFooter(slide, 9, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 10 — Traction & Roadmap
// ---------------------------------------------------------------------------
(function traction() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'TRACTION · ROADMAP');

  slide.addText('Built in the open.\nShipping in batches.', {
    x: 0.6, y: 1.2, w: 12.1, h: 1.6,
    fontFace: FONT_HEAD, fontSize: 32, bold: true,
    color: C.fg, margin: 0,
  });

  // Timeline
  const phases = [
    { label: 'P1 Foundations', done: true, desc: 'Monorepo, brand, API client, landing page' },
    { label: 'P2 Core math', done: true, desc: 'The Math, Portfolio Health, auth' },
    { label: 'P3 Differentiators', done: true, desc: 'Follow, Practice, Trade, Invite' },
    { label: 'P3.5 Backend', done: false, desc: 'Alerts, Copy-trade, Postgres' },
    { label: 'P4 GTM', done: false, desc: 'Deck, Leader onboarding, Content' },
    { label: 'Launch', done: false, desc: 'Testnet batches then Mainnet V1' },
  ];

  phases.forEach((p, i) => {
    const x = 0.6 + i * 2.1;
    // dot
    slide.addShape('ellipse', {
      x: x + 0.3, y: 3.5, w: 0.25, h: 0.25,
      fill: { color: p.done ? C.accent : C.surface },
      line: { color: p.done ? C.accent : C.border, width: 1.5 },
    });
    // connecting line (except last)
    if (i < phases.length - 1) {
      slide.addShape('rect', {
        x: x + 0.55, y: 3.615, w: 1.85, h: 0.02,
        fill: { color: C.border }, line: { color: C.border },
      });
    }
    slide.addText(p.label, {
      x: x - 0.1, y: 3.9, w: 2.3, h: 0.3,
      fontFace: FONT_MONO, fontSize: 9, bold: true,
      color: p.done ? C.accent : C.fgSecondary, margin: 0,
    });
    slide.addText(p.desc, {
      x: x - 0.1, y: 4.2, w: 2.3, h: 0.9,
      fontFace: FONT_HEAD, fontSize: 10,
      color: C.fgMuted, margin: 0,
    });
  });

  // Bottom: current state — moved up, fits above footer
  slide.addText('CURRENT STATE', {
    x: 0.6, y: 5.25, w: 4, h: 0.3,
    fontFace: FONT_MONO, fontSize: 9, charSpacing: 6, bold: true,
    color: C.accent, margin: 0,
  });
  slide.addText([
    { text: '· Phase 3 complete: 6 product surfaces shipped (landing, calculator, health, trade, follow, practice)\n', options: { breakLine: true } },
    { text: '· Bulk integrator program accepted\n', options: { breakLine: true } },
    { text: '· Waitlist open\n', options: { breakLine: true } },
    { text: '· Leader roster: manually onboarding toward 20 seed leaders', options: {} },
  ], {
    x: 0.6, y: 5.6, w: 12, h: 1.4,
    fontFace: FONT_HEAD, fontSize: 11,
    color: C.fgSecondary, margin: 0,
  });

  addFooter(slide, 10, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 11 — Team
// ---------------------------------------------------------------------------
(function team() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'TEAM');

  slide.addText('Built by traders\nwho got tired of watching friends blow up.', {
    x: 0.6, y: 1.2, w: 12.1, h: 1.8,
    fontFace: FONT_HEAD, fontSize: 32, bold: true,
    color: C.fg, margin: 0,
  });

  // Placeholder boxes for team cards — founder fills these in
  const roles = [
    { name: '[Founder · CEO]', bg: '[Prior trader / operator]' },
    { name: '[Co-founder · CTO]', bg: '[Prior engineer / DeFi]' },
    { name: '[Design · Product]', bg: '[Prior design lead]' },
  ];
  roles.forEach((r, i) => {
    const x = 0.6 + i * 4.2;
    slide.addShape('rect', {
      x, y: 3.5, w: 3.9, h: 2.8,
      fill: { color: C.surface },
      line: { color: C.borderSubtle, width: 0.5 },
    });
    // Placeholder avatar
    slide.addShape('rect', {
      x: x + 0.35, y: 3.8, w: 0.9, h: 0.9,
      fill: { color: C.border }, line: { color: C.border },
    });
    slide.addText(r.name, {
      x: x + 0.3, y: 4.8, w: 3.5, h: 0.45,
      fontFace: FONT_HEAD, fontSize: 16, bold: true,
      color: C.fg, margin: 0,
    });
    slide.addText(r.bg, {
      x: x + 0.3, y: 5.3, w: 3.5, h: 0.8,
      fontFace: FONT_HEAD, fontSize: 11,
      color: C.fgSecondary, margin: 0,
    });
  });

  slide.addText('+ advisors · pending leader-founder intros', {
    x: 0.6, y: 6.5, w: 12, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, charSpacing: 4,
    color: C.fgMuted, margin: 0,
  });

  addFooter(slide, 11, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
// Slide 12 — Ask / Close
// ---------------------------------------------------------------------------
(function ask() {
  const slide = pres.addSlide();
  darkBg(slide);
  addTopStrip(slide);
  smallcaps(slide, 'THE ASK');

  slide.addText('Raising [$AMOUNT]\nat [valuation] to ship V1 and onboard 20 leaders.', {
    x: 0.6, y: 1.2, w: 12.1, h: 2,
    fontFace: FONT_HEAD, fontSize: 32, bold: true,
    color: C.fg, margin: 0,
  });

  // Use of funds
  slide.addText('USE OF FUNDS', {
    x: 0.6, y: 3.5, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, charSpacing: 6, bold: true,
    color: C.accent, margin: 0,
  });
  const uses = [
    { pct: '45%', label: 'Engineering', sub: 'Phase 3.5 backend + V2 Basis vault' },
    { pct: '25%', label: 'Leader seeding', sub: 'Performance-fee guarantees for top 20' },
    { pct: '20%', label: 'Growth', sub: 'Founder-led content + waitlist drip' },
    { pct: '10%', label: 'Legal + ops', sub: 'Geoblocking, TOS, compliance counsel' },
  ];
  uses.forEach((u, i) => {
    const y = 3.95 + i * 0.6;
    slide.addText(u.pct, {
      x: 0.6, y, w: 1.2, h: 0.5,
      fontFace: FONT_MONO, fontSize: 22, bold: true,
      color: C.accent, margin: 0,
    });
    slide.addText(u.label, {
      x: 1.9, y, w: 2.5, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 14, bold: true,
      color: C.fg, margin: 0,
    });
    slide.addText(u.sub, {
      x: 1.9, y: y + 0.3, w: 5, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 11,
      color: C.fgSecondary, margin: 0,
    });
  });

  // Close CTA right side
  slide.addShape('rect', {
    x: 8, y: 3.5, w: 4.7, h: 2.8,
    fill: { color: C.surface },
    line: { color: C.accent, width: 1.5 },
  });
  slide.addText('JOIN THE KLUB', {
    x: 8.3, y: 3.9, w: 4.2, h: 0.4,
    fontFace: FONT_MONO, fontSize: 11, charSpacing: 6, bold: true,
    color: C.accent, margin: 0,
  });
  slide.addText('Next step:\n30-min walkthrough of live product, testnet invite, and leader roster brief.', {
    x: 8.3, y: 4.45, w: 4.2, h: 1.5,
    fontFace: FONT_HEAD, fontSize: 13,
    color: C.fg, margin: 0,
  });

  // Contact
  slide.addText('hello@klub.trade · klub.trade', {
    x: 0.6, y: H - 1.1, w: 8, h: 0.3,
    fontFace: FONT_MONO, fontSize: 11, charSpacing: 4, bold: true,
    color: C.accent, margin: 0,
  });

  addFooter(slide, 12, TOTAL_SLIDES);
})();

// ---------------------------------------------------------------------------
pres.writeFile({ fileName: path.join(__dirname, 'klub-investor-deck.pptx') })
  .then((f) => {
    console.log(`✓ Deck written to: ${f}`);
  })
  .catch((err) => {
    console.error('Deck build failed:', err);
    process.exit(1);
  });
