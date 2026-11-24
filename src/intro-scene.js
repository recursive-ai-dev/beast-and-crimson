/* Intro cut scene art: five layered, parallax shots painted in code over sprites from the game. */
(function () {
  "use strict";
  const BC = window.BC = window.BC || {};
  const W = 480, H = 270, PAD = 48, PADY = 16;
  const INTRO_ART = ["cottages", "villagers", "mourners", "warriors", "cavalry", "siege", "citadel", "towers"];

  const art = {};
  let artLoad = null;
  /** Load the intro-only sprites (assets/intro). Missing files just leave their props out. */
  BC.loadIntroArt = () => artLoad || (artLoad = Promise.all(INTRO_ART.map(name => new Promise(resolve => {
    const im = new Image();
    im.onload = () => { art[name] = im; resolve(); };
    im.onerror = () => resolve();
    im.src = `assets/intro/${name}.png`;
  }))));

  // ------------------------------------------------------------- helpers --
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));

  // Vertical gradient in 3px bands so the sky stays pixel-art rather than smooth.
  function sky(g, stops, y0 = -PADY, y1 = H + PADY) {
    for (let y = y0; y < y1; y += 3) {
      const k = clamp((y - y0) / (y1 - y0));
      let i = 0;
      while (i < stops.length - 2 && k > stops[i + 1][0]) i++;
      const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
      g.fillStyle = rgb(mix(c0, c1, clamp((k - p0) / (p1 - p0 || 1))));
      g.fillRect(-PAD, y, W + PAD * 2, 3);
    }
  }
  function blob(g, x, y, w, h, color) {
    for (let dy = -h; dy <= h; dy += 2) {
      const half = Math.sqrt(1 - (dy / h) ** 2) * w;
      g.fillStyle = color; g.fillRect(Math.round(x - half), Math.round(y + dy), Math.round(half * 2), 2);
    }
  }
  function clouds(g, r, count, y0, y1, color) {
    for (let i = 0; i < count; i++) {
      const x = -PAD + r() * (W + PAD * 2), y = y0 + r() * (y1 - y0), w = 30 + r() * 60, h = 5 + r() * 9;
      blob(g, x, y, w, h, color); blob(g, x + w * 0.4, y - h * 0.5, w * 0.6, h * 0.8, color);
    }
  }
  function ridge(g, r, base, amp, color, rim) {
    const p1 = r() * 6, p2 = r() * 6, f1 = 0.011 + r() * 0.01, f2 = 0.03 + r() * 0.02;
    for (let x = -PAD; x < W + PAD; x++) {
      const y = Math.round(base - amp * (0.5 + 0.3 * Math.sin(x * f1 + p1) + 0.2 * Math.sin(x * f2 + p2)));
      g.fillStyle = color; g.fillRect(x, y, 1, H + PADY - y);
      if (rim) { g.fillStyle = rim; g.fillRect(x, y, 1, 1); }
    }
  }
  function pine(g, x, base, hgt, color) {
    for (let row = 0; row < hgt; row += 2) {
      const half = Math.max(1, Math.round((row / hgt) * hgt * 0.26 * (1 + 0.35 * Math.sin(row * 0.9))));
      g.fillStyle = color; g.fillRect(Math.round(x - half), Math.round(base - hgt + row), half * 2 + 1, 2);
    }
    g.fillRect(Math.round(x), Math.round(base), 1, 3);
  }
  function treeline(g, r, base, hgt, color, gap) {
    for (let x = -PAD; x < W + PAD; x += gap * (0.6 + r() * 0.8)) pine(g, x, base, hgt * (0.6 + r() * 0.8), color);
  }
    function stars(g, r, count, y1) {
      for (let i = 0; i < count; i++) { g.fillStyle = `rgba(255,240,220,${0.25 + r() * 0.5})`; g.fillRect(-PAD + Math.floor(r() * (W + PAD * 2)), Math.floor(r() * y1), 1, 1); }
    }
    function lightningBolt(g, x0, y0, y1, seed, alpha) {
      if (alpha <= 0.02) return;
      const r = BC.makeRng(seed);
      g.save();
      g.strokeStyle = `rgba(225,235,255,${alpha})`;
      g.lineWidth = 2;
      g.beginPath();
      let x = x0, y = y0;
      g.moveTo(x, y);
      while (y < y1) {
        y += 10 + r() * 14;
        x += (r() - 0.5) * 22;
        g.lineTo(Math.round(x), Math.round(Math.min(y, y1)));
        if (r() < 0.35) {
          g.moveTo(Math.round(x), Math.round(y));
          g.lineTo(Math.round(x + (r() - 0.5) * 26), Math.round(Math.min(y + 18, y1)));
          g.moveTo(Math.round(x), Math.round(y));
        }
      }
      g.stroke();
      g.restore();
    }

  // ---------------------------------------------------------------- scene --
  /**
   * create({ makeCanvas, images }) → { draw(g, tl, dt, calm), ready }
   * `images` maps "units:Name" style keys to loaded sprite strips (defaults to BC.images);
   * `calm` freezes camera, lightning, rain and flicker for reduced motion.
   */
  function create({ makeCanvas, images = BC.images || {}, intro = art }) {
    const img = (key) => images[key] && images[key].width ? images[key] : null;
    const tints = new Map();
    // A silhouette or dimmed copy of a sprite strip, cached per colour.
    function tinted(im, color, alpha) {
      const key = color.join() + ":" + alpha;
      let perImage = tints.get(im);
      if (!perImage) tints.set(im, perImage = new Map());
      if (!perImage.has(key)) {
        const c = makeCanvas(im.width, im.height), x = c.getContext("2d");
        x.drawImage(im, 0, 0);
        x.globalCompositeOperation = "source-atop";
        x.fillStyle = rgb(color, alpha); x.fillRect(0, 0, c.width, c.height);
        perImage.set(key, c);
      }
      return perImage.get(key);
    }
    /** Draw frame `frame` of a strip, anchored at its feet (bottom centre). */
    function spr(g, im, frame, x, y, scale = 1, flip = false, cell = 32, tint) {
      if (!im) return;
      const src = tint ? tinted(im, tint[0], tint[1]) : im, w = cell * scale;
      g.save();
      g.translate(Math.round(x), Math.round(y - w));
      if (flip) { g.scale(-1, 1); g.translate(-w / 2, 0); } else g.translate(-w / 2, 0);
      g.drawImage(src, frame * cell, 0, cell, im.height, 0, 0, w, (im.height / cell) * w);
      g.restore();
    }
    function glow(g, x, y, radius, color, alpha) {
      const gr = g.createRadialGradient(x, y, 0, x, y, radius);
      gr.addColorStop(0, rgb(color, alpha)); gr.addColorStop(1, rgb(color, 0));
      g.fillStyle = gr; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const layerCanvas = (paint) => {
      const c = makeCanvas(W + PAD * 2, H + PADY * 2), g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.translate(PAD, PADY);
      paint(g);
      return c;
    };

    // Rain: a fixed pool, drawn in two depths.
    const drops = Array.from({ length: 140 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, v: 180 + Math.random() * 140, near: i % 3 === 0 }));
    function rain(g, dt, amount, calm, wind = -0.18) {
      if (amount <= 0 || calm) return;
      const count = Math.round(drops.length * amount);
      for (let i = 0; i < count; i++) {
        const d = drops[i], len = d.near ? 9 : 5;
        d.y += d.v * (d.near ? 1.4 : 1) * dt; d.x += wind * d.v * dt;
        if (d.y > H + 6 || d.x < -10) { d.y = -8; d.x = Math.random() * (W + 40); }
        g.strokeStyle = d.near ? "rgba(190,200,225,.42)" : "rgba(150,165,200,.28)";
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x + wind * len, d.y + len); g.stroke();
      }
    }
    const smoke = [];
    const embers = [];

    // ------------------------------------------------------------ shot 0 --
    // Harvest dusk: a village on the river, collectors arriving down the road.
    function harvest() {
      const r = BC.makeRng(11);
      const far = layerCanvas(g => {
        sky(g, [[0, [26, 14, 48]], [0.45, [118, 38, 58]], [0.72, [226, 128, 62]], [1, [246, 190, 100]]]);
        stars(g, r, 40, 80); clouds(g, r, 7, 20, 100, "rgba(110,40,70,.55)");
        ridge(g, r, 168, 70, "#3a1a38", "#6a2a48");
      });
      const mid = layerCanvas(g => { ridge(g, r, 182, 46, "#241028", "#43203a"); treeline(g, r, 182, 40, "#170a1c", 9); });
      const near = layerCanvas(g => {
        ridge(g, r, 196, 14, "#1c1018", "#2d1a24");
        g.fillStyle = "#120a10"; g.fillRect(-PAD, 214, W + PAD * 2, H);
        g.fillStyle = "#3a2a22"; g.fillRect(-PAD, 226, W + PAD * 2, 12);            // the road
        g.fillStyle = "#4a382c"; for (let x = -PAD; x < W + PAD; x += 11) g.fillRect(x, 230 + (x % 3), 4, 1);
      });
      return {
        cam: [[22, 0, 1], [-14, -2, 1.07]], tint: [255, 140, 70, 0.07], rain: 0, fadeIn: 0.7,
        layers: [[0.08, far], [0.22, mid], [0.45, near]],
        dynamic(g, st) {
          const { t, local, calm, P } = st;
          // setting sun glow + distant birds
          let [ox, oy] = P(0.08); g.save(); g.translate(ox, oy);
          g.globalCompositeOperation = "lighter";
          glow(g, 110, 146, 110, [255, 160, 80], 0.25);
          g.globalCompositeOperation = "source-over";
          if (!calm) {
            g.fillStyle = "rgba(38,14,32,.65)";
            for (let b = 0; b < 5; b++) {
              const bx = ((180 + b * 24 + t * (9 + b)) % (W + 40)) - 20;
              const by = 48 + b * 7 + Math.sin(t * 4 + b * 1.7) * 2;
              const wing = Math.sin(t * 10 + b * 2) > 0 ? -1 : 1;
              g.fillRect(Math.round(bx), Math.round(by), 2, 1);
              g.fillRect(Math.round(bx - 2), Math.round(by + wing), 2, 1);
              g.fillRect(Math.round(bx + 2), Math.round(by + wing), 2, 1);
            }
          }
          g.restore();

          // cottages with lit windows, campfires, lanterns, and chimney smoke
          const homes = [[96, 206, 1.7, 0], [214, 200, 1.4, 1], [330, 208, 1.9, 2], [420, 202, 1.5, 3]];
          [ox, oy] = P(0.6); g.save(); g.translate(ox, oy);
          for (const [x, y, s, k] of homes) {
            spr(g, intro.cottages, k, x, y, s, false, 32, [[40, 20, 50], 0.28]);
            const flick = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + x);
            glow(g, x - 4 * s, y - 11 * s, 18 * s, [255, 170, 70], 0.32 * flick);
            if (!calm && Math.random() < 0.05) smoke.push({ x: x + 6 * s, y: y - 27 * s, l: 0 });
          }
          const fireFrame = calm ? 0 : Math.floor(t * 7) % 4;
          spr(g, img("props:campfire"), fireFrame, 162, 214, 1.1);
          spr(g, img("props:lantern"), fireFrame, 286, 212, 1.0);
          g.restore();
          for (let i = smoke.length - 1; i >= 0; i--) {
            const s = smoke[i]; s.l += st.dt; s.y -= 9 * st.dt; s.x += 5 * st.dt;
            if (s.l > 5) { smoke.splice(i, 1); continue; }
            g.fillStyle = `rgba(90,60,80,${0.28 * (1 - s.l / 5)})`; g.fillRect(Math.round(s.x + ox), Math.round(s.y + oy), 3 + s.l, 3 + s.l);
          }
          // villagers at their doors, then mounted outriders + collectors on the road
          [ox, oy] = P(0.85); g.save(); g.translate(ox, oy);
          const folk = [[140, 230, 0], [256, 232, 1], [374, 233, 2], [60, 233, 4]];
          for (const [x, y, k] of folk) spr(g, intro.villagers, k, x, y + (calm ? 0 : Math.sin(t * 2 + x) * 0.4), 1.5, false, 32, [[30, 12, 40], 0.45]);
          const march = ease(clamp((local - 0.28) / 0.72));
          const cavStep = calm ? 0 : Math.floor(t * 8) % 4;
          const cavX = lerp(W + 44, 250, march);
          spr(g, intro.cavalry, cavStep, cavX, 240, 1.45, false, 48, [[14, 6, 24], 0.5]);
          for (let i = 0; i < 4; i++) {
            const x = lerp(W + 90 + i * 34, 306 + i * 34, march), step = Math.floor(t * 6) % 4;
            spr(g, img("enemies:collector"), calm ? 0 : step, x, 238 + (i % 2) * 3, 1.7, false, 32, [[10, 4, 20], 0.55]);
            if (!calm && march > 0.05 && march < 0.98 && Math.random() < 0.25) {
              embers.push({ x: x + 6, y: 236, vx: 8 + Math.random() * 12, vy: -4 - Math.random() * 8, l: 0, c: [110, 82, 62] });
            }
          }
          for (let i = embers.length - 1; i >= 0; i--) {
            const e = embers[i]; e.l += st.dt; e.x += e.vx * st.dt; e.y += e.vy * st.dt;
            if (e.l > 1.1) { embers.splice(i, 1); continue; }
            g.fillStyle = rgb(e.c, 0.35 * (1 - e.l / 1.1));
            g.fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
          }
          g.restore();
          // the wheat in front, swaying
          [ox, oy] = P(1.25); g.save(); g.translate(ox, oy);
          g.fillStyle = "#8a5a22";
          for (let x = -PAD; x < W + PAD; x += 5) {
            const sway = calm ? 0 : Math.sin(t * 1.6 + x * 0.07) * 1.5, h = 14 + ((x * 7) % 9);
            g.fillRect(x + sway, H - h, 1, h); g.fillStyle = (x % 15) ? "#a86a2a" : "#d89a40"; g.fillRect(x + sway - 1, H - h - 2, 3, 3); g.fillStyle = "#8a5a22";
          }
          g.restore();
        },
      };
    }

    // ------------------------------------------------------------ shot 1 --
    const waterTop = 168;
    function riverBase(g, top, deep, shallow) {
      for (let y = top; y < H + PADY; y += 2) { g.fillStyle = rgb(mix(shallow, deep, clamp((y - top) / (H - top)))); g.fillRect(-PAD, y, W + PAD * 2, 2); }
    }
    // The bank: collectors with torches on the right, one lone figure going under at left.
    function drowning() {
      const r = BC.makeRng(23);
      const far = layerCanvas(g => {
        sky(g, [[0, [8, 10, 20]], [0.5, [24, 30, 48]], [1, [52, 56, 76]]]);
        clouds(g, r, 9, 10, 110, "rgba(20,24,40,.9)"); clouds(g, r, 5, 40, 120, "rgba(52,56,82,.5)");
        ridge(g, r, 150, 40, "#0e121c", "#1c2234"); treeline(g, r, 150, 36, "#080a12", 8);
      });
      const water = layerCanvas(g => riverBase(g, waterTop, [6, 8, 16], [26, 32, 50]));
      const bank = layerCanvas(g => {
        g.fillStyle = "#0a0a10"; g.beginPath(); g.moveTo(250, H + PADY); g.lineTo(272, 190); g.lineTo(300, 176); g.lineTo(W + PAD, 172); g.lineTo(W + PAD, H + PADY); g.fill();
        for (let x = 270; x < W + PAD; x += 6) { g.fillStyle = "#12121c"; g.fillRect(x, 174 + ((x * 3) % 4), 2, 3); }
      });
      const ring = [];
      return {
        cam: [[34, 0, 1.0], [-26, 0, 1.06]], tint: [40, 50, 100, 0.12], rain: 1, fadeIn: 0.45, fadeOut: 0,
        layers: [[0.1, far], [0.5, water], [0.9, bank]],
        dynamic(g, st) {
          const { t, local, calm, P } = st;
          let [ox, oy] = P(0.5); g.save(); g.translate(ox, oy);
          // current, drawn as stretched highlights
          for (let y = waterTop + 4; y < H; y += 4) {
            g.fillStyle = `rgba(120,140,190,${0.05 + (y - waterTop) / 900})`;
            for (let x = ((calm ? 0 : t * 14) + y * 9) % 30 - 30; x < W + PAD; x += 30) g.fillRect(x, y, 8 + (y % 5), 1);
          }
          g.restore();
          [ox, oy] = P(0.9); g.save(); g.translate(ox, oy);
          // torchlight on the water
          const torches = [[300, 150], [340, 146], [380, 150], [420, 146]];
          for (const [x, y] of torches) {
            const f = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 11 + x) * Math.sin(t * 5.3 + x * 0.3);
            g.globalCompositeOperation = "lighter";
            glow(g, x, y, 46, [255, 130, 40], 0.34 * f);
            g.fillStyle = `rgba(255,150,60,${0.2 * f})`;
            for (let k = 0; k < 14; k++) g.fillRect(x - 3 + Math.sin(t * 3 + k + x) * 2, waterTop + 6 + k * 6, 5 - k * 0.25, 2);
            g.globalCompositeOperation = "source-over";
          }
          // the line of collectors on the bank, torch held high
          for (let i = 0; i < 4; i++) {
            const x = torches[i][0] - 2, y = 186 + (i % 2) * 4;
            spr(g, img("enemies:collector"), 0, x, y, 2, true, 32, [[4, 4, 10], 0.93]);
            g.fillStyle = "#1a1010"; g.fillRect(x - 12, y - 30, 2, 22);
            g.fillStyle = "#ffb050"; g.fillRect(x - 12, y - 33, 2, 3); g.fillStyle = "#ff6020"; g.fillRect(x - 13, y - 32, 4, 2);
          }
          // someone in the water, sinking, with rings spreading from the spot
          const fx = 120, sink = ease(clamp(local * 1.1));
          if (!calm && Math.random() < 0.06) ring.push({ x: fx + Math.random() * 6 - 3, y: waterTop + 40, l: 0 });
          for (let i = ring.length - 1; i >= 0; i--) {
            const k = ring[i]; k.l += st.dt;
            if (k.l > 2.2) { ring.splice(i, 1); continue; }
            g.strokeStyle = `rgba(150,170,210,${0.5 * (1 - k.l / 2.2)})`;
            g.beginPath(); g.ellipse(k.x, k.y, 4 + k.l * 16, 1.5 + k.l * 4, 0, 0, 6.3); g.stroke();
          }
          g.save(); g.beginPath(); g.rect(0, 0, W, waterTop + 40 + 4); g.clip();     // the water takes them from the feet up
          spr(g, intro.villagers, 3, fx, waterTop + 38 + sink * 40, 1.7, false, 32, [[0, 0, 6], 0.9]);
          g.restore();
          g.restore();
        },
      };
    }

    // ------------------------------------------------------------ shot 2 --
    function silence() {
      const r = BC.makeRng(37);
      const far = layerCanvas(g => {
        sky(g, [[0, [6, 8, 18]], [0.55, [18, 24, 42]], [1, [40, 46, 66]]]);
        clouds(g, r, 12, 6, 120, "rgba(14,18,32,.9)");
        ridge(g, r, 156, 36, "#0a0e18", "#161c2c"); treeline(g, r, 156, 40, "#06080e", 8);
      });
      const water = layerCanvas(g => riverBase(g, waterTop, [4, 6, 12], [22, 28, 44]));
      const bank = layerCanvas(g => {
        g.fillStyle = "#0e101a"; g.beginPath(); g.moveTo(-PAD, 212); g.lineTo(90, 206); g.lineTo(170, 226); g.lineTo(215, H + PADY); g.lineTo(-PAD, H + PADY); g.fill();
        g.fillStyle = "#1c2030"; g.beginPath(); g.moveTo(-PAD, 212); g.lineTo(90, 206); g.lineTo(170, 226); g.lineTo(172, 228); g.lineTo(90, 209); g.lineTo(-PAD, 215); g.fill();
        for (let x = -PAD; x < 160; x += 5) { g.fillStyle = "#141826"; g.fillRect(x, 198 + ((x * 5) % 6), 1, 8 + ((x * 3) % 5)); }
      });
      const rings = [];
      return {
        cam: [[0, 4, 1.12], [6, 0, 1.0]], tint: [30, 40, 90, 0.14], rain: 0.8, fadeIn: 0, fadeOut: 0.5, bolt: true, shake: 3.5,
        layers: [[0.1, far], [0.5, water], [1.1, bank]],
        dynamic(g, st) {
          const { t, local, calm, P, since } = st;
          let [ox, oy] = P(0.1); g.save(); g.translate(ox, oy);
          if (!calm && since < 0.85) {
            const bAlpha = Math.max(Math.exp(-since * 6), 0.65 * Math.exp(-Math.max(0, since - 0.35) * 8) * (since > 0.35 ? 1 : 0));
            lightningBolt(g, 330, 0, 148, 71, bAlpha * 0.9);
          }
          g.restore();
          [ox, oy] = P(0.5); g.save(); g.translate(ox, oy);
          for (let y = waterTop + 4; y < H; y += 4) {
            g.fillStyle = `rgba(110,130,180,${0.04 + (y - waterTop) / 1000})`;
            for (let x = ((calm ? 0 : t * 10) + y * 7) % 34 - 34; x < W + PAD; x += 34) g.fillRect(x, y, 10, 1);
          }
          if (!calm && Math.random() < 0.18) rings.push({ x: 40 + Math.random() * 400, y: waterTop + 12 + Math.random() * 80, l: 0 });
          for (let i = rings.length - 1; i >= 0; i--) {
            const k = rings[i]; k.l += st.dt;
            if (k.l > 1.4) { rings.splice(i, 1); continue; }
            g.strokeStyle = `rgba(150,170,210,${0.3 * (1 - k.l / 1.4)})`; g.beginPath(); g.ellipse(k.x, k.y, 2 + k.l * 9, 1 + k.l * 2, 0, 0, 6.3); g.stroke();
          }
          // a lantern, set on the river and left to go
          const lx = lerp(150, 400, ease(local)), ly = waterTop + 54 + Math.sin(local * 5) * 2;
          g.globalCompositeOperation = "lighter";
          glow(g, lx, ly - 8, 36, [255, 150, 60], 0.55);
          g.fillStyle = "rgba(255,160,60,.24)"; for (let k = 0; k < 8; k++) g.fillRect(lx - 2 + Math.sin(t * 2 + k) * 1.5, ly + k * 3, 4 - k * 0.4, 2);
          g.globalCompositeOperation = "source-over";
          g.fillStyle = "#3a1c10"; g.fillRect(Math.round(lx) - 4, Math.round(ly) - 1, 8, 3);     // the paper lantern's frame
          g.fillStyle = "#ffb55a"; g.fillRect(Math.round(lx) - 3, Math.round(ly) - 6, 6, 5);
          g.fillStyle = "#fff0b8"; g.fillRect(Math.round(lx) - 1, Math.round(ly) - 5, 2, 3);
          g.restore();
          // the survivor, seen from behind, at the water's edge + oath embers rising
          [ox, oy] = P(1.1); g.save(); g.translate(ox, oy);
          spr(g, intro.mourners, 0, 112, 246, 3, false, 32, [[10, 14, 36], 0.55]);
          if (!calm && local > 0.35 && Math.random() < 0.35) {
            embers.push({ x: 80 + Math.random() * 80, y: 260, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 20, l: 0, c: [255, 90, 40] });
          }
          for (let i = embers.length - 1; i >= 0; i--) {
            const e = embers[i]; e.l += st.dt; e.x += e.vx * st.dt; e.y += e.vy * st.dt;
            if (e.l > 2.2) { embers.splice(i, 1); continue; }
            g.fillStyle = rgb(mix(e.c, [255, 220, 140], 0.4), 0.8 * (1 - e.l / 2.2));
            g.fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
          }
          g.restore();
        },
      };
    }

    // ------------------------------------------------------------ shot 3 --
    const TRIBES = [
      { id: "offense", color: [255, 69, 0], units: ["Beast Berserker", "Bloodthirsty Warlord", "Fire Spiritmaster"] },
      { id: "defense", color: [70, 130, 180], units: ["Warden of the Wild", "Guardian of the Grove", "Totem Shieldbearer"] },
      { id: "greed", color: [255, 215, 0], units: ["Golden Archer", "Golden Totemist", "Trade Pact Alpha"] },
    ];
    const unitKey = (name) => "units:" + name;
    function gather() {
      const r = BC.makeRng(41);
      const far = layerCanvas(g => {
        sky(g, [[0, [30, 12, 30]], [0.4, [120, 36, 48]], [0.75, [232, 120, 70]], [1, [250, 190, 120]]]);
        clouds(g, r, 8, 30, 110, "rgba(130,40,60,.5)");
        ridge(g, r, 150, 60, "#3a1630", "#7a2c3e");
      });
      const mid = layerCanvas(g => { ridge(g, r, 170, 40, "#26102a", "#4a2038"); treeline(g, r, 170, 38, "#160a1a", 10); });
      const near = layerCanvas(g => {
        ridge(g, r, 206, 20, "#150a12", "#2a1620");
        g.fillStyle = "#0e0710"; g.fillRect(-PAD, 224, W + PAD * 2, H);
        for (let x = -PAD; x < W + PAD; x += 4) { g.fillStyle = "#1c1018"; g.fillRect(x, 222 + ((x * 3) % 3), 2, 4); }
      });
      return {
        cam: [[-22, 8, 1.0], [14, -4, 1.06]], tint: [255, 120, 60, 0.06], rain: 0.12, fadeIn: 0.6,
        layers: [[0.08, far], [0.25, mid], [0.55, near]],
        dynamic(g, st) {
          const { t, local, calm, P, since } = st;
          // the sun comes up behind the ridge
          let [ox, oy] = P(0.08); g.save(); g.translate(ox, oy);
          g.globalCompositeOperation = "lighter";
          glow(g, 330, 150 - local * 14, 130, [255, 150, 70], 0.38 + local * 0.2);
          g.globalCompositeOperation = "source-over"; g.restore();
          [ox, oy] = P(0.9); g.save(); g.translate(ox, oy);
          // the common folk + armed rebel warriors on the slope behind the tribes
          for (let i = 0; i < 14; i++) {
            const ready = ease(clamp(since * 0.45 - i * 0.05));
            const useRebel = intro.warriors && i % 3 === 0;
            const src = useRebel ? intro.warriors : intro.villagers;
            const frame = useRebel ? (i % 4) : (i % 6);
            spr(g, src, frame, 30 + i * 32 + (i % 3) * 7, 216 + (i % 2) * 6, 1.25, false, 32, [[24, 8, 30], 0.5 - ready * 0.1]);
          }
          spr(g, img("props:campfire"), calm ? 0 : Math.floor(t * 7) % 4, 238, 224, 1.0);
          // each tribe marches in: a banner-bearing cube column with its aura underfoot
          TRIBES.forEach((tribe, ti) => {
            tribe.units.forEach((name, ui) => {
              const k = ti * 3 + ui, arrive = ease(clamp(since * 0.42 - k * 0.07));
              if (arrive <= 0) return;
              const homeX = 92 + ti * 148 + (ui - 1) * 52, x = lerp(homeX - 120, homeX, arrive), y = 244 + (ui % 2) * 5;
              const sc = 1.8, frame = calm ? 0 : Math.floor(t * 5 + k) % 4;
              g.globalCompositeOperation = "lighter";
              glow(g, x, y - 4, 34, tribe.color, 0.32 * arrive);
              g.globalCompositeOperation = "source-over";
              g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x - 20, y - 1, 40, 3);
              g.globalAlpha = arrive; spr(g, img(unitKey(name)), frame, x, y, sc); g.globalAlpha = 1;
            });
            // a brazier + banner planted at the head of each column
            const tx = 34 + ti * 148, flame = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + ti * 2);
            const bUp = ease(clamp(since * 0.5 - ti * 0.3));
            spr(g, img("props:brazier"), calm ? 0 : Math.floor(t * 8 + ti) % 4, tx, 236, 1.05);
            g.fillStyle = "#2a1810"; g.fillRect(tx - 10, 198, 2, 36);
            g.fillStyle = rgb(tribe.color, 0.9 * bUp);
            const wave = calm ? 0 : Math.round(Math.sin(t * 6 + ti) * 2);
            g.fillRect(tx - 8, 199, 12, 6); g.fillRect(tx + 4, 200 + wave, 5, 4);
            g.globalCompositeOperation = "lighter"; glow(g, tx, 206, 36, tribe.color, 0.48 * flame * bUp); g.globalCompositeOperation = "source-over";
            if (!calm && Math.random() < 0.25) embers.push({ x: tx, y: 204, vx: (Math.random() - 0.5) * 16, vy: -22 - Math.random() * 20, l: 0, c: tribe.color });
          });
          g.restore();
          for (let i = embers.length - 1; i >= 0; i--) {
            const e = embers[i]; e.l += st.dt; e.x += e.vx * st.dt; e.y += e.vy * st.dt;
            if (e.l > 2) { embers.splice(i, 1); continue; }
            g.fillStyle = rgb(mix(e.c, [255, 240, 190], 0.5), 1 - e.l / 2); g.fillRect(Math.round(e.x + ox), Math.round(e.y + oy), 1, 1);
          }
        },
      };
    }

    // ------------------------------------------------------------ shot 4 --
    function crown() {
      const r = BC.makeRng(53);
      const far = layerCanvas(g => {
        sky(g, [[0, [16, 4, 10]], [0.5, [92, 14, 24]], [0.85, [190, 52, 32]], [1, [236, 110, 50]]]);
        clouds(g, r, 9, 20, 120, "rgba(40,6,14,.6)");
      });
      const keepLayer = layerCanvas(g => {
        ridge(g, r, 176, 56, "#1a060c", "#3a1018");
        const ink = "#07020a";
        g.fillStyle = ink;
        // Curtain wall + ridge base
        g.fillRect(68, 152, 344, 58);
        for (let x = 68; x < 412; x += 8) g.fillRect(x, 147, 4, 5);
        g.fillStyle = "#07020a"; g.fillRect(-PAD, 206, W + PAD * 2, H);
      });
      const near = layerCanvas(g => {
        ridge(g, r, 226, 18, "#0c0408", "#1e0a10");
        g.fillStyle = "#08030a"; g.fillRect(-PAD, 238, W + PAD * 2, H);
      });
      return {
        cam: [[0, 2, 1.0], [0, -5, 1.1]], tint: [255, 30, 20, 0.08], rain: 0, fadeIn: 0.9, fadeOut: 0.35, iris: [240, 100],
        layers: [[0.06, far], [0.16, keepLayer], [0.5, near]],
        dynamic(g, st) {
          const { t, local, calm, P, since } = st;
          let [ox, oy] = P(0.16); g.save(); g.translate(ox, oy);
          // the crown's glow, bespoke war citadel + towers + siege engines, and the king on the parapet
          g.globalCompositeOperation = "lighter";
          glow(g, W / 2, 96, 170, [210, 40, 24], 0.32 + (calm ? 0 : 0.08 * Math.sin(t * 1.5)));
          g.globalCompositeOperation = "source-over";
          // Flanking towers & siege machines
          spr(g, intro.towers, 0, 104, 208, 1.7, false, 64, [[16, 2, 10], 0.45]);
          spr(g, intro.towers, 1, 376, 208, 1.7, true, 64, [[16, 2, 10], 0.45]);
          const siegeFrame = calm ? 0 : Math.floor(t * 4) % 4;
          spr(g, intro.siege, siegeFrame, 148, 162, 0.85, false, 48, [[14, 2, 8], 0.55]);
          spr(g, intro.siege, (siegeFrame + 2) % 4, 332, 162, 0.85, true, 48, [[14, 2, 8], 0.55]);
          // Central bespoke Citadel
          if (intro.citadel) {
            spr(g, intro.citadel, 0, W / 2, 212, 1.65, false, 96, [[18, 2, 12], 0.35]);
          }
          // Braziers on the gatehouse
          const bf = calm ? 0 : Math.floor(t * 8) % 4;
          spr(g, img("props:brazier"), bf, W / 2 - 46, 208, 0.9);
          spr(g, img("props:brazier"), (bf + 2) % 4, W / 2 + 46, 208, 0.9);
          // The Collector King on the high parapet
          spr(g, img("enemies:king"), 0, W / 2, 66, 1.6, true, 32, [[4, 0, 6], 0.88]);
          const eyes = ease(clamp((local - 0.3) * 2.5));
          g.fillStyle = `rgba(255,60,40,${eyes})`; g.fillRect(W / 2 - 2, 38, 2, 1); g.fillRect(W / 2 + 1, 38, 2, 1);
          g.restore();
          // the tribes + rebel warriors stand together beneath it
          [ox, oy] = P(0.9); g.save(); g.translate(ox, oy);
          TRIBES.forEach((tribe, ti) => tribe.units.forEach((name, ui) => {
            const k = ti * 3 + ui, x = 56 + k * 46, y = 258 + (k % 2) * 4, up = ease(clamp(since * 0.8 + 0.5));
            g.globalCompositeOperation = "lighter"; glow(g, x, y - 6, 24, tribe.color, 0.24 * up); g.globalCompositeOperation = "source-over";
            spr(g, img(unitKey(name)), calm ? 0 : Math.floor(t * 5 + k) % 4, x, y, 1.5, false, 32, [[8, 2, 12], 0.35]);
          }));
          g.restore();
        },
      };
    }

    // ------------------------------------------------------------ shot 5 --
    // Title card: embers rising from a black ridge with the three tribe totems.
    function tribesCard() {
      const r = BC.makeRng(67);
      const far = layerCanvas(g => {
        sky(g, [[0, [6, 2, 8]], [0.6, [40, 8, 18]], [1, [110, 24, 24]]]);
        stars(g, r, 50, 120); clouds(g, r, 6, 40, 150, "rgba(60,10,20,.5)");
        ridge(g, r, 214, 50, "#12060c", "#2a1018");
      });
      const near = layerCanvas(g => { ridge(g, r, 244, 22, "#07020a", "#160a10"); g.fillStyle = "#07020a"; g.fillRect(-PAD, 252, W + PAD * 2, H); });
      return {
        cam: [[0, 0, 1.0], [0, -3, 1.04]], tint: [255, 40, 20, 0.05], rain: 0, fadeIn: 0.6, fadeOut: 0.5,
        layers: [[0.05, far], [0.3, near]],
        dynamic(g, st) {
          const { t, calm, P, since } = st;
          const [ox, oy] = P(0.3);
          const up = ease(clamp(since * 1.1));
          g.globalCompositeOperation = "lighter";
          TRIBES.forEach((tribe, ti) => glow(g, 240 + (ti - 1) * 140, 130, 95, tribe.color, (0.18 + (calm ? 0 : 0.04 * Math.sin(t * 1.6 + ti * 2))) * up));
          g.globalCompositeOperation = "source-over";
          TRIBES.forEach((tribe, ti) => {
            const tx = 240 + (ti - 1) * 140, ty = 250;
            const frame = calm ? 0 : Math.floor(t * 4 + ti) % 4;
            g.globalAlpha = 0.65 * up;
            spr(g, img("bases:" + tribe.id), frame, tx, ty, 1.6, false, 32, [[10, 4, 14], 0.35]);
            g.globalAlpha = 1;
          });
          if (!calm && Math.random() < 0.55) { const tribe = TRIBES[Math.floor(Math.random() * 3)]; embers.push({ x: Math.random() * W - ox, y: H - oy + 4, vx: (Math.random() - 0.5) * 12, vy: -16 - Math.random() * 26, l: 0, c: tribe.color }); }
          for (let i = embers.length - 1; i >= 0; i--) {
            const e = embers[i]; e.l += st.dt; e.x += e.vx * st.dt; e.y += e.vy * st.dt;
            if (e.l > 4) { embers.splice(i, 1); continue; }
            g.fillStyle = rgb(mix(e.c, [255, 240, 190], 0.5), 0.9 * (1 - e.l / 4)); g.fillRect(Math.round(e.x + ox), Math.round(e.y + oy), 2, 2);
          }
        },
      };
    }

    const shots = [harvest(), drowning(), silence(), gather(), crown(), tribesCard()];
    let last = -1, drift = 0;
    return {
      shots,
      /** Draw the current shot. `tl` is the intro timeline; the beat index is the shot index. */
      draw(g, tl, dt, calm = false) {
        const index = clamp(tl.beat()?.shot ?? tl.index, 0, shots.length - 1), shot = shots[index];
        if (index !== last) { last = index; smoke.length = embers.length = 0; }
        const local = tl.local(), t = tl.time, since = tl.since(tl.index);
        const cam = calm ? [0, 0, 1] : shot.cam[0].map((v, i) => lerp(v, shot.cam[1][i], ease(local)));
        const shakeAmp = (!calm && shot.shake && since < 0.8) ? shot.shake * Math.exp(-since * 5) : 0;
        const sx = shakeAmp ? Math.round(Math.sin(t * 53) * shakeAmp) : 0;
        const sy = shakeAmp ? Math.round(Math.cos(t * 47) * shakeAmp * 0.6) : 0;
        g.save();
        g.imageSmoothingEnabled = false;
        g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
        g.translate(W / 2 + sx, H / 2 + sy); g.scale(cam[2], cam[2]); g.translate(-W / 2, -H / 2);
        const P = (depth) => [Math.round(-cam[0] * depth), Math.round(-cam[1] * depth)];
        for (const [depth, canvas] of shot.layers) { const [ox, oy] = P(depth); g.drawImage(canvas, ox - PAD, oy - PADY); }
        shot.dynamic(g, { t, local, since, dt, calm, P });
        rain(g, dt, shot.rain, calm);
        g.restore();
        // grade, vignette, lightning, and the dip to black between shots
        g.fillStyle = rgb(shot.tint.slice(0, 3), shot.tint[3]); g.fillRect(0, 0, W, H);
        const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
        vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.6)");
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
        // subtle cinematic letterbox bars
        g.fillStyle = "#050307"; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8);
        g.fillStyle = "rgba(180,120,70,.16)"; g.fillRect(0, 8, W, 1); g.fillRect(0, H - 9, W, 1);
        if (shot.bolt && !calm) {
          // Two flashes under 3 Hz, each decaying quickly: dramatic without strobing.
          const flash = Math.max(Math.exp(-since * 7), 0.55 * Math.exp(-Math.max(0, since - 0.4) * 9) * (since > 0.4 ? 1 : 0));
          if (flash > 0.02) { g.fillStyle = `rgba(215,225,255,${0.65 * flash})`; g.fillRect(0, 0, W, H); }
        }
        if (shot.iris && since < shot.fadeIn) {
          // Opens like an eye from a point: the keep first, then the whole realm.
          const radius = ease(since / shot.fadeIn) * Math.hypot(W, H);
          g.fillStyle = "#000"; g.beginPath(); g.rect(0, 0, W, H); g.moveTo(shot.iris[0] + radius, shot.iris[1]); g.arc(shot.iris[0], shot.iris[1], radius, 0, 6.2832, true); g.fill("evenodd");
        }
        const fade = Math.min(shot.fadeIn && !shot.iris ? clamp(since / shot.fadeIn) : 1, (shot.fadeOut ?? 0.35) ? clamp((tl.beat().dur - since) / (shot.fadeOut ?? 0.35)) : 1);
        if (fade < 1) { g.fillStyle = `rgba(0,0,0,${1 - fade})`; g.fillRect(0, 0, W, H); }
      },
    };
  }

  BC.IntroScene = { create, W, H, SHOTS: 6 };
})();
