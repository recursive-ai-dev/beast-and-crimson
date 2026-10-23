/* Intro cut scene art: five layered, parallax shots painted in code over sprites from the game. */
(function () {
  "use strict";
  const BC = window.BC = window.BC || {};
  const W = 480, H = 270, PAD = 48, PADY = 16;
  const INTRO_ART = ["cottages", "villagers", "mourners"];

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
  const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

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
      const r = rng(11);
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
          // cottages with lit windows and chimney smoke
          const homes = [[96, 206, 1.7, 0], [214, 200, 1.4, 1], [330, 208, 1.9, 2], [420, 202, 1.5, 3]];
          let [ox, oy] = P(0.6); g.save(); g.translate(ox, oy);
          for (const [x, y, s, k] of homes) {
            spr(g, intro.cottages, k, x, y, s, false, 32, [[40, 20, 50], 0.28]);
            const flick = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + x);
            glow(g, x - 4 * s, y - 11 * s, 18 * s, [255, 170, 70], 0.32 * flick);
            if (!calm && Math.random() < 0.05) smoke.push({ x: x + 6 * s, y: y - 27 * s, l: 0 });
          }
          g.restore();
          for (let i = smoke.length - 1; i >= 0; i--) {
            const s = smoke[i]; s.l += st.dt; s.y -= 9 * st.dt; s.x += 5 * st.dt;
            if (s.l > 5) { smoke.splice(i, 1); continue; }
            g.fillStyle = `rgba(90,60,80,${0.28 * (1 - s.l / 5)})`; g.fillRect(Math.round(s.x + ox), Math.round(s.y + oy), 3 + s.l, 3 + s.l);
          }
          // villagers at their doors, then the collectors on the road
          [ox, oy] = P(0.85); g.save(); g.translate(ox, oy);
          const folk = [[140, 230, 0], [256, 232, 1], [374, 233, 2], [60, 233, 4]];
          for (const [x, y, k] of folk) spr(g, intro.villagers, k, x, y + (calm ? 0 : Math.sin(t * 2 + x) * 0.4), 1.5, false, 32, [[30, 12, 40], 0.45]);
          const march = ease(clamp((local - 0.35) / 0.65));
          for (let i = 0; i < 4; i++) {
            const x = lerp(W + 60 + i * 34, 300 + i * 34, march), step = Math.floor(t * 6) % 4;
            spr(g, img("enemies:collector"), calm ? 0 : step, x, 238 + (i % 2) * 3, 1.7, false, 32, [[10, 4, 20], 0.55]);
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
      const r = rng(23);
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
      const r = rng(37);
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
        cam: [[0, 4, 1.12], [6, 0, 1.0]], tint: [30, 40, 90, 0.14], rain: 0.8, fadeIn: 0, fadeOut: 0.5, bolt: true,
        layers: [[0.1, far], [0.5, water], [1.1, bank]],
        dynamic(g, st) {
          const { t, local, calm, P } = st;
          let [ox, oy] = P(0.5); g.save(); g.translate(ox, oy);
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
          glow(g, lx, ly - 8, 34, [255, 150, 60], 0.5);
          g.fillStyle = "rgba(255,160,60,.22)"; for (let k = 0; k < 8; k++) g.fillRect(lx - 2 + Math.sin(t * 2 + k) * 1.5, ly + k * 3, 4 - k * 0.4, 2);
          g.globalCompositeOperation = "source-over";
          g.fillStyle = "#3a1c10"; g.fillRect(Math.round(lx) - 4, Math.round(ly) - 1, 8, 3);     // the paper lantern's frame
          g.fillStyle = "#ffb55a"; g.fillRect(Math.round(lx) - 3, Math.round(ly) - 6, 6, 5);
          g.fillStyle = "#fff0b8"; g.fillRect(Math.round(lx) - 1, Math.round(ly) - 5, 2, 3);
          g.restore();
          // the survivor, seen from behind, at the water's edge
          [ox, oy] = P(1.1); g.save(); g.translate(ox, oy);
          spr(g, intro.mourners, 0, 112, 246, 3, false, 32, [[10, 14, 36], 0.55]);
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
      const r = rng(41);
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
          // the common folk, a crowd on the slope behind the tribes
          for (let i = 0; i < 14; i++) {
            const ready = ease(clamp(since * 0.45 - i * 0.05));
            spr(g, intro.villagers, i % 6, 30 + i * 32 + (i % 3) * 7, 216 + (i % 2) * 6, 1.25, false, 32, [[24, 8, 30], 0.5 - ready * 0.1]);
          }
          // each tribe marches in: a banner-bearing cube column with its aura underfoot
          TRIBES.forEach((tribe, ti) => {
            tribe.units.forEach((name, ui) => {
              const k = ti * 3 + ui, arrive = ease(clamp(since * 0.42 - k * 0.07));
              if (arrive <= 0) return;
              const homeX = 92 + ti * 148 + (ui - 1) * 52, x = lerp(homeX - 120, homeX, arrive), y = 244 + (ui % 2) * 5;
              const sc = 1.8, frame = calm ? 0 : Math.floor(t * 5 + k) % 4;
              g.globalCompositeOperation = "lighter";
              glow(g, x, y - 4, 34, tribe.color, 0.3 * arrive);
              g.globalCompositeOperation = "source-over";
              g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x - 20, y - 1, 40, 3);
              g.globalAlpha = arrive; spr(g, img(unitKey(name)), frame, x, y, sc); g.globalAlpha = 1;
            });
            // a torch planted at the head of each column
            const tx = 34 + ti * 148, flame = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + ti * 2);
            g.fillStyle = "#2a1810"; g.fillRect(tx, 206, 2, 28);
            g.globalCompositeOperation = "lighter"; glow(g, tx + 1, 202, 34, tribe.color, 0.5 * flame * ease(clamp(since * 0.5 - ti * 0.3))); g.globalCompositeOperation = "source-over";
            g.fillStyle = rgb(mix(tribe.color, [255, 230, 160], 0.4)); g.fillRect(tx - 1, 201 - flame * 2, 4, 5 + flame * 2);
            if (!calm && Math.random() < 0.2) embers.push({ x: tx, y: 200, vx: (Math.random() - 0.5) * 14, vy: -20 - Math.random() * 20, l: 0, c: tribe.color });
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
      const r = rng(53);
      const far = layerCanvas(g => {
        sky(g, [[0, [16, 4, 10]], [0.5, [92, 14, 24]], [0.85, [190, 52, 32]], [1, [236, 110, 50]]]);
        clouds(g, r, 9, 20, 120, "rgba(40,6,14,.6)");
      });
      const keepLayer = layerCanvas(g => {
        ridge(g, r, 176, 56, "#1a060c", "#3a1018");
        const ink = "#07020a";
        g.fillStyle = ink;
        const crenels = (x0, x1, y) => { for (let x = x0; x < x1; x += 8) g.fillRect(x, y - 5, 4, 5); };
        const spire = (cx, base, hw, top) => { for (let y = top; y < base; y++) { const half = Math.round(hw * (y - top) / (base - top)); g.fillRect(cx - half, y, half * 2 + 1, 1); } };
        g.fillRect(70, 148, 340, 60); crenels(70, 410, 148);                                 // curtain wall
        for (const cx of [96, 384]) { g.fillRect(cx - 17, 96, 34, 112); crenels(cx - 17, cx + 17, 96); spire(cx, 90, 20, 56); }   // flanking towers
        for (const cx of [168, 312]) { g.fillRect(cx - 11, 118, 22, 90); spire(cx, 112, 14, 84); }
        g.fillRect(198, 64, 84, 144); crenels(198, 282, 64);                                 // the keep
        for (const cx of [205, 275]) { g.fillRect(cx - 8, 40, 16, 30); spire(cx, 36, 11, 12); }
        g.fillRect(238, 10, 4, 54); g.fillRect(242, 14, 14, 7);                              // banner mast and flag
        g.fillStyle = "#3a0a10"; g.fillRect(228, 168, 24, 40); g.fillStyle = ink; g.fillRect(230, 170, 20, 38);   // gate
        g.fillStyle = "#07020a"; g.fillRect(-PAD, 206, W + PAD * 2, H);
      });
      const windows = [[96, 120], [96, 150], [384, 120], [384, 150], [168, 140], [312, 140], [214, 92], [226, 120], [254, 120], [266, 92], [240, 100], [240, 150], [205, 52], [275, 52]];
      const near = layerCanvas(g => {
        ridge(g, r, 226, 18, "#0c0408", "#1e0a10");
        g.fillStyle = "#08030a"; g.fillRect(-PAD, 238, W + PAD * 2, H);
      });
      return {
        cam: [[0, 2, 1.0], [0, -5, 1.1]], tint: [255, 30, 20, 0.08], rain: 0, fadeIn: 0.5, fadeOut: 0.9,
        layers: [[0.06, far], [0.16, keepLayer], [0.5, near]],
        dynamic(g, st) {
          const { t, local, calm, P, since } = st;
          let [ox, oy] = P(0.16); g.save(); g.translate(ox, oy);
          // the crown's glow, lit windows, and the king on the parapet
          g.globalCompositeOperation = "lighter";
          glow(g, W / 2, 96, 170, [210, 40, 24], 0.3 + (calm ? 0 : 0.07 * Math.sin(t * 1.5)));
          g.globalCompositeOperation = "source-over";
          windows.forEach(([x, y], i) => {
            const on = clamp(local * 3 - (i % 7) * 0.12), f = calm ? 1 : 0.7 + 0.3 * Math.sin(t * 6 + i * 2.1);
            g.fillStyle = `rgba(255,${90 + (i % 3) * 30},40,${on * f})`; g.fillRect(x - 1, y, 3, 5);
          });
          spr(g, img("enemies:king"), 0, W / 2, 64, 1.5, true, 32, [[4, 0, 6], 1]);
          const eyes = ease(clamp((local - 0.3) * 2.5));
          g.fillStyle = `rgba(255,60,40,${eyes})`; g.fillRect(W / 2 - 2, 38, 2, 1); g.fillRect(W / 2 + 1, 38, 2, 1);
          g.restore();
          // the tribes stand together beneath it
          [ox, oy] = P(0.9); g.save(); g.translate(ox, oy);
          TRIBES.forEach((tribe, ti) => tribe.units.forEach((name, ui) => {
            const k = ti * 3 + ui, x = 56 + k * 46, y = 258 + (k % 2) * 4, up = ease(clamp(since * 0.8 + 0.5));
            g.globalCompositeOperation = "lighter"; glow(g, x, y - 6, 24, tribe.color, 0.22 * up); g.globalCompositeOperation = "source-over";
            spr(g, img(unitKey(name)), calm ? 0 : Math.floor(t * 5 + k) % 4, x, y, 1.5, false, 32, [[8, 2, 12], 0.35]);
          }));
          g.restore();
        },
      };
    }

    const shots = [harvest(), drowning(), silence(), gather(), crown()];
    let last = -1, drift = 0;
    return {
      shots,
      /** Draw the current shot. `tl` is the intro timeline; the beat index is the shot index. */
      draw(g, tl, dt, calm = false) {
        const index = clamp(tl.index, 0, shots.length - 1), shot = shots[index];
        if (index !== last) { last = index; smoke.length = embers.length = 0; }
        const local = tl.local(), t = tl.time, since = tl.since(index);
        const cam = calm ? [0, 0, 1] : shot.cam[0].map((v, i) => lerp(v, shot.cam[1][i], ease(local)));
        g.save();
        g.imageSmoothingEnabled = false;
        g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
        g.translate(W / 2, H / 2); g.scale(cam[2], cam[2]); g.translate(-W / 2, -H / 2);
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
        if (shot.bolt && !calm) {
          // Two flashes under 3 Hz, each decaying quickly: dramatic without strobing.
          const flash = Math.max(Math.exp(-since * 7), 0.55 * Math.exp(-Math.max(0, since - 0.4) * 9) * (since > 0.4 ? 1 : 0));
          if (flash > 0.02) { g.fillStyle = `rgba(215,225,255,${0.65 * flash})`; g.fillRect(0, 0, W, H); }
        }
        const fade = Math.min(shot.fadeIn ? clamp(since / shot.fadeIn) : 1, (shot.fadeOut ?? 0.35) ? clamp((tl.beat().dur - since) / (shot.fadeOut ?? 0.35)) : 1);
        if (fade < 1) { g.fillStyle = `rgba(0,0,0,${1 - fade})`; g.fillRect(0, 0, W, H); }
      },
    };
  }

  BC.IntroScene = { create, W, H };
})();
