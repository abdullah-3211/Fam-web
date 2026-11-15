(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: -9999, y: -9999, active: false };
  let mode = 'home';

  // Clans created from the family trees; they appear in the home galaxy
  const clanRegistry = [];
  const clanPairs = new Map();   // related clans: key "a|b" -> { a, b, rels }

  /* =========================================================
     LOGIN BACKGROUND: green spiderweb with a crawling spider
     ========================================================= */
  function createLoginBg(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, R = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.hypot(W, H) / 2 * 0.95;
    }

    const SPOKES = 18, RINGS = 10;

    function draw(t) {
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, W, H);

      const breathe = 0.5 + 0.5 * Math.sin(t * 0.0006);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
      glow.addColorStop(0, `rgba(60,255,122,${0.05 + breathe * 0.03})`);
      glow.addColorStop(1, 'rgba(60,255,122,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(210,235,220,0.13)';
      ctx.beginPath();
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2 + Math.sin(t * 0.00025 + i) * 0.004;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      }
      ctx.stroke();

      const points = [];
      for (let j = 1; j <= RINGS; j++) {
        const baseR = R * Math.pow(j / RINGS, 0.92);
        const row = [];
        ctx.beginPath();
        for (let i = 0; i <= SPOKES; i++) {
          const idx = i % SPOKES;
          const a = (idx / SPOKES) * Math.PI * 2 + Math.sin(t * 0.00025 + idx) * 0.004;
          const rr = baseR * (1 + 0.018 * Math.sin(t * 0.0009 + idx * 0.7 + j * 0.9));
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          row.push([x, y]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(210,235,220,0.09)';
        ctx.stroke();
        points.push(row);
      }

      if (pointer.active) {
        const mg = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 160);
        mg.addColorStop(0, 'rgba(60,255,122,0.22)');
        mg.addColorStop(1, 'rgba(60,255,122,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(pointer.x - 160, pointer.y - 160, 320, 320);
      }

      for (let j = 0; j < points.length; j++) {
        for (let i = 0; i < SPOKES; i++) {
          const [x, y] = points[j][i];
          const tw = 0.5 + 0.5 * Math.sin(t * 0.002 + i * 1.3 + j * 2.1);
          const near = pointer.active && Math.hypot(x - pointer.x, y - pointer.y) < 160;
          ctx.fillStyle = near ? 'rgba(60,255,122,0.9)' : `rgba(230,250,240,${0.12 + tw * 0.2})`;
          ctx.beginPath();
          ctx.arc(x, y, near ? 1.8 : 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const sx = W * 0.84;
      const drop = 0.5 + 0.5 * Math.sin(t * 0.00045);
      const sy = H * (0.08 + drop * 0.32);
      ctx.strokeStyle = 'rgba(230,240,235,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, sy); ctx.stroke();

      const legSwing = Math.sin(t * 0.004) * 3;
      ctx.strokeStyle = 'rgba(235,245,240,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        const off = k * 3.2;
        ctx.moveTo(sx, sy + 2); ctx.lineTo(sx - 9 + legSwing * (k % 2 ? 1 : -1), sy + off + 2);
        ctx.moveTo(sx, sy + 2); ctx.lineTo(sx + 9 - legSwing * (k % 2 ? 1 : -1), sy + off + 2);
      }
      ctx.stroke();
      ctx.fillStyle = '#0c0e0d';
      ctx.strokeStyle = 'rgba(60,255,122,0.5)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 2, 3.2, 4.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    return { resize, draw };
  }

  /* =========================================================
     HOME BACKGROUND: asymmetric white family web with join points
     ========================================================= */
  function createHomeBg(canvas, tip) {
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    let W = 0, H = 0, dpr = 1, U = 1;
    let hoverFam = -1;

    // Camera: world units are scaled by s = U * zoom. Camera centre is (camX, camY).
    const ZMIN = 0.0008, ZMAX = 120;
    let INIT_ZOOM = 0.3, zoomReady = false;
    let zoom = INIT_ZOOM, camX = 0, camY = 0;
    let suppressTap = false;
    const touches = new Map();
    let dragStart = null, pinchDist = 0;
    const held = new Set();
    let shiftHeld = false;
    let lastT = null;

    const CREST_R = 0.011;   // crest radius in world units

    function mulberry32(seed) {
      return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(20261111);
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const hash = (x, y, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };

    /* ---------- Sharp crystal crests ---------- */
    function star(c, cx, cy, R, r, n) {
      c.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const rad = i % 2 === 0 ? R : r;
        const a = -Math.PI / 2 + (i / (n * 2)) * TAU;
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
    }
    function diamond(c, r) {
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r * 0.7, 0); c.lineTo(0, r); c.lineTo(-r * 0.7, 0);
      c.closePath();
    }

    const CREST_COLORS = ['#cfe3ff', '#ffe14d', '#ffb347', '#9be7ff', '#ff6b4a', '#b388ff', '#ffd166', '#3cff7a', '#ff7eb6'];
    let curCol = '#ffffff';
    const CRESTS = [
      (c) => {
        c.beginPath(); c.arc(-0.05, 0.02, 0.62, 0, TAU); c.fill();
        c.fillStyle = '#05070a';
        c.beginPath(); c.arc(0.22, -0.1, 0.52, 0, TAU); c.fill();
        c.fillStyle = curCol;
        star(c, 0.5, -0.5, 0.2, 0.08, 4);
      },
      (c) => {
        c.beginPath();
        [[0.2, -0.78], [-0.42, 0.08], [-0.02, 0.08], [-0.2, 0.78], [0.42, -0.1], [0.02, -0.1]]
          .forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
        c.closePath(); c.fill();
      },
      (c) => { star(c, 0, 0, 0.8, 0.42, 12); },
      (c) => {
        c.lineWidth = 0.13;
        c.beginPath();
        c.moveTo(-0.6, -0.6); c.lineTo(0.6, 0.6);
        c.moveTo(0.6, -0.6); c.lineTo(-0.6, 0.6);
        c.stroke();
        c.lineWidth = 0.1;
        c.beginPath();
        c.moveTo(-0.42, 0.18); c.lineTo(-0.18, 0.42);
        c.moveTo(0.42, 0.18); c.lineTo(0.18, 0.42);
        c.stroke();
      },
      (c) => {
        c.beginPath();
        c.moveTo(0, -0.85);
        c.bezierCurveTo(0.5, -0.4, 0.62, 0.1, 0.45, 0.35);
        c.arc(0, 0.35, 0.45, 0, Math.PI, false);
        c.bezierCurveTo(-0.62, 0.1, -0.5, -0.4, 0, -0.85);
        c.fill();
        c.fillStyle = '#05070a';
        c.beginPath();
        c.moveTo(0, -0.1);
        c.bezierCurveTo(0.22, 0.15, 0.25, 0.3, 0.12, 0.38);
        c.arc(0, 0.38, 0.12, 0, Math.PI, false);
        c.bezierCurveTo(-0.25, 0.3, -0.22, 0.15, 0, -0.1);
        c.fill();
        c.fillStyle = curCol;
      },
      (c) => {
        c.lineWidth = 0.12;
        diamond(c, 0.95); c.stroke();
        diamond(c, 0.5); c.fill();
      },
      (c) => {
        c.beginPath();
        [[-0.8, 0.55], [-0.8, -0.2], [-0.4, 0.15], [0, -0.6], [0.4, 0.15], [0.8, -0.2], [0.8, 0.55]]
          .forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
        c.closePath(); c.fill();
      },
      (c) => {
        c.beginPath();
        c.moveTo(-0.9, 0);
        c.quadraticCurveTo(0, -0.62, 0.9, 0);
        c.quadraticCurveTo(0, 0.62, -0.9, 0);
        c.fill();
        c.fillStyle = '#05070a';
        c.beginPath(); c.ellipse(0, 0, 0.13, 0.44, 0, 0, TAU); c.fill();
        c.fillStyle = curCol;
      },
      (c) => {
        c.lineWidth = 0.1;
        [-160, -125, -90, -55, -20].forEach((deg) => {
          const a = deg * Math.PI / 180;
          c.beginPath();
          c.moveTo(0, 0.75);
          c.lineTo(Math.cos(a) * 0.95, 0.75 + Math.sin(a) * 0.95);
          c.stroke();
        });
        c.beginPath(); c.arc(0, 0.75, 0.12, 0, TAU); c.fill();
      }
    ];

    // Crystal crest centred at (x, y) with world radius R
    function drawCrystal(x, y, R, kind, hovered, breathe, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(R, R);
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';

      const hex = (rad) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 3;
          const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };

      hex(1.2 + breathe * 0.03);
      ctx.strokeStyle = `rgba(255,255,255,${hovered ? 0.7 : 0.2 + breathe * 0.15})`;
      ctx.lineWidth = 0.025;
      ctx.stroke();

      hex(1);
      const g = ctx.createRadialGradient(-0.35, -0.45, 0.05, 0, 0, 1.1);
      g.addColorStop(0, 'rgba(255,255,255,0.32)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.05;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.02;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a), Math.sin(a));
        ctx.stroke();
      }
      hex(0.66);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.56);
      ctx.lineTo(-0.1, -0.9);
      ctx.lineTo(-0.28, -0.18);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.scale(0.6, 0.6);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      curCol = col;
      CRESTS[kind % CRESTS.length](ctx);
      ctx.restore();

      ctx.restore();
    }

    /* ---------- Distant galaxies (named, around the home galaxy) ---------- */
    function spiral(out, n, size, arms, tilt, rot, bright) {
      for (let i = 0; i < n; i++) {
        const u = Math.pow(rand(), 0.6);
        const r = size * u;
        const arm = i % arms;
        const th = arm * TAU / arms + 3.4 * u + (rand() - 0.5) * 0.55;
        let x = Math.cos(th) * r + gauss() * size * 0.04;
        let y = Math.sin(th) * r * tilt + gauss() * size * 0.04;
        const cr = Math.cos(rot), sr = Math.sin(rot);
        out.push(x * cr - y * sr, x * sr + y * cr, bright * (1 - u * 0.7) * (0.5 + rand() * 0.5));
      }
    }
    function blob(out, n, size, tilt, rot, bright) {
      for (let i = 0; i < n; i++) {
        const x = gauss() * size, y = gauss() * size * tilt;
        const cr = Math.cos(rot), sr = Math.sin(rot);
        out.push(x * cr - y * sr, x * sr + y * cr, bright * (0.4 + rand() * 0.6));
      }
    }
    function ring(out, n, R, w, bright) {
      for (let i = 0; i < n; i++) {
        const th = rand() * TAU;
        const rr = R + gauss() * w;
        out.push(Math.cos(th) * rr, Math.sin(th) * rr * 0.8, bright * (0.5 + rand() * 0.5));
      }
    }
    function jet(out, n, dir, len, bright) {
      for (let i = 0; i < n; i++) {
        const u = rand();
        const d = u * len;
        out.push(Math.cos(dir) * d + gauss() * 0.01, Math.sin(dir) * d + gauss() * 0.01, bright * (1 - u) * 0.9);
      }
    }

    const galaxies = [];
    function addGalaxy(name, cx, cy, size, build, core, arm) {
      const local = [];
      build(local);
      const pts = new Float32Array(local.length);
      for (let i = 0; i < local.length; i += 3) {
        pts[i] = local[i] + cx;
        pts[i + 1] = local[i + 1] + cy;
        pts[i + 2] = local[i + 2];
      }
      galaxies.push({ name, cx, cy, size, pts, core, arm });
    }
    addGalaxy('Triangulum (M33)', -3.3, -1.5, 0.55, (p) => spiral(p, 420, 0.55, 2, 0.55, 0.4, 0.9), '#ffe7b0', '#9ec8ff');
    addGalaxy('Whirlpool (M51)', -2.0, 2.4, 0.48, (p) => spiral(p, 420, 0.48, 2, 0.8, -0.3, 1.0), '#fff3cf', '#8db9ff');
    addGalaxy('Companion', -1.55, 2.85, 0.12, (p) => blob(p, 90, 0.12, 0.7, 0.3, 0.8), '#ffd6a0', '#ffd6a0');
    addGalaxy('Cartwheel', 3.5, -1.4, 0.32, (p) => { ring(p, 260, 0.3, 0.035, 0.9); blob(p, 40, 0.05, 1, 0, 1.0); }, '#ffd27a', '#8fd0ff');
    addGalaxy('Virgo A (M87)', -3.6, 0.3, 0.22, (p) => blob(p, 260, 0.22, 0.9, 0, 0.9), '#fff4d6', '#ffd58e');
    addGalaxy('', -3.6, 0.3, 0.25, (p) => jet(p, 120, -0.35, 0.9, 0.8), '#a9dcff', '#a9dcff');
    addGalaxy('NGC 1232', 1.4, 3.5, 0.42, (p) => spiral(p, 340, 0.42, 2, 0.6, 1.1, 0.85), '#ffe9b8', '#9cc8ff');
    addGalaxy('Canis Major Dwarf', 4.4, -3.2, 0.5, (p) => blob(p, 300, 0.5, 0.6, 0.5, 0.55), '#ffb070', '#ffb070');

    /* ---------- Sun and eight planets beside the galaxy ---------- */
    const SUN = { x: 3.5, y: 1.9 };
    // Orbit radii are compressed so all eight planets fit on screen; "real" is the true distance in AU (1 unit = 100 million km)
    const PLANETS = [
      { name: 'Mercury', r: 0.17, real: 0.579, size: 1.4, ph: 0.3 },
      { name: 'Venus', r: 0.23, real: 1.082, size: 2.0, ph: 2.1 },
      { name: 'Earth', r: 0.30, real: 1.496, size: 2.1, ph: 4.0 },
      { name: 'Mars', r: 0.37, real: 2.279, size: 1.8, ph: 1.2 },
      { name: 'Jupiter', r: 0.52, real: 7.786, size: 3.4, ph: 5.1 },
      { name: 'Saturn', r: 0.66, real: 14.33, size: 3.0, ph: 0.8 },
      { name: 'Uranus', r: 0.80, real: 28.72, size: 2.4, ph: 3.6 },
      { name: 'Neptune', r: 0.93, real: 44.95, size: 2.4, ph: 2.6 }
    ];

    /* ---------- Background star field ---------- */
    const bgStars = [];
    for (let i = 0; i < 2000; i++) {
      bgStars.push({ x: (rand() - 0.5) * 14, y: (rand() - 0.5) * 9, s: 0.4 + rand() * 1.0, a: 0.2 + rand() * 0.6 });
    }

    /* ---------- The home galaxy: family webs ---------- */
    const FAMILIES = 2400;
    const ARMS = 4;
    const DEST_LINK_R = 0.16;
    const fams = [];

    for (let i = 0; i < FAMILIES; i++) {
      const core = rand() < 0.1;
      const r = core ? 0.03 + rand() * 0.13 : 0.16 + Math.pow(rand(), 0.9) * 1.8;
      const arm = i % ARMS;
      const theta0 = core
        ? rand() * TAU
        : (arm * TAU) / ARMS + 2.2 * Math.log(1 + r * 3.5) + (rand() - 0.5) * (0.25 + r * 0.5);

      const S = 5 + Math.floor(rand() * 3);
      const K = 2 + Math.floor(rand() * 2);
      const Rw = 0.024 + rand() * 0.012;

      const spokes = [];
      let a0 = rand() * TAU;
      for (let s = 0; s < S; s++) { spokes.push(a0); a0 += (TAU / S) * (0.6 + rand() * 0.8); }
      const scale = TAU / (spokes[S - 1] - spokes[0] + TAU / S);
      for (let s = 0; s < S; s++) spokes[s] = spokes[0] + (spokes[s] - spokes[0]) * scale;

      const members = [];
      const rings = [];
      for (let k = 1; k <= K; k++) {
        const row = [];
        for (let s = 0; s < S; s++) {
          const a = spokes[s] + (rand() - 0.5) * 0.14;
          const rr = Rw * (k / K) * (0.8 + rand() * 0.4);
          row.push(members.length);
          members.push({ ox: Math.cos(a) * rr * 1.1, oy: Math.sin(a) * rr, outer: k === K, ph: rand() * 10 });
        }
        rings.push(row);
      }

      const localEdges = [];
      for (let s = 0; s < S; s++) {
        localEdges.push([-1, rings[0][s]]);
        for (let k = 0; k < K - 1; k++) {
          if (rand() < 0.9) localEdges.push([rings[k][s], rings[k + 1][s]]);
        }
      }
      for (let k = 0; k < K; k++) {
        for (let s = 0; s < S; s++) {
          if (rand() < 0.8) localEdges.push([rings[k][s], rings[k][(s + 1) % S]]);
        }
      }

      fams.push({
        r,
        theta0,
        toCore: r < DEST_LINK_R,
        crest: Math.floor(rand() * 9),
        phase: rand() * 10,
        bright: rand(),
        members,
        localEdges,
        bx: Math.cos(theta0) * r,
        by: Math.sin(theta0) * r * 0.62
      });
    }

    // Each family links to its two nearest neighbours
    const CELL = 0.1;
    const grid = new Map();
    fams.forEach((f, i) => {
      const key = Math.floor(f.bx / CELL) + ',' + Math.floor(f.by / CELL);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });
    const d2 = (i, j) => (fams[i].bx - fams[j].bx) ** 2 + (fams[i].by - fams[j].by) ** 2;
    const bonds = [];
    const seen = new Set();
    fams.forEach((f, i) => {
      const cx = Math.floor(f.bx / CELL), cy = Math.floor(f.by / CELL);
      const cand = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get((cx + dx) + ',' + (cy + dy));
          if (list) for (const j of list) if (j !== i) cand.push(j);
        }
      }
      cand.sort((a, b) => d2(i, a) - d2(i, b));
      for (const j of cand.slice(0, 2)) {
        const key = Math.min(i, j) + '-' + Math.max(i, j);
        if (!seen.has(key)) {
          seen.add(key);
          bonds.push([i, j, rand() * 10]);
        }
      }
    });

    const pos = new Float32Array(FAMILIES * 2);
    const vis = new Uint8Array(FAMILIES);
    const memBuf = new Float32Array(64);

    /* ---------- Deep space beyond the galaxy (1 unit = 100 million km) ---------- */
    // Asteroids, comets, meteoroids and meteors sit beyond 200,000,000 km.
    // Exoplanets, black holes, dark matter halos, globular clusters and satellite galaxies sit beyond 500,000,000 km.
    const KM_PER_UNIT = 1e8;
    let hoverVisit = -1;
    let flight = null;

    const polar = (rMin, rMax) => {
      const a = rand() * TAU, r = rMin + rand() * (rMax - rMin);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62 };
    };
    const flatten = (fn) => { const out = []; fn(out); return new Float32Array(out); };
    const offsetPts = (arr, cx, cy) => {
      const p = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i += 3) { p[i] = arr[i] + cx; p[i + 1] = arr[i + 1] + cy; p[i + 2] = arr[i + 2]; }
      return p;
    };
    const fmtKm = (km) => (km < 1e7 ? Math.round(km / 100) * 100 : Math.round(km / 1e6) * 1e6).toLocaleString('en-US') + ' km';

    // Colour helpers and real colours for the planets, stars and exoplanets
    const hexA = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    };
    const h3 = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };

    const SOLAR_SKIN = {
      Sun:     { type: 'star', base: '#fff1c4' },
      Mercury: { type: 'rock', base: '#8c8580' },
      Venus:   { type: 'gas', base: '#e8cf9a', bands: ['#f3deb0', '#d9b77a', '#f6e7c4'] },
      Earth:   { type: 'earth', base: '#2d6fc4' },
      Mars:    { type: 'rock', base: '#c1502e', cap: true },
      Jupiter: { type: 'gas', base: '#d9b48a', bands: ['#c8925c', '#f2e0c2', '#a86b3c', '#e8cba3', '#b97a4a'], spot: true },
      Saturn:  { type: 'gas', base: '#e6d19a', bands: ['#f0dfb0', '#d8bd7c', '#f5e8c4'], rings: true },
      Uranus:  { type: 'gas', base: '#9fe3e8', bands: ['#bff0f2', '#8fd7de', '#d2f7f8'] },
      Neptune: { type: 'gas', base: '#3f63d9', bands: ['#4f78ea', '#2d4fb8', '#6c8ff0'], spot: true }
    };
    const STAR_COLORS = ['#ffb27a', '#ffe6b0', '#cfe0ff', '#ff9f7a'];
    const EXO_SKINS = [
      { type: 'rock', base: '#a5785a' },
      { type: 'earth', base: '#2f6fb5' },
      { type: 'rock', base: '#d9b47a' },
      { type: 'gas', base: '#bfe6f2', bands: ['#e7f8ff', '#9fd7ea', '#dff3fb'] },
      { type: 'gas', base: '#c58f5a', bands: ['#e8c39a', '#b5713f', '#f1d9b5'], spot: true }
    ];
    // Real asteroid colours: rocky (stony, carbonaceous, metallic) and heated (glowing orange-red)
    const ROCK_COLS = ['#8b7355', '#a88b6a', '#6b6259', '#7d6b58', '#9c8a78'];
    const HEAT_COLS = ['#ff7a3d', '#ff9a4d', '#ffb070', '#e8552b', '#ffd08a'];
    let visitView = null;

    // Asteroids and meteoroids (beyond 200,000,000 km)
    const beltRaw = [];
    for (let i = 0; i < 140; i++) {
      const a = rand() * TAU, r = 2.2 + rand() * 1.6;
      beltRaw.push(Math.cos(a) * r, Math.sin(a) * r * 0.62, 0.3 + rand() * 0.7);
    }
    const beltPts = new Float32Array(beltRaw);
    const heatRaw = [];
    for (let i = 0; i < 40; i++) {
      const a = rand() * TAU, r = 2.6 + rand() * 1.4;
      heatRaw.push(Math.cos(a) * r, Math.sin(a) * r * 0.62, 0.5 + rand() * 0.5);
    }
    const heatPts = new Float32Array(heatRaw);
    const mtdRaw = [];
    for (let i = 0; i < 40; i++) {
      const a = rand() * TAU, r = 2.3 + rand() * 2.4;
      mtdRaw.push(Math.cos(a) * r, Math.sin(a) * r * 0.62, 0.3 + rand() * 0.6);
    }
    const meteoroidPts = new Float32Array(mtdRaw);

    const meteors = [];
    for (let i = 0; i < 8; i++) {
      const a = rand() * TAU, r = 2.4 + rand() * 2.6;
      meteors.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, ang: rand() * TAU, len: 0.03 + rand() * 0.05 });
    }

    const comets = [];
    for (let i = 0; i < 10; i++) {
      const a = rand() * TAU, r = 2.6 + rand() * 1.8;
      comets.push({ name: 'Comet ' + String.fromCharCode(65 + i), x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, ang: a, len: 0.12 + rand() * 0.12 });
    }

    // Exoplanet systems (beyond 500,000,000 km)
    const EXO_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    const PLANET_LETTERS = ['b', 'c', 'd'];
    const exoSystems = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rand() * 0.4, r = 5.4 + rand() * 3.2;
      const planets = [];
      const np = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < np; k++) {
        planets.push({ name: PLANET_LETTERS[k], r: 0.05 + k * 0.035 + rand() * 0.02, ph: rand() * TAU, size: 1.2 + rand() * 1.6, skin: EXO_SKINS[Math.floor(rand() * EXO_SKINS.length)] });
      }
      exoSystems.push({ name: 'Exo ' + EXO_NAMES[i], x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, planets, color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)] });
    }

    // Black holes, dark matter halos, globular clusters and satellite galaxies (beyond 500,000,000 km)
    const blackHoles = ['Black hole Nyx', 'Black hole Erebus', 'Black hole Kali'].map((name) => ({ name, ...polar(5.6, 8.5) }));
    const halos = [];
    for (let i = 0; i < 6; i++) {
      const q = polar(5, 9);
      halos.push({ name: 'Dark matter halo ' + (i + 1), x: q.x, y: q.y, pts: offsetPts(flatten((o) => blob(o, 90, 0.5, 0.6, rand() * TAU, 0.25)), q.x, q.y) });
    }
    const globulars = [];
    for (let i = 0; i < 6; i++) {
      const q = polar(5.5, 9);
      globulars.push({ name: 'Globular cluster ' + (i + 1), x: q.x, y: q.y, pts: offsetPts(flatten((o) => blob(o, 140, 0.07, 1, 0, 0.9)), q.x, q.y) });
    }
    const satellites = [];
    for (let i = 0; i < 6; i++) {
      const q = polar(5.5, 9);
      satellites.push({ name: 'Satellite galaxy ' + (i + 1), x: q.x, y: q.y, pts: offsetPts(flatten((o) => spiral(o, 110, 0.16, 2, 0.55, rand() * TAU, 0.9)), q.x, q.y) });
    }

    // Everything the user can visit: tap or hover to see its distance, tap to fly there
    const visitables = [];
    const addVisit = (name, km, from, kind, zoomTo, get) => visitables.push({ name, km, from, kind, zoomTo, get });

    addVisit('Sun', Math.hypot(SUN.x, SUN.y) * KM_PER_UNIT, 'from the galaxy centre', 'planet', 2.2, () => SUN);
    PLANETS.forEach((p) => addVisit(p.name, p.real * KM_PER_UNIT, 'from the Sun', 'planet', 3.0, (t) => {
      const a = p.ph + t * 0.000004 / Math.pow(p.r, 1.5);
      return { x: SUN.x + Math.cos(a) * p.r, y: SUN.y + Math.sin(a) * p.r };
    }));
    exoSystems.forEach((sys) => {
      addVisit(sys.name, Math.hypot(sys.x, sys.y) * KM_PER_UNIT, 'from the galaxy centre', 'exo', 1.4, () => sys);
      sys.planets.forEach((pl) => addVisit(sys.name + ' ' + pl.name, pl.r * KM_PER_UNIT, 'from its star', 'exo', 3.0, (t) => {
        const a = pl.ph + t * 0.000004 / Math.pow(pl.r, 1.5);
        return { x: sys.x + Math.cos(a) * pl.r, y: sys.y + Math.sin(a) * pl.r };
      }));
    });
    comets.forEach((c) => addVisit(c.name, Math.hypot(c.x, c.y) * KM_PER_UNIT, 'from the galaxy centre', 'outer', 1.6, () => c));
    for (let i = 0; i < beltPts.length; i += 3) {
      const x = beltPts[i], y = beltPts[i + 1];
      addVisit('Rocky asteroid ' + (i / 3 + 1), Math.hypot(x, y) * KM_PER_UNIT, 'from the galaxy centre', 'rock', 1.0, () => ({ x, y }));
      visitables[visitables.length - 1].skin = { type: 'rock', base: ROCK_COLS[(i / 3) % ROCK_COLS.length] };
    }
    for (let i = 0; i < heatPts.length; i += 3) {
      const x = heatPts[i], y = heatPts[i + 1];
      addVisit('Heated asteroid ' + (i / 3 + 1), Math.hypot(x, y) * KM_PER_UNIT, 'from the galaxy centre', 'heat', 1.0, () => ({ x, y }));
      visitables[visitables.length - 1].skin = { type: 'heat', base: HEAT_COLS[(i / 3) % HEAT_COLS.length] };
    }
    blackHoles.forEach((b) => addVisit(b.name, Math.hypot(b.x, b.y) * KM_PER_UNIT, 'from the galaxy centre', 'deep', 1.2, () => b));
    halos.forEach((h) => addVisit(h.name, Math.hypot(h.x, h.y) * KM_PER_UNIT, 'from the galaxy centre', 'deep', 0.8, () => h));
    globulars.forEach((g) => addVisit(g.name, Math.hypot(g.x, g.y) * KM_PER_UNIT, 'from the galaxy centre', 'deep', 1.2, () => g));
    satellites.forEach((s) => addVisit(s.name, Math.hypot(s.x, s.y) * KM_PER_UNIT, 'from the galaxy centre', 'deep', 1.2, () => s));
    // Moons (orbit radii compressed like the planets; "km" is the true distance from the planet)
    const MOONS = [
      { name: 'Moon', planet: 'Earth', r: 0.035, km: 384400, size: 1.6, ph: 0.5 },
      { name: 'Phobos', planet: 'Mars', r: 0.012, km: 9376, size: 1.0, ph: 1.0 },
      { name: 'Deimos', planet: 'Mars', r: 0.019, km: 23460, size: 1.0, ph: 2.0 },
      { name: 'Io', planet: 'Jupiter', r: 0.05, km: 421700, size: 1.6, ph: 0.2 },
      { name: 'Europa', planet: 'Jupiter', r: 0.065, km: 671000, size: 1.4, ph: 1.7 },
      { name: 'Ganymede', planet: 'Jupiter', r: 0.082, km: 1070400, size: 1.8, ph: 3.1 },
      { name: 'Callisto', planet: 'Jupiter', r: 0.105, km: 1882700, size: 1.7, ph: 4.4 },
      { name: 'Titan', planet: 'Saturn', r: 0.09, km: 1221870, size: 2.0, ph: 0.9 },
      { name: 'Enceladus', planet: 'Saturn', r: 0.06, km: 238000, size: 1.2, ph: 2.4 },
      { name: 'Titania', planet: 'Uranus', r: 0.05, km: 435910, size: 1.3, ph: 1.1 },
      { name: 'Triton', planet: 'Neptune', r: 0.05, km: 354759, size: 1.5, ph: 3.3 }
    ];
    const MOON_SKIN = {
      'Moon': { type: 'rock', base: '#b9b9b9' },
      'Phobos': { type: 'rock', base: '#7a6f66' },
      'Deimos': { type: 'rock', base: '#8a8076' },
      'Io': { type: 'rock', base: '#e2b44f' },
      'Europa': { type: 'rock', base: '#ece3d0' },
      'Ganymede': { type: 'rock', base: '#9d978e' },
      'Callisto': { type: 'rock', base: '#5f5852' },
      'Titan': { type: 'gas', base: '#d89a4a', bands: ['#e9b46a', '#c98236', '#f0c98a'] },
      'Enceladus': { type: 'rock', base: '#f4f9fc' },
      'Titania': { type: 'rock', base: '#a9a39c' },
      'Triton': { type: 'rock', base: '#d8b6c0' }
    };
    const planetPos = (p, t) => {
      const a = p.ph + t * 0.000004 / Math.pow(p.r, 1.5);
      return { x: SUN.x + Math.cos(a) * p.r, y: SUN.y + Math.sin(a) * p.r };
    };
    const moonPos = (m, t) => {
      const pp = planetPos(PLANETS.find((p) => p.name === m.planet), t);
      const a = m.ph + t * 0.0000008 / Math.pow(m.r, 1.5);
      return { x: pp.x + Math.cos(a) * m.r, y: pp.y + Math.sin(a) * m.r };
    };
    MOONS.forEach((m) => addVisit(m.name, m.km, 'from ' + m.planet, 'moon', 2.6, (t) => moonPos(m, t)));
    visitables.forEach((v) => { if (MOON_SKIN[v.name]) v.skin = MOON_SKIN[v.name]; });

    visitables.forEach((v) => { if (SOLAR_SKIN[v.name]) v.skin = SOLAR_SKIN[v.name]; });
    exoSystems.forEach((sys) => {
      const sv = visitables.find((x) => x.name === sys.name);
      if (sv) sv.skin = { type: 'star', base: sys.color };
      sys.planets.forEach((pl) => {
        const v = visitables.find((x) => x.name === sys.name + ' ' + pl.name);
        if (v) v.skin = pl.skin;
      });
    });

    // Fade rules: outer objects fade in as you zoom out; planets fade in as you zoom in;
    // deep-space objects fade in when zoomed far out.
    function outerFade() { return Math.max(0.55, clamp((0.7 - zoom) / 0.45, 0, 1)); }
    function alphaFor(kind) {
      if (kind === 'planet') return Math.max(0.6, clamp((zoom - 0.03) / 0.08, 0, 1));
      if (kind === 'moon') return Math.max(0.35, clamp((zoom - 0.06) / 0.14, 0, 1));
      if (kind === 'exo') return Math.max(0.5, clamp((zoom - 0.15) / 0.25, 0, 1), clamp((0.45 - zoom) / 0.25, 0, 1));
      if (kind === 'clan') return clamp((zoom - 0.12) / 0.2, 0, 1);
      if (kind === 'rock' || kind === 'heat') return clamp((zoom - 0.1) / 0.2, 0, 1);
      if (kind === 'deep') return Math.max(0.45, clamp((0.45 - zoom) / 0.25, 0, 1));
      return outerFade();
    }

    function findVisit(px, py, t) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < visitables.length; i++) {
        const v = visitables[i];
        if (alphaFor(v.kind) < 0.2) continue;
        const p = v.get(t);
        const s = toScreen(p.x, p.y);
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < 16 && d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    function showVisitTip(i, t) {
      const v = visitables[i];
      const p = v.get(t);
      const sp = toScreen(p.x, p.y);
      tip.textContent = v.name + ' · ' + fmtKm(v.km) + ' ' + v.from;
      tip.style.left = sp.x + 'px';
      tip.style.top = sp.y + 'px';
      tip.classList.add('show');
    }

    function startFlight(v, t) {
      flight = { v, fixed: null, zoomTo: null, t0: t, dur: 1500, sx: camX, sy: camY, sz: zoom };
    }

    function startReturn(back, t) {
      flight = { v: null, fixed: { x: back.x, y: back.y }, zoomTo: back.z, t0: t, dur: 1100, sx: camX, sy: camY, sz: zoom };
    }

    function updateFlight(t) {
      if (!flight) return;
      const p = clamp((t - flight.t0) / flight.dur, 0, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const tgt = flight.v ? flight.v.get(t) : flight.fixed;
      const tz = flight.v ? flight.v.zoomTo : flight.zoomTo;
      camX = flight.sx + (tgt.x - flight.sx) * e;
      camY = flight.sy + (tgt.y - flight.sy) * e;
      zoom = Math.exp(Math.log(flight.sz) + (Math.log(tz) - Math.log(flight.sz)) * e);
      if (p >= 1) {
        if (flight.v && flight.v.skin) visitView = { v: flight.v, t0: t, back: { x: flight.sx, y: flight.sy, z: flight.sz } };
        flight = null;
      }
    }

    function drawDeepSpace(t, PX, fade, inView) {
      // Asteroids (grey-brown), meteoroids, meteors (warm white) and comets (icy blue-white)
      if (fade > 0.01) {
        const hs = PX * 0.6;
        const ra = alphaFor('rock');
        if (ra > 0.01) {
          for (let i = 0; i < beltPts.length; i += 3) {
            const x = beltPts[i], y = beltPts[i + 1];
            if (!inView(x, y, 0.02)) continue;
            ctx.fillStyle = ROCK_COLS[(i / 3) % ROCK_COLS.length];
            ctx.globalAlpha = ra * beltPts[i + 2];
            ctx.beginPath(); ctx.arc(x, y, 1.8 * PX, 0, TAU); ctx.fill();
          }
          for (let i = 0; i < heatPts.length; i += 3) {
            const x = heatPts[i], y = heatPts[i + 1];
            if (!inView(x, y, 0.02)) continue;
            ctx.fillStyle = HEAT_COLS[(i / 3) % HEAT_COLS.length];
            ctx.globalAlpha = ra * 0.25;
            ctx.beginPath(); ctx.arc(x, y, 4 * PX, 0, TAU); ctx.fill();
            ctx.globalAlpha = ra;
            ctx.beginPath(); ctx.arc(x, y, 2 * PX, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        for (let i = 0; i < meteoroidPts.length; i += 3) {
          const x = meteoroidPts[i], y = meteoroidPts[i + 1];
          if (!inView(x, y, 0.01)) continue;
          ctx.fillStyle = '#d9cbb0';
          ctx.globalAlpha = fade * meteoroidPts[i + 2] * 0.6;
          ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
        }
        ctx.strokeStyle = '#ffe2b0';
        ctx.lineWidth = 1.2 * PX;
        for (const m of meteors) {
          if (!inView(m.x, m.y, m.len)) continue;
          ctx.globalAlpha = fade * 0.85;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x + Math.cos(m.ang) * m.len, m.y + Math.sin(m.ang) * m.len);
          ctx.stroke();
        }
        for (const c of comets) {
          if (!inView(c.x, c.y, c.len)) continue;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = 'rgba(207,239,255,0.5)';
          ctx.lineWidth = 1.6 * PX;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x + Math.cos(c.ang) * c.len, c.y + Math.sin(c.ang) * c.len);
          ctx.stroke();
          ctx.fillStyle = '#cfefff';
          ctx.beginPath(); ctx.arc(c.x, c.y, 2.2 * PX, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Dark matter halos (blue-violet), globular clusters (yellow-white), satellite galaxies, black holes (orange ring)
      const df = alphaFor('deep');
      if (df > 0.01) {
        for (const h of halos) {
          if (!inView(h.x, h.y, 1)) continue;
          const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 0.9);
          g.addColorStop(0, hexA('#8ea8ff', 0.16 * df));
          g.addColorStop(1, hexA('#8ea8ff', 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(h.x, h.y, 0.9, 0, TAU); ctx.fill();
          ctx.fillStyle = '#8ea8ff';
          const hs = PX * 0.7;
          for (let i = 0; i < h.pts.length; i += 3) {
            ctx.globalAlpha = df * h.pts[i + 2] * 0.35;
            ctx.fillRect(h.pts[i] - hs, h.pts[i + 1] - hs, hs * 2, hs * 2);
          }
        }
        for (const gc of globulars) {
          if (!inView(gc.x, gc.y, 0.2)) continue;
          ctx.fillStyle = '#ffe1a8';
          const hs = PX * 0.8;
          for (let i = 0; i < gc.pts.length; i += 3) {
            ctx.globalAlpha = df * gc.pts[i + 2] * 0.9;
            ctx.fillRect(gc.pts[i] - hs, gc.pts[i + 1] - hs, hs * 2, hs * 2);
          }
        }
        for (const sg of satellites) {
          if (!inView(sg.x, sg.y, 0.3)) continue;
          const g = ctx.createRadialGradient(sg.x, sg.y, 0, sg.x, sg.y, 0.22);
          g.addColorStop(0, hexA('#ffd08a', 0.16 * df));
          g.addColorStop(1, hexA('#ffd08a', 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sg.x, sg.y, 0.22, 0, TAU); ctx.fill();
          ctx.fillStyle = '#dfe9ff';
          const hs = PX * 0.7;
          for (let i = 0; i < sg.pts.length; i += 3) {
            ctx.globalAlpha = df * sg.pts[i + 2] * 0.85;
            ctx.fillRect(sg.pts[i] - hs, sg.pts[i + 1] - hs, hs * 2, hs * 2);
          }
        }
        for (const b of blackHoles) {
          if (!inView(b.x, b.y, 0.2)) continue;
          const g = ctx.createRadialGradient(b.x, b.y, 0.02, b.x, b.y, 0.14);
          g.addColorStop(0, hexA('#ffb347', 0.35 * df));
          g.addColorStop(1, hexA('#ffb347', 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(b.x, b.y, 0.14, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.arc(b.x, b.y, 0.03, 0, TAU); ctx.fill();
          ctx.strokeStyle = hexA('#ffb347', 0.95 * df);
          ctx.lineWidth = 2.2 * PX;
          ctx.beginPath(); ctx.arc(b.x, b.y, 0.036, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Exoplanet systems: each star in its own colour, with its planets in their real colours
      const ea = alphaFor('exo');
      if (ea > 0.01) {
        for (const sys of exoSystems) {
          if (!inView(sys.x, sys.y, 0.6)) continue;
          const g = ctx.createRadialGradient(sys.x, sys.y, 0, sys.x, sys.y, 0.05);
          g.addColorStop(0, hexA(sys.color, 0.5 * ea));
          g.addColorStop(1, hexA(sys.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sys.x, sys.y, 0.05, 0, TAU); ctx.fill();
          ctx.globalAlpha = ea;
          ctx.fillStyle = sys.color;
          ctx.beginPath(); ctx.arc(sys.x, sys.y, 4 * PX, 0, TAU); ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.15 * ea})`;
          ctx.lineWidth = PX * 0.8;
          for (const pl of sys.planets) {
            ctx.beginPath(); ctx.arc(sys.x, sys.y, pl.r, 0, TAU); ctx.stroke();
          }
          for (const pl of sys.planets) {
            const a = pl.ph + t * 0.000004 / Math.pow(pl.r, 1.5);
            ctx.fillStyle = pl.skin.base;
            ctx.beginPath();
            ctx.arc(sys.x + Math.cos(a) * pl.r, sys.y + Math.sin(a) * pl.r, pl.size * PX * 0.9, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawVisitLabels(t) {
      if (visitView) { drawVisitOverlay(t); return; }
      ctx.font = '500 10px "Sora", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const nameZoom = { planet: 0.25, moon: 0.6, exo: 0.35, deep: 0.4, outer: 0.4, rock: 0.9, heat: 0.9 };
      for (const v of visitables) {
        if (zoom < (nameZoom[v.kind] || 0.4)) continue;
        const a = alphaFor(v.kind);
        if (a < 0.3) continue;
        const p = v.get(t);
        const sp = toScreen(p.x, p.y);
        if (sp.x < -120 || sp.x > W + 120 || sp.y < -40 || sp.y > H + 40) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.fillText(v.name, sp.x, sp.y + 8);
      }
    }

    function drawPlanetSkin(cx, cy, R, s, t) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();

      if (s.type === 'star') {
        const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, s.base);
        g.addColorStop(1, '#3a1a00');
        ctx.fillStyle = g;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        for (let i = 0; i < 160; i++) {
          const ang = h3(i, 1, 2) * TAU + t * 0.00004 * (i % 3);
          const rr = Math.sqrt(h3(i, 3, 4)) * R * 0.92;
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, R * (0.025 + h3(i, 5, 6) * 0.03), 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = s.base;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        if (s.bands) {
          const n = s.bands.length * 3;
          const bh = (R * 2) / n;
          for (let i = 0; i < n; i++) {
            const y0 = cy - R + i * bh + bh / 2;
            ctx.strokeStyle = s.bands[i % s.bands.length];
            ctx.lineWidth = bh * 0.95;
            ctx.beginPath();
            for (let x = cx - R; x <= cx + R + 0.1; x += R * 0.05) {
              const y = y0 + Math.sin((x - cx) / R * 5 + t * 0.0002 * (i % 2 ? 1 : -1) + i) * R * 0.035;
              if (x <= cx - R) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
        if (s.spot) {
          ctx.fillStyle = 'rgba(230,140,100,0.5)';
          ctx.beginPath(); ctx.ellipse(cx + R * 0.3, cy + R * 0.22, R * 0.26, R * 0.14, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#c4553a';
          ctx.beginPath(); ctx.ellipse(cx + R * 0.3, cy + R * 0.22, R * 0.2, R * 0.1, 0, 0, TAU); ctx.fill();
        }
        if (s.type === 'heat') {
          const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.05, cx, cy, R);
          g.addColorStop(0, '#fff3c4');
          g.addColorStop(0.35, '#ffb070');
          g.addColorStop(0.7, '#e8552b');
          g.addColorStop(1, '#3a0f00');
          ctx.fillStyle = g;
          ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
          for (let i = 0; i < 16; i++) {
            const ang = h3(i, 31, 32) * TAU;
            const rr = Math.sqrt(h3(i, 33, 34)) * R * 0.85;
            const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
            ctx.strokeStyle = 'rgba(255,208,122,0.85)';
            ctx.lineWidth = R * 0.03;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang + 1.2) * R * 0.35, y + Math.sin(ang + 1.2) * R * 0.35);
            ctx.stroke();
          }
        }
        if (s.type === 'rock') {
          for (let i = 0; i < 24; i++) {
            const ang = h3(i, 7, 8) * TAU, rr = Math.sqrt(h3(i, 9, 10)) * R * 0.85;
            const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
            const cr = R * (0.025 + h3(i, 11, 12) * 0.07);
            ctx.fillStyle = 'rgba(40,25,15,0.35)';
            ctx.beginPath(); ctx.arc(x, y, cr, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = R * 0.012;
            ctx.beginPath(); ctx.arc(x + cr * 0.25, y + cr * 0.25, cr, 0, TAU); ctx.stroke();
          }
          if (s.cap) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.9, R * 0.35, R * 0.14, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.92, R * 0.3, R * 0.12, 0, 0, TAU); ctx.fill();
          }
        }
        if (s.type === 'earth') {
          for (let i = 0; i < 9; i++) {
            const ang = h3(i, 13, 14) * TAU + t * 0.00003;
            const rr = Math.sqrt(h3(i, 15, 16)) * R * 0.7;
            ctx.fillStyle = i % 2 ? 'rgba(76,175,80,0.92)' : 'rgba(141,110,63,0.92)';
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9, R * (0.12 + h3(i, 17, 18) * 0.12), R * (0.07 + h3(i, 19, 20) * 0.08), ang, 0, TAU);
            ctx.fill();
          }
          for (let i = 0; i < 7; i++) {
            const ang = h3(i, 21, 22) * TAU + t * 0.00005 * (1 + (i % 2));
            const rr = Math.sqrt(h3(i, 23, 24)) * R * 0.8;
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, R * 0.25, R * 0.07, ang * 0.5, 0, TAU); ctx.fill();
          }
        }
      }

      // Light from the upper left, darkening towards the edge
      const sh = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.1, cx, cy, R * 1.05);
      sh.addColorStop(0, 'rgba(255,255,255,0.12)');
      sh.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      sh.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = sh;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      if (s.type !== 'star') {
        ctx.strokeStyle = hexA(s.base, 0.45);
        ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.01, 0, TAU); ctx.stroke();
      }
      if (s.rings) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.25);
        ctx.scale(1, 0.3);
        const rings = [[1.25, 1.42, 'rgba(220,200,150,0.6)'], [1.48, 1.72, 'rgba(240,225,180,0.5)'], [1.8, 2.05, 'rgba(200,180,130,0.4)']];
        for (const [r0, r1, col] of rings) {
          ctx.strokeStyle = col;
          ctx.lineWidth = R * (r1 - r0);
          ctx.beginPath(); ctx.arc(0, 0, R * (r0 + r1) / 2, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawVisitOverlay(t) {
      const a = clamp((t - visitView.t0) / 700, 0, 1);
      const v = visitView.v;
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${0.92 * a})`;
      ctx.fillRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.26;
      const cx = W / 2, cy = H / 2 - R * 0.25;
      ctx.globalAlpha = a;
      drawPlanetSkin(cx, cy, R, v.skin, t);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 22px "Audiowide", "Sora", sans-serif';
      ctx.fillText(v.name, cx, cy + R + 44);
      ctx.fillStyle = '#c8c8c8';
      ctx.font = '500 13px "Sora", system-ui, sans-serif';
      ctx.fillText(fmtKm(v.km) + ' ' + v.from, cx, cy + R + 68);
      ctx.fillStyle = '#7d7d7d';
      ctx.font = '12px "Sora", system-ui, sans-serif';
      ctx.fillText('Tap anywhere to return to the galaxy', cx, cy + R + 92);
      ctx.globalAlpha = 1;
    }

    /* ---------- Camera helpers ---------- */
    function scale() { return U * zoom; }

    function toScreen(x, y) {
      const s = scale();
      return { x: W / 2 + (x - camX) * s, y: H / 2 + (y - camY) * s };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      U = Math.min(W, H) * 0.92;
      if (!zoomReady) {
        // Fit the galaxy and its neighbours (radius about 4.4 world units) inside the shorter side
        INIT_ZOOM = Math.min(0.3, (0.45 * Math.min(W, H)) / (9.0 * U));
        zoom = INIT_ZOOM;
        zoomReady = true;
      }
    }

    function zoomAt(px, py, factor) {
      const old = scale();
      const wx = camX + (px - W / 2) / old;
      const wy = camY + (py - H / 2) / old;
      zoom = clamp(zoom * factor, ZMIN, ZMAX);
      const s = scale();
      camX = wx - (px - W / 2) / s;
      camY = wy - (py - H / 2) / s;
    }

    function zoomBy(f) { zoomAt(W / 2, H / 2, f); }
    function resetView() { zoom = INIT_ZOOM; camX = 0; camY = 0; }

    // Clan view: fly straight to a closer galaxy view where the clan crests are clear
    // and the glowing (heated) asteroid belt starts to appear at the edges.
    function focusClanView() {
      flight = null; visitView = null;
      const base = (W / 2) / (0.92 * Math.min(W, H) * 2.8);   // ~2.8 world units visible across half the width
      const z = clamp(base, 0.25, 0.4);
      startReturn({ x: 0, y: 0, z }, performance.now());
    }

    // 0 = galaxy stars, 1 = crest rings, 2 = full family webs
    function levelOfDetail() {
      const cpx = CREST_R * scale();
      return cpx < 3.2 ? 0 : cpx < 9 ? 1 : 2;
    }

    function computePositions(t) {
      for (let i = 0; i < FAMILIES; i++) {
        const f = fams[i];
        const th = f.theta0 + t * 0.000012 / (0.15 + f.r);
        pos[2 * i] = Math.cos(th) * f.r + Math.sin(t * 0.0004 + f.phase) * 0.0015;
        pos[2 * i + 1] = Math.sin(th) * f.r * 0.62 + Math.cos(t * 0.0005 + f.phase) * 0.0015;
      }
    }

    function findNode(px, py) {
      if (levelOfDetail() === 0) return -1;
      const reach = CREST_R * scale() + 10;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < FAMILIES; i++) {
        const s = toScreen(pos[2 * i], pos[2 * i + 1]);
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < reach && d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    /* ---------- Clans in the galaxy ---------- */
    const CLAN_MIN = 0.035;
    let hoverClan = -1;
    function clanR() { return CREST_R; }

    function findClan(px, py) {
      if (!clanRegistry.length || alphaFor('clan') < 0.2) return -1;
      const reach = clanR() * scale() + 12;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < clanRegistry.length; i++) {
        const k = clanRegistry[i];
        const s = toScreen(k.x, k.y);
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < reach && d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    function showClanTip(i) {
      const k = clanRegistry[i];
      const sp = toScreen(k.x, k.y);
      tip.textContent = k.name + ' clan';
      tip.style.left = sp.x + 'px';
      tip.style.top = sp.y + 'px';
      tip.classList.add('show');
    }

    /* ---------- Drawing ---------- */
    function draw(t) {
      if (lastT === null) lastT = t;
      const dt = Math.min(50, t - lastT) / 1000;
      lastT = t;

      // Arrow keys pan the camera; Shift moves faster
      if (held.size) {
        const sp = (shiftHeld ? 1400 : 520) * dt / scale();
        let dx = 0, dy = 0;
        if (held.has('ArrowLeft')) dx -= 1;
        if (held.has('ArrowRight')) dx += 1;
        if (held.has('ArrowUp')) dy -= 1;
        if (held.has('ArrowDown')) dy += 1;
        camX += dx * sp;
        camY += dy * sp;
      }

      updateFlight(t);
      computePositions(t);
      const lod = levelOfDetail();
      const s = scale();
      const PX = 1 / s;                 // one CSS pixel in world units
      const hw = W / 2 / s, hh = H / 2 / s;
      const fade = Math.max(0.55, clamp((0.7 - zoom) / 0.45, 0, 1));   // outer objects fade in as you zoom out
      const inView = (x, y, r) => Math.abs(x - camX) < hw + r && Math.abs(y - camY) < hh + r;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - camX * s), dpr * (H / 2 - camY * s));

      // Background stars
      ctx.fillStyle = '#ffffff';
      const CELLW = Math.max(1.2, (2 * hw) / 40, (2 * hh) / 30);
      const gx0 = Math.floor((camX - hw) / CELLW), gx1 = Math.floor((camX + hw) / CELLW);
      const gy0 = Math.floor((camY - hh) / CELLW), gy1 = Math.floor((camY + hh) / CELLW);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let k = 0; k < 4; k++) {
            const x = (gx + hash(gx, gy, k * 4)) * CELLW;
            const y = (gy + hash(gx, gy, k * 4 + 1)) * CELLW;
            const hs = (0.4 + hash(gx, gy, k * 4 + 2) * 0.9) * PX * 0.5;
            ctx.globalAlpha = 0.2 + hash(gx, gy, k * 4 + 3) * 0.6;
            ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Named galaxies around the home galaxy
      if (fade > 0.01) {
        for (const g of galaxies) {
          if (!inView(g.cx, g.cy, g.size * 1.5)) continue;
          const halo = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.size * 1.2);
          halo.addColorStop(0, hexA(g.arm, 0.12 * fade));
          halo.addColorStop(0.6, hexA(g.arm, 0.04 * fade));
          halo.addColorStop(1, hexA(g.arm, 0));
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(g.cx, g.cy, g.size * 1.2, 0, TAU); ctx.fill();
          const gl = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.size * 0.5);
          gl.addColorStop(0, hexA(g.core, 0.5 * fade));
          gl.addColorStop(0.5, hexA(g.core, 0.14 * fade));
          gl.addColorStop(1, hexA(g.core, 0));
          ctx.fillStyle = gl;
          ctx.beginPath(); ctx.arc(g.cx, g.cy, g.size * 0.5, 0, TAU); ctx.fill();
          ctx.fillStyle = hexA('#fffdf5', 0.6 * fade);
          ctx.beginPath(); ctx.arc(g.cx, g.cy, g.size * 0.12, 0, TAU); ctx.fill();
          const p = g.pts;
          const coreR2 = (g.size * 0.3) * (g.size * 0.3);
          for (let k = 0; k < p.length; k += 3) {
            const dx = p[k] - g.cx, dy = p[k + 1] - g.cy;
            ctx.fillStyle = dx * dx + dy * dy < coreR2 ? g.core : g.arm;
            ctx.globalAlpha = fade * p[k + 2] * 0.85;
            ctx.fillRect(p[k] - PX * 0.7, p[k + 1] - PX * 0.7, PX * 1.4, PX * 1.4);
          }
          ctx.globalAlpha = 1;
        }
      }

      // Sun, all eight planets and their moons, in their real colours: visible as you zoom in
      const pfSun = alphaFor('planet');
      if (pfSun > 0.01 && inView(SUN.x, SUN.y, 1.2)) {
        ctx.strokeStyle = `rgba(255,255,255,${0.12 * pfSun})`;
        ctx.lineWidth = PX * 0.8;
        for (const p of PLANETS) {
          ctx.beginPath(); ctx.arc(SUN.x, SUN.y, p.r, 0, TAU); ctx.stroke();
        }
        const sg = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 0.08);
        sg.addColorStop(0, hexA('#ffcc66', 0.5 * pfSun));
        sg.addColorStop(1, hexA('#ffcc66', 0));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(SUN.x, SUN.y, 0.08, 0, TAU); ctx.fill();
        ctx.globalAlpha = pfSun;
        ctx.fillStyle = SOLAR_SKIN.Sun.base;
        ctx.beginPath(); ctx.arc(SUN.x, SUN.y, 6 * PX, 0, TAU); ctx.fill();
        for (const p of PLANETS) {
          const pp = planetPos(p, t);
          ctx.fillStyle = SOLAR_SKIN[p.name].base;
          ctx.beginPath(); ctx.arc(pp.x, pp.y, p.size * PX * 0.9, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Moons: each with its own orbit around its planet
      const pfMoon = alphaFor('moon');
      if (pfMoon > 0.01) {
        for (const m of MOONS) {
          const pp = planetPos(PLANETS.find((p) => p.name === m.planet), t);
          if (!inView(pp.x, pp.y, 0.2)) continue;
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * pfMoon})`;
          ctx.lineWidth = PX * 0.7;
          ctx.beginPath(); ctx.arc(pp.x, pp.y, m.r, 0, TAU); ctx.stroke();
          const mp = moonPos(m, t);
          ctx.globalAlpha = pfMoon;
          ctx.fillStyle = MOON_SKIN[m.name].base;
          ctx.beginPath(); ctx.arc(mp.x, mp.y, m.size * PX * 0.8, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Asteroids, comets, exoplanets, black holes, halos, clusters and satellite galaxies
      drawDeepSpace(t, PX, fade, inView);

      // Destiny core (centre of the home galaxy)
      const br = 0.5 + 0.5 * Math.sin(t * 0.0016);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.14);
      glow.addColorStop(0, 'rgba(255,255,255,0.35)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 9 * PX, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.2 + br * 0.25})`;
      ctx.lineWidth = PX;
      ctx.beginPath(); ctx.arc(0, 0, (16 + br * 6) * PX, 0, TAU); ctx.stroke();

      // Family webs
      for (let i = 0; i < FAMILIES; i++) {
        vis[i] = inView(pos[2 * i], pos[2 * i + 1], 0.05) ? 1 : 0;
      }

      if (lod === 0) {
        for (let i = 0; i < FAMILIES; i++) {
          if (!vis[i]) continue;
          const f = fams[i];
          ctx.fillStyle = `rgba(255,255,255,${0.4 + f.bright * 0.55})`;
          ctx.beginPath();
          ctx.arc(pos[2 * i], pos[2 * i + 1], (0.8 + f.bright * 1.2) * PX, 0, TAU);
          ctx.fill();
        }
      } else if (lod === 1) {
        ctx.lineWidth = PX;
        for (let i = 0; i < FAMILIES; i++) {
          if (!vis[i]) continue;
          const f = fams[i];
          const X = pos[2 * i], Y = pos[2 * i + 1];
          ctx.strokeStyle = `rgba(255,255,255,${0.5 + f.bright * 0.3})`;
          ctx.beginPath(); ctx.arc(X, Y, CREST_R, 0, TAU); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(X, Y, CREST_R * 0.35, 0, TAU); ctx.fill();
        }
      } else {
        ctx.lineCap = 'round';

        // Bonds between neighbouring families
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 0.9 * PX;
        ctx.beginPath();
        for (const [i, j, ph] of bonds) {
          if (!vis[i] && !vis[j]) continue;
          const ax = pos[2 * i], ay = pos[2 * i + 1], bx = pos[2 * j], by = pos[2 * j + 1];
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const sway = Math.sin(t * 0.0005 + ph) * 0.03;
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo((ax + bx) / 2 - dy / len * sway, (ay + by) / 2 + dx / len * sway, bx, by);
        }
        ctx.stroke();

        // Threads from the destiny core to the nearest families
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        for (let i = 0; i < FAMILIES; i++) {
          if (!fams[i].toCore || !vis[i]) continue;
          ctx.moveTo(0, 0);
          ctx.lineTo(pos[2 * i], pos[2 * i + 1]);
        }
        ctx.stroke();

        // Signals along the bonds
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const [i, j, ph] of bonds) {
          if (!vis[i] && !vis[j]) continue;
          const ax = pos[2 * i], ay = pos[2 * i + 1], bx = pos[2 * j], by = pos[2 * j + 1];
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const sway = Math.sin(t * 0.0005 + ph) * 0.03;
          const qx = (ax + bx) / 2 - dy / len * sway, qy = (ay + by) / 2 + dx / len * sway;
          const p = (t * 0.00009 + ph) % 1, q = 1 - p;
          ctx.beginPath();
          ctx.arc(q * q * ax + 2 * q * p * qx + p * p * bx, q * q * ay + 2 * q * p * qy + p * p * by, 1.5 * PX, 0, TAU);
          ctx.fill();
        }

        // Each visible family: its web, members and crest
        for (let i = 0; i < FAMILIES; i++) {
          if (!vis[i]) continue;
          const f = fams[i];
          const X = pos[2 * i], Y = pos[2 * i + 1];
          const m = f.members;

          for (let k = 0; k < m.length; k++) {
            const sway = Math.sin(t * 0.0009 + m[k].ph) * 0.0012;
            memBuf[2 * k] = X + m[k].ox + sway;
            memBuf[2 * k + 1] = Y + m[k].oy + sway * 0.8;
          }

          ctx.strokeStyle = 'rgba(255,255,255,0.26)';
          ctx.lineWidth = 1.1 * PX;
          ctx.beginPath();
          for (const [a, b] of f.localEdges) {
            const ax = a < 0 ? X : memBuf[2 * a], ay = a < 0 ? Y : memBuf[2 * a + 1];
            ctx.moveTo(ax, ay);
            ctx.lineTo(memBuf[2 * b], memBuf[2 * b + 1]);
          }
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          for (let k = 0; k < m.length; k++) {
            ctx.beginPath();
            ctx.arc(memBuf[2 * k], memBuf[2 * k + 1], (m[k].outer ? 4.2 : 3.4) * PX, 0, TAU);
            ctx.fill();
          }

          const breathe = 0.5 + 0.5 * Math.sin(t * 0.0016 + f.phase);
          drawCrystal(X, Y, CREST_R, f.crest, i === hoverFam, breathe, CREST_COLORS[f.crest]);
        }
      }

      // Clans added from the family trees: crests linked to the centre and to related clans
      const clanA = alphaFor('clan');
      if (clanRegistry.length && clanA > 0.01) {
        ctx.globalAlpha = clanA;
        const R = clanR();
        const find = (key) => clanRegistry.find((k) => k.key === key);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.2 * PX;
        ctx.beginPath();
        for (const k of clanRegistry) { ctx.moveTo(0, 0); ctx.lineTo(k.x, k.y); }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1 * PX;
        ctx.beginPath();
        for (const pr of clanPairs.values()) {
          const A = find(pr.a), B = find(pr.b);
          if (!A || !B) continue;
          const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
          const dx = B.x - A.x, dy = B.y - A.y;
          const len = Math.hypot(dx, dy) || 1;
          const bow = 0.12 * len;
          ctx.moveTo(A.x, A.y);
          ctx.quadraticCurveTo(mx - dy / len * bow, my + dx / len * bow, B.x, B.y);
        }
        ctx.stroke();

        clanRegistry.forEach((k, i) => {
          if (lod === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(k.x, k.y, 1.6 * PX, 0, TAU); ctx.fill();
          } else {
            const breathe = 0.5 + 0.5 * Math.sin(t * 0.0016 + i);
            drawCrystal(k.x, k.y, R, k.crest, i === hoverClan, breathe, CREST_COLORS[k.crest]);
          }
        });
      }

      ctx.globalAlpha = 1;

      // Labels, drawn in screen pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      if (clanRegistry.length && alphaFor('clan') > 0.3) {
        ctx.font = '700 12px "Sora", system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        const cr = clanR() * scale();
        for (const k of clanRegistry) {
          const sp = toScreen(k.x, k.y);
          ctx.fillText(k.name, sp.x, sp.y + cr + 8);
        }
      }

      if (zoom >= 0.35 && fade > 0.2) {
        ctx.font = '600 11px "Sora", system-ui, sans-serif';
        ctx.fillStyle = `rgba(255,255,255,${0.85 * fade})`;
        for (const g of galaxies) {
          if (!g.name || !inView(g.cx, g.cy, g.size)) continue;
          const sp = toScreen(g.cx, g.cy - g.size - 0.02);
          ctx.fillText(g.name, sp.x, sp.y);
        }
      }

      drawVisitLabels(t);

      if (lod === 2 && CREST_R * s >= 26) {
        ctx.font = '600 11px "Sora", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const cpx = CREST_R * s;
        for (let i = 0; i < FAMILIES; i++) {
          if (!vis[i]) continue;
          const sp = toScreen(pos[2 * i], pos[2 * i + 1]);
          ctx.fillText('Family ' + (i + 1), sp.x, sp.y + cpx * 1.3 + 6);
        }
      }
    }

    function showTip(i) {
      const sp = toScreen(pos[2 * i], pos[2 * i + 1]);
      tip.textContent = 'Family ' + (i + 1);
      tip.style.left = sp.x + 'px';
      tip.style.top = sp.y + 'px';
      tip.classList.add('show');
    }

    function updateHover(t) {
      hoverClan = findClan(pointer.x, pointer.y);
      hoverVisit = hoverClan >= 0 ? -1 : findVisit(pointer.x, pointer.y, t);
      hoverFam = hoverClan >= 0 || hoverVisit >= 0 ? -1 : findNode(pointer.x, pointer.y);
      canvas.style.cursor = hoverClan >= 0 || hoverVisit >= 0 || hoverFam >= 0 ? 'pointer' : 'default';
      if (hoverClan >= 0) showClanTip(hoverClan);
      else if (hoverVisit >= 0) showVisitTip(hoverVisit, t);
      else if (hoverFam >= 0) showTip(hoverFam);
      else tip.classList.remove('show');
    }

    function clearHover() { hoverFam = -1; hoverClan = -1; hoverVisit = -1; tip.classList.remove('show'); }

    function tapAt(x, y) {
      if (visitView) { const b = visitView.back; visitView = null; startReturn(b, performance.now()); return; }
      if (suppressTap) { suppressTap = false; return; }
      const ci = findClan(x, y);
      if (ci >= 0) { showGroupView('clan', clanRegistry[ci].name); return; }
      const now = performance.now();
      const vi = findVisit(x, y, now);
      if (vi >= 0) {
        const v = visitables[vi];
        startFlight(v, now);
        toast('Visiting ' + v.name + ' · ' + fmtKm(v.km) + ' ' + v.from);
        return;
      }
      const idx = findNode(x, y);
      if (idx < 0) return;
      showTip(idx);
      clearTimeout(tip._t);
      tip._t = setTimeout(() => tip.classList.remove('show'), 1600);
    }

    function isHidden() {
      return document.getElementById('homeScreen').classList.contains('hidden');
    }

    /* ---------- Input ---------- */
    canvas.addEventListener('wheel', (e) => {
      if (isHidden()) return;
      flight = null;
      visitView = null;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * 0.01));
        return;
      }
      let dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.shiftKey) { dx = (e.deltaY + e.deltaX) * unit; dy = 0; }
      camX += dx / scale();
      camY += dy / scale();
    }, { passive: false });

    canvas.addEventListener('dblclick', (e) => {
      if (isHidden()) return;
      zoomAt(e.clientX, e.clientY, 2.2);
    });

    canvas.addEventListener('pointerdown', (e) => {
      flight = null;
      visitView = null;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, camX, camY, moved: false };
        suppressTap = false;
      } else if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        dragStart = null;
        suppressTap = true;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
        pinchDist = d;
        suppressTap = true;
      } else if (touches.size === 1 && dragStart) {
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        if (Math.hypot(dx, dy) > 5) dragStart.moved = true;
        if (dragStart.moved) {
          camX = dragStart.camX - dx / scale();
          camY = dragStart.camY - dy / scale();
          suppressTap = true;
        }
      }
    });

    function endPointer(e) {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinchDist = 0;
      if (touches.size === 0) {
        dragStart = null;
      } else if (touches.size === 1) {
        const p = [...touches.values()][0];
        dragStart = { x: p.x, y: p.y, camX, camY, moved: true };
      }
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    window.addEventListener('keydown', (e) => {
      if (isHidden() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      flight = null;
      visitView = null;
      shiftHeld = e.shiftKey;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        held.add(e.key);
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(1.25);
      } else if (e.key === '-' || e.key === '_') {
        zoomBy(0.8);
      } else if (e.key === '0') {
        resetView();
      }
    });
    window.addEventListener('keyup', (e) => {
      held.delete(e.key);
      shiftHeld = e.shiftKey;
    });

    return { resize, draw, updateHover, clearHover, tapAt, zoomBy, resetView, focusClanView };
  }

  /* =========================================================
     Wiring
     ========================================================= */
  const homeCanvas = document.getElementById('homeWeb');
  const tip = document.getElementById('tip');
  const homeBg = createHomeBg(homeCanvas, tip);
  window.__homeBg = homeBg;

  function renderCurrent(t) {
    homeBg.draw(t);
  }

  function loop(t) {
    if (mode === 'home' && pointer.active) homeBg.updateHover(t);
    renderCurrent(t);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  function resizeAll() {
    homeBg.resize();
    renderCurrent(0);
  }

  window.addEventListener('resize', resizeAll);
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  });
  window.addEventListener('pointerleave', () => {
    pointer.active = false;
    homeBg.clearHover();
  });
  homeCanvas.addEventListener('click', (e) => homeBg.tapAt(e.clientX, e.clientY));

  function holdZoom(btn, factor) {
    let delay = null, repeat = null;
    const step = (f) => homeBg.zoomBy(f);
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      step(factor);
      delay = setTimeout(() => { repeat = setInterval(() => step(Math.pow(factor, 0.25)), 40); }, 250);
    });
    const end = () => { clearTimeout(delay); clearInterval(repeat); delay = repeat = null; };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', (e) => { if (e.detail === 0) step(factor); }); // keyboard activation
  }
  holdZoom(document.getElementById('zoomIn'), 1.12);
  holdZoom(document.getElementById('zoomOut'), 1 / 1.12);
  document.getElementById('zoomReset').addEventListener('click', () => homeBg.resetView());

  resizeAll();
  requestAnimationFrame(loop);

  /* ---------- Direct home entry (no login) ---------- */
  const homeScreen = document.getElementById('homeScreen');
  const hint = document.getElementById('hint');
  const addBtn = document.getElementById('addBtn');
  homeScreen.classList.remove('hidden');
  mode = 'home';
  hint.textContent = 'Drag to explore the galaxy. Ctrl + scroll or pinch to zoom between planets and deep space. Tap a planet or object to visit it. Tap a crest to open its family.';
  homeCanvas.classList.add('on');
  renderCurrent(performance.now());

  const projectScreen = document.getElementById('projectScreen');
  const projectGrid = document.getElementById('projectGrid');
  const emptyMsg = document.getElementById('emptyMsg');
  const projectModal = document.getElementById('projectModal');
  const projectForm = document.getElementById('projectForm');
  const projTitle = document.getElementById('projTitle');
  const projDesc = document.getElementById('projDesc');
  const projError = document.getElementById('projError');
  const PROJECTS_STORAGE_KEY = 'abd-family-web-projects-v1';
  function loadProjects() {
    try {
      const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) { console.warn('Could not load saved projects', err); return []; }
  }
  const projects = loadProjects();
  function persistProjects() {
    try {
      const safe = projects.map((project) => ({
        title: project.title, desc: project.desc, date: project.date, saved: !!project.saved,
        tree: project.tree ? {
          nextId: project.tree.nextId,
          people: (project.tree.people || []).map(({ img, ...person }) => person)
        } : null
      }));
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(safe));
    } catch (err) {
      console.error('Project save failed', err);
      toast('Could not save locally. Check browser storage space.');
    }
  }
  // Rebuild image objects from the saved photo data when a project is opened.
  function restoreProjectImages(project) {
    if (!project.tree || !Array.isArray(project.tree.people)) return;
    project.tree.people.forEach((person) => {
      if (person.photo && !person.img) {
        const im = new Image();
        im.onload = () => { person.img = im; };
        im.src = person.photo;
      }
    });
  }

  let openMenu = -1;

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2000);
  }

  function menuItem(label, fn, danger) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item' + (danger ? ' danger' : '');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu = -1;
      fn();
    });
    return b;
  }

  function saveProject(i) {
    projects[i].saved = true;
    persistProjects();
    renderProjects();
    toast('Project saved');
  }

  function deleteProject(i) {
    const p = projects[i];
    if (!p) return;
    askConfirm('Delete project?', '"' + p.title + '" and all its people will be removed.', () => {
      const index = projects.indexOf(p);
      if (index < 0) return;
      projects.splice(index, 1);
      rebuildClanRegistry();
      rebuildPairs();
      safePersist();
      renderProjects();
      toast('Project deleted');
    });
  }

  const ARTIFACT_URL = "https://claude.ai/artifact/AF3EGuF7rs1tzPCUSkMyJ4";

  async function getDb() {
    try {
      return window.claude ? await window.claude.use('db') : null;
    } catch (e) {
      return null;
    }
  }

  async function shareLink(link, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: link });
        toast('Shared');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied. Anyone signed in can open it.');
    } catch (err) {
      toast('Link: ' + link);
    }
  }

  // Portable read-only sharing: project data travels inside the URL fragment.
  // Viewers do not need an account or access to the owner's browser storage.
  function encodeShareData(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function shareProject(i) {
    const p = projects[i];
    const shareData = {
      format: 'abd-family-web-shared',
      version: 1,
      title: p.title,
      description: p.desc || '',
      people: (p.tree && Array.isArray(p.tree.people) ? p.tree.people : []).map((q) => ({
        id: q.id, first: q.first || '', last: q.last || '', clan: q.clan || '',
        gender: q.gender || '', status: q.status || 'living', isMe: !!q.isMe,
        links: (q.links || []).map((l) => ({ id: l.id, rel: l.rel }))
      }))
    };

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.protocol !== 'http:') {
      toast('Host this website online first to create a public HTTPS link.');
      return;
    }

    const link = location.origin + location.pathname + '#shared-data=' + encodeShareData(shareData);
    await shareLink(link, p.title);
  }

  function renderProjects() {
    projectGrid.textContent = '';
    emptyMsg.style.display = projects.length ? 'none' : 'block';
    projects.forEach((p, i) => {
      const isOpen = openMenu === i;
      const card = document.createElement('article');
      card.className = 'project-card' + (isOpen ? ' menu-open' : '');

      const top = document.createElement('div');
      top.className = 'card-top';

      const h = document.createElement('h3');
      h.textContent = p.title;

      const wrap = document.createElement('div');
      wrap.className = 'menu-wrap';

      const dots = document.createElement('button');
      dots.type = 'button';
      dots.className = 'dots-btn';
      dots.textContent = '⋮';
      dots.setAttribute('aria-label', 'Project options');
      dots.setAttribute('aria-expanded', String(isOpen));
      dots.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu = isOpen ? -1 : i;
        renderProjects();
      });

      const menu = document.createElement('div');
      menu.className = 'menu' + (isOpen ? '' : ' hidden');
      menu.addEventListener('click', (e) => e.stopPropagation());
      menu.append(
        menuItem('Rename', () => openRename(i)),
        menuItem('Save', () => saveProject(i)),
        menuItem('Share', () => shareProject(i)),
        menuItem('Settings', () => { renderProjects(); showSettings(p); }),
        menuItem('Delete', () => deleteProject(i), true)
      );

      wrap.append(dots, menu);
      top.append(h, wrap);

      const d = document.createElement('p');
      d.textContent = p.desc || 'No description yet.';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'Project ' + (i + 1) + ' · ' + p.date;
      if (p.saved) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Saved';
        meta.append(badge);
      }

      const cv = document.createElement('button');
      cv.type = 'button';
      cv.className = 'white-clay';
      cv.style.marginTop = '12px';
      cv.textContent = 'Clan view';
      cv.addEventListener('click', (e) => { e.stopPropagation(); pgFrom = 'projects'; openProjectGalaxy(p); });
      card.append(top, d, meta, cv);
      card.addEventListener('click', () => openTree(p));
      projectGrid.append(card);
    });
  }

  function openProjectModal() {
    projectForm.reset();
    projError.textContent = '';
    projectModal.classList.remove('hidden');
    setTimeout(() => projTitle.focus(), 50);
  }

  function closeProjectModal() {
    projectModal.classList.add('hidden');
  }

  function showProjects() {
    homeScreen.classList.add('hidden');
    projectScreen.classList.remove('hidden');
    projectScreen.scrollTop = 0;
    renderProjects();
  }

  function backToHome() {
    closeProjectModal();
    projectScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
  }

  projectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = projTitle.value.trim();
    if (!title) {
      projError.textContent = 'Please enter a project title.';
      projTitle.focus();
      return;
    }
    projects.push({ title, desc: projDesc.value.trim(), date: new Date().toLocaleDateString(), tree: null });
    persistProjects();
    closeProjectModal();
    openTree(projects[projects.length - 1]);
  });

  /* ----- Family tree logic ----- */
  /* ----- Languages for the family web ----- */
  const LANGS = [
    { code: 'en', name: 'English' },
    { code: 'ta', name: 'தமிழ்' },
    { code: 'ml', name: 'മലയാളം' },
    { code: 'ar', name: 'العربية' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文 (Mandarin)' }
  ];
  const I18N = {
    en: { rel_Father: 'Father', rel_Mother: 'Mother', rel_Sibling: 'Sibling', rel_Friend: 'Friend', rel_Spouse: 'Spouse', rel_Child: 'Child', rel_Other: 'Other',
      male: 'Male', female: 'Female', living: 'Living', deceased: 'Deceased', clan: 'clan', born: 'Born', me: 'me',
      addRelative: 'Add relative', modify: 'Modify', deleteBtn: 'Delete', close: 'Close', addPerson: '+ Add person', back: 'Back',
      language: 'Language', thread: 'thread', threads: 'threads',
      hint_full: 'Drag a person to move them, or drag the background to look around. Scroll or pinch to zoom. Tap someone to see their details.',
      hint_empty: 'Add yourself (me) to start your family web.' },
    ta: { rel_Father: 'அப்பா', rel_Mother: 'அம்மா', rel_Sibling: 'உடன்பிறப்பு', rel_Friend: 'நண்பர்', rel_Spouse: 'வாழ்க்கைத் துணை', rel_Child: 'குழந்தை', rel_Other: 'மற்றவை',
      male: 'ஆண்', female: 'பெண்', living: 'உயிருடன்', deceased: 'மறைந்தவர்', clan: 'வம்சம்', born: 'பிறப்பு', me: 'நான்',
      addRelative: 'உறவினரைச் சேர்', modify: 'திருத்து', deleteBtn: 'நீக்கு', close: 'மூடு', addPerson: '+ நபரைச் சேர்', back: 'பின்',
      language: 'மொழி', thread: 'இணைப்பு', threads: 'இணைப்புகள்',
      hint_full: 'ஒருவரை இழுத்து நகர்த்தலாம். பின்னணியை இழுத்து சுற்றிப் பார்க்கலாம். ஸ்க்ரோல் அல்லது பிஞ்ச் செய்து பெரிதாக்கலாம். விவரம் காண தட்டவும்.',
      hint_empty: 'உங்கள் குடும்ப வலையைத் தொடங்க உங்களைச் (நான்) சேர்க்கவும்.' },
    ml: { rel_Father: 'അച്ഛൻ', rel_Mother: 'അമ്മ', rel_Sibling: 'സഹോദരൻ/സഹോദരി', rel_Friend: 'സുഹൃത്ത്', rel_Spouse: 'ജീവിതപങ്കാളി', rel_Child: 'മകൻ/മകൾ', rel_Other: 'മറ്റുള്ളവ',
      male: 'പുരുഷൻ', female: 'സ്ത്രീ', living: 'ജീവിച്ചിരിക്കുന്നു', deceased: 'മരിച്ചു', clan: 'കുലം', born: 'ജനനം', me: 'ഞാൻ',
      addRelative: 'ബന്ധുവിനെ ചേർക്കുക', modify: 'മാറ്റുക', deleteBtn: 'ഇല്ലാതാക്കുക', close: 'അടയ്ക്കുക', addPerson: '+ ആളെ ചേർക്കുക', back: 'തിരികെ',
      language: 'ഭാഷ', thread: 'ബന്ധം', threads: 'ബന്ധങ്ങൾ',
      hint_full: 'ഒരാളെ വലിച്ചു നീക്കാം. പശ്ചാത്തലം വലിച്ചു ചുറ്റും നോക്കാം. സ്ക്രോൾ അല്ലെങ്കിൽ പിഞ്ച് ചെയ്ത് സൂം ചെയ്യാം. വിവരങ്ങൾ കാണാൻ തൊടുക.',
      hint_empty: 'കുടുംബ വല തുടങ്ങാൻ നിങ്ങളെ (ഞാൻ) ചേർക്കുക.' },
    ar: { rel_Father: 'الأب', rel_Mother: 'الأم', rel_Sibling: 'أخ/أخت', rel_Friend: 'صديق', rel_Spouse: 'زوج/زوجة', rel_Child: 'ابن/ابنة', rel_Other: 'أخرى',
      male: 'ذكر', female: 'أنثى', living: 'على قيد الحياة', deceased: 'متوفى', clan: 'عشيرة', born: 'تاريخ الميلاد', me: 'أنا',
      addRelative: 'إضافة قريب', modify: 'تعديل', deleteBtn: 'حذف', close: 'إغلاق', addPerson: '+ إضافة شخص', back: 'رجوع',
      language: 'اللغة', thread: 'رابط', threads: 'روابط',
      hint_full: 'اسحب الشخص لتحريكه، أو اسحب الخلفية للتجول. قرّب بالتمرير أو بالقرص. اضغط على الشخص لعرض التفاصيل.',
      hint_empty: 'أضف نفسك (أنا) لبدء شبكة العائلة.' },
    hi: { rel_Father: 'पिता', rel_Mother: 'माता', rel_Sibling: 'भाई/बहन', rel_Friend: 'मित्र', rel_Spouse: 'जीवनसाथी', rel_Child: 'संतान', rel_Other: 'अन्य',
      male: 'पुरुष', female: 'महिला', living: 'जीवित', deceased: 'मृत', clan: 'कुल', born: 'जन्म', me: 'मैं',
      addRelative: 'रिश्तेदार जोड़ें', modify: 'बदलें', deleteBtn: 'हटाएं', close: 'बंद करें', addPerson: '+ व्यक्ति जोड़ें', back: 'वापस',
      language: 'भाषा', thread: 'कड़ी', threads: 'कड़ियाँ',
      hint_full: 'किसी व्यक्ति को खींचकर हिलाएँ, या पृष्ठभूमि खींचकर देखें। स्क्रोल या पिंच करके ज़ूम करें। विवरण के लिए टैप करें।',
      hint_empty: 'अपनी पारिवारिक कड़ी शुरू करने के लिए खुद को (मैं) जोड़ें।' },
    ja: { rel_Father: '父', rel_Mother: '母', rel_Sibling: '兄弟姉妹', rel_Friend: '友人', rel_Spouse: '配偶者', rel_Child: '子', rel_Other: 'その他',
      male: '男性', female: '女性', living: '存命', deceased: '死去', clan: '一族', born: '生年月日', me: '自分',
      addRelative: '親族を追加', modify: '編集', deleteBtn: '削除', close: '閉じる', addPerson: '+ 人物を追加', back: '戻る',
      language: '言語', thread: '関係', threads: '関係',
      hint_full: '人物をドラッグして移動、背景をドラッグして見回せます。スクロールまたはピンチで拡大縮小。タップで詳細を表示します。',
      hint_empty: '家系図を始めるために、自分（me）を追加してください。' },
    zh: { rel_Father: '父亲', rel_Mother: '母亲', rel_Sibling: '兄弟姐妹', rel_Friend: '朋友', rel_Spouse: '配偶', rel_Child: '子女', rel_Other: '其他',
      male: '男', female: '女', living: '在世', deceased: '已故', clan: '宗族', born: '出生', me: '我',
      addRelative: '添加亲属', modify: '修改', deleteBtn: '删除', close: '关闭', addPerson: '+ 添加成员', back: '返回',
      language: '语言', thread: '关系线', threads: '关系线',
      hint_full: '拖动人物可移动，拖动背景可环视。滚动或捏合可缩放。点击人物查看详情。',
      hint_empty: '添加你自己（我）开始你的家族网络。' }
  };
  let lang = 'en';
  const T = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  const TR_REL = (rel) => {
    const k = 'rel_' + rel;
    return (I18N[lang] && I18N[lang][k]) || I18N.en[k] ? T(k) : rel;
  };

  const OTHER_LANGS = LANGS.filter((l) => l.code !== 'en');
  function personName(p) {
    return (p.localNames && p.localNames[lang]) || (p.first + ' ' + p.last);
  }
  function clanName(name) {
    const c = clanRegistry.find((k) => k.key === String(name || '').trim().toLowerCase());
    return (c && c.localNames && c.localNames[lang]) || name;
  }
  function collectLocalNames() {
    const out = {};
    OTHER_LANGS.forEach((l) => {
      const v = (document.getElementById('lnName_' + l.code) || {}).value;
      if (v && v.trim()) out[l.code] = v.trim();
    });
    return out;
  }
  function collectClanLocal() {
    const out = {};
    OTHER_LANGS.forEach((l) => {
      const v = (document.getElementById('lnClan_' + l.code) || {}).value;
      if (v && v.trim()) out[l.code] = v.trim();
    });
    return out;
  }
  function applyClanLocal(clan) {
    if (!clan) return;
    const loc = collectClanLocal();
    if (Object.keys(loc).length) clan.localNames = Object.assign({}, clan.localNames || {}, loc);
  }
  // One row per language in the add-person form: person name and clan name
  function buildLocalNameRows() {
    const box = document.getElementById('localNameRows');
    if (!box) return;
    OTHER_LANGS.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'local-name-row';
      const tag = document.createElement('span');
      tag.className = 'local-tag';
      tag.textContent = l.name;
      const n = document.createElement('input');
      n.className = 'input';
      n.id = 'lnName_' + l.code;
      n.type = 'text';
      n.placeholder = 'Name';
      n.autocomplete = 'off';
      const c = document.createElement('input');
      c.className = 'input';
      c.id = 'lnClan_' + l.code;
      c.type = 'text';
      c.placeholder = 'Clan';
      c.autocomplete = 'off';
      row.append(tag, n, c);
      box.append(row);
    });
  }

  const CLANS = ['Moon', 'Thunder', 'Sun', 'Blade', 'Flame', 'Gem', 'Crown', 'Eye', 'Feather'];
  const NODE_R = 30;
  const RELATIONS = ['Father', 'Mother', 'Sibling', 'Friend', 'Spouse', 'Child', 'Other'];
  const treeScreen = document.getElementById('treeScreen');
  const treeCanvas = document.getElementById('treeCanvas');
  const tctx = treeCanvas.getContext('2d');
  const treeTitle = document.getElementById('treeTitle');
  const treeHint = document.getElementById('treeHint');
  const personCard = document.getElementById('personCard');
  const personModal = document.getElementById('personModal');
  const personForm = document.getElementById('personForm');
  const pFirst = document.getElementById('pFirst');
  const pLast = document.getElementById('pLast');
  const pDob = document.getElementById('pDob');
  const pClan = document.getElementById('pClan');
  const pLinks = document.getElementById('pLinks');
  const linkGroup = document.getElementById('linkGroup');
  const pPreview = document.getElementById('pPreview');
  const pPlaceholder = document.getElementById('pPlaceholder');
  const pError = document.getElementById('pError');
  const pModalTitle = document.getElementById('pModalTitle');
  const pGalleryInput = document.getElementById('pGalleryInput');
  const pFileInput = document.getElementById('pFileInput');
  const clanList = document.getElementById('clanList');

  CLANS.forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c + ' clan';
    pClan.append(o);
  });

  buildLocalNameRows();
  let treeProject = null;
  let pendingPhoto = null;
  let pendingIsMe = false;
  let editingPersonId = null;
  let selectedId = null;
  const tv = { W: 0, H: 0, dpr: 1, zoom: 1, camX: 0, camY: 0 };
  const ttouches = new Map();
  let tPinch = 0;
  let tDrag = null;       // { kind: 'node' | 'pan', ... }
  let tMoved = false;

  function people() { return treeProject ? treeProject.tree.people : []; }
  function personById(id) { return people().find((p) => p.id === id); }

  function treeResize() {
    tv.dpr = Math.min(window.devicePixelRatio || 1, 2);
    tv.W = window.innerWidth;
    tv.H = window.innerHeight;
    treeCanvas.width = tv.W * tv.dpr;
    treeCanvas.height = tv.H * tv.dpr;
  }
  window.addEventListener('resize', treeResize);

  function toWorld(sx, sy) {
    return { x: (sx - tv.W / 2) / tv.zoom + tv.camX, y: (sy - tv.H / 2) / tv.zoom + tv.camY };
  }

  function zoomTreeAt(px, py, factor) {
    const before = toWorld(px, py);
    tv.zoom = Math.min(4, Math.max(0.06, tv.zoom * factor));
    tv.camX = before.x - (px - tv.W / 2) / tv.zoom;
    tv.camY = before.y - (py - tv.H / 2) / tv.zoom;
  }

  function personAt(sx, sy) {
    const w = toWorld(sx, sy);
    const list = people();
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (Math.hypot(w.x - p.x, w.y - p.y) < NODE_R + 8 / tv.zoom) return p;
    }
    return null;
  }

  // Place a new person near the first person they connect to, away from others
  function layoutNew(links) {
    if (!links.length) return { x: 0, y: 0 };
    const base = personById(links[0].id);
    let a = Math.hypot(base.x, base.y) < 1
      ? Math.random() * Math.PI * 2
      : Math.atan2(base.y, base.x) + (Math.random() - 0.5) * 1.6;
    const d = 160 + Math.random() * 40;
    let x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d;
    for (let k = 0; k < 24; k++) {
      if (!people().some((q) => Math.hypot(q.x - x, q.y - y) < NODE_R * 3.2)) break;
      a += 0.45;
      x = base.x + Math.cos(a) * d;
      y = base.y + Math.sin(a) * d;
    }
    return { x, y };
  }

  /* ----- Auto family links: spouses share their children -----
     A link on a person means "this person is <rel> of that person".
     Child of P:  child.links has { id: P, rel: 'Child' }   Parent of Q: parent.links has { id: Q, rel: 'Father' | 'Mother' } */
  function linkedAny(a, b) {
    return a.links.some((l) => l.id === b.id) || b.links.some((l) => l.id === a.id);
  }
  function spousesOf(x) {
    return people().filter((q) => q.id !== x.id && (
      x.links.some((l) => l.id === q.id && l.rel === 'Spouse') ||
      q.links.some((l) => l.id === x.id && l.rel === 'Spouse')));
  }
  function parentsOf(x) {
    return people().filter((q) => q.id !== x.id && (
      x.links.some((l) => l.id === q.id && l.rel === 'Child') ||
      q.links.some((l) => l.id === x.id && (l.rel === 'Father' || l.rel === 'Mother'))));
  }
  function childrenOf(x) {
    return people().filter((q) => q.id !== x.id && parentsOf(q).some((pp) => pp.id === x.id));
  }
  // Run after a person is added or modified. Returns the people whose links changed.
  function autoSpouseChildren(x) {
    const changed = new Set();
    const addChild = (child, parent) => {
      if (!child || !parent || child.id === parent.id || linkedAny(child, parent)) return;
      child.links.push({ id: parent.id, rel: 'Child' });
      changed.add(child);
    };
    // x is a child: it is also the child of its parent's spouse (only when that parent has one spouse)
    parentsOf(x).forEach((par) => {
      const sp = spousesOf(par);
      if (sp.length === 1) addChild(x, sp[0]);
    });
    // x is a parent: its children are also children of x's spouse (only when x has one spouse)
    const mySp = spousesOf(x);
    if (mySp.length === 1) childrenOf(x).forEach((c) => addChild(c, mySp[0]));
    // x has a spouse: children with only one parent so far get the other partner as their second parent
    mySp.forEach((sp) => {
      childrenOf(x).forEach((c) => { if (parentsOf(c).length === 1) addChild(c, sp); });
      childrenOf(sp).forEach((c) => { if (parentsOf(c).length === 1) addChild(c, x); });
    });
    changed.delete(x);
    return [...changed];
  }

  function applyTreeLabels() {
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('treeBackBtn', T('back'));
    set('addPersonBtn', T('addPerson'));
    set('pcAddRelative', T('addRelative'));
    set('pcDelete', T('deleteBtn'));
    set('pcModify', T('modify'));
    set('pcClose', T('close'));
    document.getElementById('langBtn').setAttribute('aria-label', T('language'));
    treeHint.textContent = people().length ? T('hint_full') : T('hint_empty');
  }

  function updateTreeHint() {
    applyTreeLabels();
  }

  function legacyTreeHint() {
    treeHint.textContent = people().length
      ? 'Drag a person to move them, or drag the background to look around. Scroll or pinch to zoom. Tap someone to view and modify their details.'
      : 'Add yourself (me) to start your family web.';
  }

  function titleCaseWords(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase().replace(/(^|[\s'-])([\p{L}])/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase());
  }

  function buildPersonLinkRows(personBeingEdited = null, onlyPerson = null, presetRel = null) {
    pLinks.textContent = '';
    (onlyPerson ? [onlyPerson] : people().filter(p => !personBeingEdited || p.id !== personBeingEdited.id)).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'link-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = p.id;
      const oldLink = personBeingEdited?.links?.find(l => l.id === p.id);
      cb.checked = oldLink ? true : (onlyPerson ? true : (!personBeingEdited && p.isMe));
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = p.first + ' ' + p.last + (p.isMe ? ' (me)' : '');
      const sel = document.createElement('select');
      sel.className = 'rel-select';
      sel.setAttribute('aria-label', 'Relation to ' + p.first);
      RELATIONS.forEach((r) => { const o = document.createElement('option'); o.value = r; o.textContent = TR_REL(r); sel.append(o); });
      const txt = document.createElement('input');
      txt.type = 'text'; txt.className = 'input rel-text';
      txt.placeholder = 'Describe the relation (e.g. Cousin, Uncle, Godparent)'; txt.maxLength = 40;
      const isCustom = oldLink && !RELATIONS.includes(oldLink.rel);
      sel.value = isCustom ? 'Other' : (oldLink?.rel || presetRel || 'Friend');
      txt.value = isCustom ? oldLink.rel : '';
      txt.classList.toggle('is-hidden', sel.value !== 'Other');
      sel.addEventListener('change', () => txt.classList.toggle('is-hidden', sel.value !== 'Other'));
      row.append(cb, who, sel, txt); pLinks.append(row);
    });
  }

  function openPersonModal(isMe, personBeingEdited = null, onlyPerson = null, presetRel = null) {
    editingPersonId = personBeingEdited ? personBeingEdited.id : null;
    pendingIsMe = personBeingEdited ? !!personBeingEdited.isMe : isMe;
    pendingPhoto = null;
    personForm.reset();
    pPreview.src = '';
    pPreview.classList.add('is-hidden');
    pPlaceholder.classList.remove('is-hidden');
    pError.textContent = '';
    clanList.textContent = '';
    clanRegistry.forEach((c) => { const o = document.createElement('option'); o.value = c.name; clanList.append(o); });
    pModalTitle.textContent = personBeingEdited ? 'Modify person' : (onlyPerson ? 'Add relative of ' + onlyPerson.first : (isMe ? 'Add yourself (me)' : 'Add family or friend'));
    linkGroup.classList.toggle('is-hidden', pendingIsMe && !personBeingEdited);
    buildPersonLinkRows(personBeingEdited, onlyPerson, presetRel);
    if (personBeingEdited) {
      pFirst.value = personBeingEdited.first;
      pLast.value = personBeingEdited.last;
      pDob.value = personBeingEdited.dob || '';
      const clanRec = clanRegistry.find((k) => k.key === String(personBeingEdited.clan || '').toLowerCase());
      OTHER_LANGS.forEach((l) => {
        const pn = document.getElementById('lnName_' + l.code), pc = document.getElementById('lnClan_' + l.code);
        if (pn) pn.value = (personBeingEdited.localNames || {})[l.code] || '';
        if (pc) pc.value = (clanRec && clanRec.localNames && clanRec.localNames[l.code]) || '';
      });
      pClan.value = personBeingEdited.clan;
      const gender = personForm.querySelector('input[name="gender"][value="' + personBeingEdited.gender + '"]');
      const status = personForm.querySelector('input[name="status"][value="' + personBeingEdited.status + '"]');
      if (gender) gender.checked = true;
      if (status) status.checked = true;
      if (personBeingEdited.photo) { pPreview.src = personBeingEdited.photo; pPreview.classList.remove('is-hidden'); pPlaceholder.classList.add('is-hidden'); }
    }
    personModal.classList.remove('hidden');
    setTimeout(() => pFirst.focus(), 50);
  }

  function closePersonModal() {
    personModal.classList.add('hidden');
  }

  function setPhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingPhoto = String(reader.result || '');
      pPreview.src = pendingPhoto;
      pPreview.classList.remove('is-hidden');
      pPlaceholder.classList.add('is-hidden');
    };
    reader.onerror = () => { pError.textContent = 'Could not read this photo. Please try another file.'; };
    reader.readAsDataURL(file);
  }

  pGalleryInput.addEventListener('change', (e) => setPhoto(e.target.files[0]));
  pFileInput.addEventListener('change', (e) => setPhoto(e.target.files[0]));
  document.getElementById('galleryBtn').addEventListener('click', () => { pGalleryInput.value = ''; pGalleryInput.click(); });
  document.getElementById('fileBtn').addEventListener('click', () => { pFileInput.value = ''; pFileInput.click(); });
  document.getElementById('pCancel').addEventListener('click', () => { editingPersonId = null; closePersonModal(); });
  pLinks.addEventListener('change', () => linkGroup.classList.remove('needs-link'));
  [pFirst, pLast, pClan].forEach(input => input.addEventListener('input', () => { const a = input.selectionStart, b = input.selectionEnd; input.value = titleCaseWords(input.value); try { input.setSelectionRange(a, b); } catch (_) {} }));
  personModal.addEventListener('click', (e) => { if (e.target === personModal) closePersonModal(); });

  personForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const first = titleCaseWords(pFirst.value);
    const last = titleCaseWords(pLast.value);
    const clan = titleCaseWords(pClan.value);
    const gender = personForm.elements.gender.value;
    const status = personForm.elements.status.value;
    const dob = pDob.value || '';
    if (dob && dob > new Date().toISOString().slice(0, 10)) { pError.textContent = 'Date of birth cannot be in the future.'; return; }
    const rows = [...pLinks.querySelectorAll('.link-row')].filter(r => r.querySelector('input[type=checkbox]').checked);
    if (rows.some(r => r.querySelector('select').value === 'Other' && !r.querySelector('.rel-text').value.trim())) {
      pError.textContent = 'Describe the "Other" relation in the text box.'; return;
    }
    const links = rows.map(r => ({ id:Number(r.querySelector('input[type=checkbox]').value), rel:r.querySelector('select').value === 'Other' ? r.querySelector('.rel-text').value.trim() : r.querySelector('select').value }));
    if (!first || !last) { pError.textContent = 'Please enter the first and last name.'; return; }
    if (!clan) { pError.textContent = 'Please type a clan name.'; return; }
    if (!gender) { pError.textContent = 'Please choose male or female.'; return; }
    if (!status) { pError.textContent = 'Please choose living or deceased.'; return; }
    const otherPeople = people().some((q) => !editingPersonId || q.id !== editingPersonId);
    if (otherPeople && !links.length) {
      pError.textContent = 'Connection is required: tick at least one family member or friend and choose their relation.';
      linkGroup.classList.add('needs-link');
      linkGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const t = treeProject.tree;
    const editing = editingPersonId !== null ? personById(editingPersonId) : null;
    if (editing) {
      editing.first = first; editing.last = last; editing.clan = clan;
      editing.gender = gender; editing.status = status; editing.dob = dob; editing.links = links;
      editing.localNames = collectLocalNames();
      const linksBefore = editing.links.length;
      const autoEdited = autoSpouseChildren(editing);
      const autoSelf = editing.links.length - linksBefore;
      if (pendingPhoto) editing.photo = pendingPhoto;
      if (pendingPhoto) { editing.img = null; const im = new Image(); im.onload = () => { editing.img = im; }; im.src = pendingPhoto; }
      else if (editing.photo && !editing.img) { const im = new Image(); im.onload = () => { editing.img = im; }; im.src = editing.photo; }
      rebuildClanRegistry();
      applyClanLocal(clanRegistry.find((k) => k.key === clan.toLowerCase()));
      persistProjects(); histPush();
      selectedId = editing.id;
      closePersonModal(); updateTreeHint(); showPersonCard(editing);
      toast(autoEdited.length || autoSelf > 0 ? 'Person updated. Spouse and children linked automatically' : 'Person details updated');
      editingPersonId = null;
      return;
    }

    const pos = pendingIsMe ? {x:0,y:0} : layoutNew(links);
    const person = { id:t.nextId++, first, last, clan, gender, status, dob, localNames: collectLocalNames(), photo:pendingPhoto, img:null, x:pos.x, y:pos.y, links, isMe:pendingIsMe };
    if (pendingPhoto) { const im = new Image(); im.onload = () => { person.img = im; }; im.src = pendingPhoto; }
    t.people.push(person);
    const before = person.links.length;
    const autoChanged = autoSpouseChildren(person);
    const autoAdded = (person.links.length - before) + autoChanged.length;
    const reg = registerClan(clan, person, treeProject);
    person.clan = reg.clan.name;
    applyClanLocal(reg.clan);
    recordClanPairs(person, treeProject);
    autoChanged.forEach((q) => recordClanPairs(q, treeProject));
    persistProjects(); histPush();
    selectedId = person.id; closePersonModal(); updateTreeHint();
    if (autoAdded > 0) { toast('Spouse and children linked automatically (' + autoAdded + ' thread' + (autoAdded > 1 ? 's' : '') + ' added)'); return; }
    toast(reg.isNew ? 'Clan "' + reg.clan.name + '" added to the galaxy' : (pendingIsMe ? 'You are the first thread of the web' : 'Connected to the web'));
  });

  const INVERSE_REL = { Father: 'Child', Mother: 'Child', Child: 'Parent', Spouse: 'Spouse', Sibling: 'Sibling', Friend: 'Friend', Other: 'Other' };
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || 'th');
  };

  // Everyone related to this person, labelled from this person's point of view
  function relativesOf(p) {
    const out = [];
    people().forEach((q) => {
      q.links.forEach((l) => {
        if (l.id === p.id) out.push({ label: TR_REL(l.rel), rel: l.rel, person: q }); // q is l.rel of p
      });
    });
    p.links.forEach((l) => {
      const q = personById(l.id);
      if (q) {
        // A parent is shown as Father or Mother, by their gender
        const inv = l.rel === 'Child' ? (q.gender === 'female' ? 'Mother' : 'Father') : (INVERSE_REL[l.rel] || l.rel);
        out.push({ label: TR_REL(inv), rel: inv, person: q }); // p is l.rel of q
      }
    });
    const count = {};
    out.forEach((r) => { count[r.rel] = (count[r.rel] || 0) + 1; });
    const seen = {};
    return out.map((r) => {
      seen[r.rel] = (seen[r.rel] || 0) + 1;
      const num = count[r.rel] > 1 ? ordinal(seen[r.rel]) + ' ' : '';
      return { label: num + r.label, name: personName(r.person), id: r.person.id, rel: r.rel };
    });
  }

  // Numbers repeated relations: "1st spouse", "2nd spouse"
  function numbered(list) {
    const total = {}, seen = {};
    list.forEach((r) => { total[r.label] = (total[r.label] || 0) + 1; });
    return list.map((r) => {
      seen[r.label] = (seen[r.label] || 0) + 1;
      return { label: total[r.label] > 1 ? ordinal(seen[r.label]) + ' ' + r.label : r.label, name: r.name };
    });
  }

  // Linked by: people who connected to this person, with the relation they chose
  // Connected to: people this person connected to, with the relation from this person's side
  function linkGroups(p) {
    const linkedBy = [], connectedTo = [];
    people().forEach((q) => {
      q.links.forEach((l) => {
        if (l.id === p.id) linkedBy.push({ label: TR_REL(l.rel), name: personName(q) });
      });
    });
    p.links.forEach((l) => {
      const q = personById(l.id);
      if (q) connectedTo.push({ label: TR_REL(INVERSE_REL[l.rel] || l.rel), name: personName(q) });
    });
    return { linkedBy, connectedTo };
  }

  function showPersonCard(p) {
    const connections = p.links.length + people().filter((q) => q.links.some((l) => l.id === p.id)).length;
    const relList = document.getElementById('pcRelList');
    relList.textContent = '';
    const addRow = (label, name) => {
      const row = document.createElement('div');
      row.className = 'pc-rel-row';
      const lab = document.createElement('span');
      lab.className = 'pc-rel-label';
      lab.textContent = label;
      const nm = document.createElement('span');
      nm.className = 'pc-rel-name';
      nm.textContent = name;
      row.append(lab, nm);
      relList.append(row);
    };
    const rels = relativesOf(p);
    if (!rels.length) {
      const none = document.createElement('p');
      none.className = 'pc-rel-empty';
      none.textContent = 'No relatives connected yet.';
      relList.append(none);
    }
    // Father, Mother, Spouse, Child, Sibling, then the rest
    const rank = { Father: 0, Mother: 1, Spouse: 2, Child: 3, Sibling: 4, Friend: 5, Other: 6, Parent: 0 };
    rels.slice().sort((a, b) => (rank[a.rel] ?? 6) - (rank[b.rel] ?? 6))
      .forEach((r) => addRow(r.label, r.name));
    document.getElementById('pcName').textContent = personName(p) + (p.isMe ? ' (' + T('me') + ')' : '');
    document.getElementById('pcInfo').textContent =
      clanName(p.clan) + ' ' + T('clan') + ' · ' + (p.gender === 'male' ? T('male') : T('female')) + ' · ' +
      (p.status === 'deceased' ? T('deceased') : T('living')) + ' · ' +
      (p.dob ? T('born') + ' ' + p.dob + ' · ' : '') +
      connections + ' ' + (connections === 1 ? T('thread') : T('threads'));
    personCard.classList.add('show');
  }

  document.getElementById('pcClose').addEventListener('click', () => personCard.classList.remove('show'));
  // Relation popup: Parents, Spouse, Child, Sibling; each opens the add relative form
  const relPickModal = document.getElementById('relPickModal');
  const RELATIVE_CHOICES = [
    { label: 'Parents', rel: 'Father' },
    { label: TR_REL('Spouse'), rel: 'Spouse' },
    { label: TR_REL('Child'), rel: 'Child' },
    { label: TR_REL('Sibling'), rel: 'Sibling' },
    { label: TR_REL('Friend'), rel: 'Friend' }
  ];
  function openRelPick(p) {
    const list = document.getElementById('relPickList');
    list.textContent = '';
    RELATIVE_CHOICES.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'white-clay';
      b.style.width = '100%';
      b.textContent = c.label;
      b.addEventListener('click', () => {
        relPickModal.classList.add('hidden');
        personCard.classList.remove('show');
        openPersonModal(false, null, p, c.rel);
      });
      list.append(b);
    });
    relPickModal.classList.remove('hidden');
  }
  document.getElementById('relPickClose').addEventListener('click', () => relPickModal.classList.add('hidden'));
  relPickModal.addEventListener('click', (e) => { if (e.target === relPickModal) relPickModal.classList.add('hidden'); });
  document.getElementById('pcAddRelative').addEventListener('click', () => {
    const p = personById(selectedId);
    if (p) openRelPick(p);
  });
  document.getElementById('pcModify').addEventListener('click', () => { const p = personById(selectedId); if (p) { personCard.classList.remove('show'); openPersonModal(false, p); } });
  document.getElementById('addPersonBtn').addEventListener('click', () => openPersonModal(people().length === 0));
  document.getElementById('treeBackBtn').addEventListener('click', closeTree);

  function openTree(p) {
    treeProject = p;
    restoreProjectImages(p);
    if (!p.tree) p.tree = { people: [], nextId: 1 };
    histReset(); exitFocus();
    treeTitle.textContent = p.title;
    projectScreen.classList.add('hidden');
    treeScreen.classList.remove('hidden');
    treeResize();
    tv.zoom = 1; tv.camX = 0; tv.camY = 0;
    selectedId = null;
    personCard.classList.remove('show');
    updateTreeHint();
    if (!p.tree.people.length) openPersonModal(true);
  }

  function closeTree() {
    exitFocus();
    closePersonModal();
    personCard.classList.remove('show');
    treeScreen.classList.add('hidden');
    projectScreen.classList.remove('hidden');
    renderProjects();
  }

  // Pointer input: drag a person, drag the background to pan, pinch or wheel to zoom
  treeCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTreeAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  treeCanvas.addEventListener('pointerdown', (e) => {
    ttouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ttouches.size === 1) {
      tMoved = false;
      const hit = personAt(e.clientX, e.clientY);
      tDrag = hit
        ? { kind: 'node', id: hit.id, x0: e.clientX, y0: e.clientY }
        : { kind: 'pan', x0: e.clientX, y0: e.clientY, camX: tv.camX, camY: tv.camY };
    } else if (ttouches.size === 2) {
      const [a, b] = [...ttouches.values()];
      tPinch = Math.hypot(a.x - b.x, a.y - b.y);
      tDrag = null;
      tMoved = true;
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!ttouches.has(e.pointerId)) return;
    ttouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ttouches.size === 2) {
      const [a, b] = [...ttouches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (tPinch > 0) zoomTreeAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / tPinch);
      tPinch = d;
      return;
    }
    if (!tDrag) return;
    const dx = e.clientX - tDrag.x0, dy = e.clientY - tDrag.y0;
    if (Math.hypot(dx, dy) > 5) tMoved = true;
    if (!tMoved) return;
    if (tDrag.kind === 'node') {
      const p = personById(tDrag.id);
      const w = toWorld(e.clientX, e.clientY);
      if (p) { p.x = w.x; p.y = w.y; }
    } else {
      tv.camX = tDrag.camX - dx / tv.zoom;
      tv.camY = tDrag.camY - dy / tv.zoom;
    }
  });

  function endTreePointer(e) {
    if (!ttouches.has(e.pointerId)) return;
    const wasSingle = ttouches.size === 1;
    ttouches.delete(e.pointerId);
    if (ttouches.size < 2) tPinch = 0;
    if (wasSingle && !tMoved && e.type === 'pointerup') {
      const hit = personAt(e.clientX, e.clientY);
      if (hit) { selectedId = hit.id; showPersonCard(hit); }
      else personCard.classList.remove('show');
    }
    if (ttouches.size === 0) { if (tMoved && treeProject) { persistProjects(); if (tDrag && tDrag.kind === 'node') histPush(); } tDrag = null; tMoved = false; }
  }
  window.addEventListener('pointerup', endTreePointer);
  window.addEventListener('pointercancel', endTreePointer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePersonModal();
  });

  // Each generation has its own colour: Gen 1 is the oldest generation in the web
  const GEN_COLORS = ['#ffc233', '#ff7043', '#a77bff', '#00e5ff', '#e040fb', '#c6e63a', '#ff5a8a', '#90a4ae'];
  const genColor = (g) => GEN_COLORS[((g % GEN_COLORS.length) + GEN_COLORS.length) % GEN_COLORS.length];
  let genNow = new Map();
  let genLegendSig = '';
  function refreshGenerations() {
    genNow = treeProject ? generationMap(treeProject) : new Map();
    const present = [...new Set(genNow.values())].sort((a, b) => a - b);
    const sig = present.join(',');
    if (sig === genLegendSig) return;
    genLegendSig = sig;
    const box = document.getElementById('genLegend');
    box.textContent = '';
    if (present.length < 2) return;      // one generation only: nothing to tell apart
    present.forEach((g) => {
      const item = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.color = genColor(g);
      item.append(dot, document.createTextNode('Gen ' + (g + 1)));
      box.append(item);
    });
  }

  // Draw the web thread
  function drawPerson(p, t, PX) {
    const R = NODE_R;
    const sel = p.id === selectedId;
    const gc = genColor(genNow.get(p.id) || 0);
    tctx.globalAlpha = p.status === 'deceased' ? 0.5 : 1;

    // Ring in the colour of the person's generation
    tctx.strokeStyle = gc;
    tctx.lineWidth = 3.2 * PX;
    tctx.beginPath();
    tctx.arc(p.x, p.y, R + 5 * PX, 0, Math.PI * 2);
    tctx.stroke();
    // Me: green outer ring. Selected: white outer ring.
    if (p.isMe) {
      tctx.strokeStyle = 'rgba(60,255,122,0.95)';
      tctx.lineWidth = 2.4 * PX;
      tctx.beginPath(); tctx.arc(p.x, p.y, R + 11 * PX, 0, Math.PI * 2); tctx.stroke();
    }
    if (sel) {
      tctx.strokeStyle = 'rgba(255,255,255,0.9)';
      tctx.lineWidth = 1.6 * PX;
      tctx.beginPath(); tctx.arc(p.x, p.y, R + (p.isMe ? 17 : 11) * PX, 0, Math.PI * 2); tctx.stroke();
    }

    // Photo or initials: circle tinted with the generation colour
    tctx.fillStyle = '#070808';
    tctx.beginPath(); tctx.arc(p.x, p.y, R, 0, Math.PI * 2); tctx.fill();
    tctx.save();
    tctx.globalAlpha *= 0.28;
    tctx.fillStyle = gc;
    tctx.beginPath(); tctx.arc(p.x, p.y, R, 0, Math.PI * 2); tctx.fill();
    tctx.restore();
    if (p.img) {
      tctx.save();
      tctx.beginPath(); tctx.arc(p.x, p.y, R, 0, Math.PI * 2); tctx.clip();
      const ratio = p.img.width / p.img.height;
      let dw, dh;
      if (ratio > 1) { dh = R * 2; dw = dh * ratio; } else { dw = R * 2; dh = dw / ratio; }
      tctx.drawImage(p.img, p.x - dw / 2, p.y - dh / 2, dw, dh);
      tctx.restore();
    } else {
      tctx.fillStyle = '#ffffff';
      tctx.font = '600 ' + Math.round(R * 0.7) + 'px "Sora", system-ui, sans-serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText((p.first[0] || '') + (p.last[0] || ''), p.x, p.y);
    }

    // Gender badge (bottom-left): blue for male, pink for female
    const gx = p.x - R * 0.72, gy = p.y + R * 0.72;
    const genderColor = p.gender === 'male' ? '#2f80ff' : '#ff4fa3';
    tctx.fillStyle = genderColor;
    tctx.strokeStyle = genderColor;
    tctx.lineWidth = 1.2 * PX;
    tctx.beginPath(); tctx.arc(gx, gy, 11, 0, Math.PI * 2); tctx.fill(); tctx.stroke();
    tctx.fillStyle = '#fff';
    tctx.font = '600 13px "Sora", system-ui, sans-serif';
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.fillText(p.gender === 'male' ? '♂' : '♀', gx, gy + 1);

    // Clan badge (top-right)
    const cx = p.x + R * 0.72, cy = p.y - R * 0.72;
    tctx.fillStyle = '#fff';
    tctx.beginPath(); tctx.arc(cx, cy, 11, 0, Math.PI * 2); tctx.fill();
    tctx.fillStyle = '#000';
    tctx.font = '700 11px "Sora", system-ui, sans-serif';
    tctx.fillText(p.clan[0], cx, cy + 1);

    // Names
    tctx.textAlign = 'center';
    tctx.textBaseline = 'top';
    tctx.fillStyle = '#ffffff';
    tctx.font = '600 13px "Sora", system-ui, sans-serif';
    tctx.fillText(personName(p), p.x, p.y + R + 12);
    tctx.fillStyle = '#9a9a9a';
    tctx.font = '11px "Sora", system-ui, sans-serif';
    tctx.fillText(clanName(p.clan) + ' ' + T('clan') + (p.status === 'deceased' ? ' · †' : ''), p.x, p.y + R + 30);

    if (p.isMe) {
      tctx.fillStyle = '#3cff7a';
      tctx.font = '700 11px "Sora", system-ui, sans-serif';
      tctx.textBaseline = 'bottom';
      tctx.fillText(T('me').toUpperCase(), p.x, p.y - R - (sel ? 22 : 16));
    }
    tctx.globalAlpha = 1;
  }

  function drawTree(t) {
    const { W, H, dpr, zoom, camX, camY } = tv;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, W, H);
    tctx.setTransform(dpr * zoom, 0, 0, dpr * zoom,
      dpr * (W / 2 - camX * zoom), dpr * (H / 2 - camY * zoom));

    const PX = 1 / zoom;
    const list = people();
    const byId = new Map(list.map((p) => [p.id, p]));

    // Threads
    tctx.lineCap = 'round';
    for (const p of list) {
      for (const link of p.links) {
        const lid = link.id;
        const q = byId.get(lid);
        if (!q) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const sway = Math.sin(t * 0.0007 + p.id * 1.3 + lid) * 0.06 * len;
        const cx = (p.x + q.x) / 2 - dy / len * sway;
        const cy = (p.y + q.y) / 2 + dx / len * sway;
        tctx.strokeStyle = 'rgba(255,255,255,0.35)';
        tctx.lineWidth = 1.4 * PX;
        tctx.beginPath();
        tctx.moveTo(p.x, p.y);
        tctx.quadraticCurveTo(cx, cy, q.x, q.y);
        tctx.stroke();

        const pr = (t * 0.00012 + p.id * 0.37) % 1, qq = 1 - pr;
        tctx.fillStyle = 'rgba(255,255,255,0.9)';
        tctx.beginPath();
        tctx.arc(qq * qq * p.x + 2 * qq * pr * cx + pr * pr * q.x,
                 qq * qq * p.y + 2 * qq * pr * cy + pr * pr * q.y, 2.2 * PX, 0, Math.PI * 2);
        tctx.fill();
      }
    }

    // Relation labels on the threads (Father, Sibling, Friend...)
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.font = '600 11px "Sora", system-ui, sans-serif';
    for (const p of list) {
      for (const link of p.links) {
        const q = byId.get(link.id);
        if (!q) continue;
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const tw = tctx.measureText(TR_REL(link.rel)).width;
        tctx.fillStyle = 'rgba(0,0,0,0.9)';
        tctx.strokeStyle = 'rgba(255,255,255,0.5)';
        tctx.lineWidth = 1 * PX;
        tctx.beginPath();
        tctx.roundRect(mx - tw / 2 - 8 * PX, my - 9 * PX, tw + 16 * PX, 18 * PX, 9 * PX);
        tctx.fill();
        tctx.stroke();
        tctx.fillStyle = '#ffffff';
        tctx.fillText(TR_REL(link.rel), mx, my + 1 * PX);
      }
    }

    refreshGenerations();
    for (const p of list) drawPerson(p, t, PX);
  }

  function treeLoop(t) {
    if (!treeScreen.classList.contains('hidden')) drawTree(t);
    requestAnimationFrame(treeLoop);
  }
  requestAnimationFrame(treeLoop);

  /* ----- Related clans ----- */
  function addClanPair(nameA, nameB, rel) {
    const a = nameA.toLowerCase(), b = nameB.toLowerCase();
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = x + '|' + y;
    if (!clanPairs.has(key)) clanPairs.set(key, { a: x, b: y, rels: new Set() });
    clanPairs.get(key).rels.add(rel);
  }

  function recordClanPairs(person, pr) {
    const byId = new Map(pr.tree.people.map((q) => [q.id, q]));
    for (const l of person.links) {
      const q = byId.get(l.id);
      if (q) addClanPair(person.clan, q.clan, l.rel);
    }
  }

  function relatedClans(key) {
    const out = [];
    clanPairs.forEach((pr) => {
      if (pr.a !== key && pr.b !== key) return;
      const other = pr.a === key ? pr.b : pr.a;
      const c = clanRegistry.find((k) => k.key === other);
      if (c) out.push({ clan: c, rels: [...pr.rels] });
    });
    return out;
  }

  /* ----- Clans, families and search ----- */
  const groupModal = document.getElementById('groupModal');
  const gKind = document.getElementById('gKind');
  const gTitle = document.getElementById('gTitle');
  const gSub = document.getElementById('gSub');
  const gList = document.getElementById('gList');
  const homeSearch = document.getElementById('homeSearch');
  const searchResults = document.getElementById('searchResults');

  function rebuildClanRegistry() {
    const oldPositions = new Map(clanRegistry.map(c => [c.key, {x:c.x, y:c.y, crest:c.crest}]));
    clanRegistry.length = 0;
    clanPairs.clear();
    allPeople().forEach(({person, pr}) => {
      person.clan = titleCaseWords(person.clan);
      const reg = registerClan(person.clan, person, pr);
      person.clan = reg.clan.name;
    });
    clanRegistry.forEach(c => { const old = oldPositions.get(c.key); if (old) { c.x = old.x; c.y = old.y; c.crest = old.crest; } });
    allPeople().forEach(({person, pr}) => recordClanPairs(person, pr));
  }

  function registerClan(name, person, pr) {
    const clean = name.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    let c = clanRegistry.find((k) => k.key === key);
    let isNew = false;
    if (!c) {
      const i = clanRegistry.length;
      const a = i * 2.39996 + 0.7;          // golden-angle spacing around the galaxy
      const r = 0.9 + ((i * 0.37) % 1) * 0.9;
      let h = 0;
      for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      c = { name: clean, key, crest: h % 9, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, members: [] };
      clanRegistry.push(c);
      isNew = true;
    }
    c.members.push({ person, pr, project: pr.title });
    return { clan: c, isNew };
  }

  function allPeople() {
    const out = [];
    projects.forEach((pr) => {
      if (pr.tree) pr.tree.people.forEach((person) => out.push({ person, pr, project: pr.title }));
    });
    return out;
  }

  // Restore the galaxy's clan crests and cross-clan links from saved projects.
  rebuildClanRegistry();

  function memberRow(p, pr, project) {
    const row = document.createElement('div');
    row.className = 'member-row';

    const thumb = document.createElement('div');
    thumb.className = 'member-thumb';
    if (p.photo) {
      const img = document.createElement('img');
      img.src = p.photo;
      img.alt = '';
      thumb.append(img);
    } else {
      thumb.textContent = (p.first[0] || '') + (p.last[0] || '');
    }

    const info = document.createElement('div');
    info.className = 'member-info';
    const name = document.createElement('strong');
    name.textContent = p.first + ' ' + p.last + (p.isMe ? ' (me)' : '');
    const meta = document.createElement('span');
    meta.textContent = p.clan + ' clan · ' + (p.gender === 'male' ? 'Male' : 'Female') + ' · ' +
      (p.status === 'deceased' ? 'Deceased' : 'Living') + ' · ' + project;
    info.append(name, meta);

    row.append(thumb, info);
    row.addEventListener('click', () => {
      groupModal.classList.add('hidden');
      openTree(pr);
      selectedId = p.id;
      showPersonCard(p);
    });
    return row;
  }

  // Generation of each person in a project's tree: a parent is one generation above their child,
  // so the most senior people get the lowest numbers. Sibling, friend, spouse and other links keep the same generation.
  function computeGens(pr) {
    const gen = new Map();
    const list = pr.tree ? pr.tree.people : [];
    const adj = new Map(list.map((p) => [p.id, []]));
    const deltaFor = (rel) => (rel === 'Father' || rel === 'Mother') ? 1 : (rel === 'Child' ? -1 : 0);
    for (const p of list) {
      for (const l of p.links) {
        if (!adj.has(l.id)) continue;
        const d = deltaFor(l.rel);
        adj.get(p.id).push([l.id, d]);
        adj.get(l.id).push([p.id, -d]);
      }
    }
    for (const p of list) {
      if (gen.has(p.id)) continue;
      gen.set(p.id, 0);
      const queue = [p.id];
      while (queue.length) {
        const u = queue.shift();
        for (const [v, d] of adj.get(u)) {
          if (!gen.has(v)) { gen.set(v, gen.get(u) + d); queue.push(v); }
        }
      }
    }
    if (gen.size) {
      const min = Math.min(...gen.values());
      gen.forEach((g, id) => gen.set(id, g - min));
    }
    return gen;
  }

  function sortByGeneration(items) {
    const cache = new Map();
    const genOf = (it) => {
      if (!cache.has(it.pr)) cache.set(it.pr, computeGens(it.pr));
      return cache.get(it.pr).get(it.person.id) || 0;
    };
    return items
      .map((it, i) => ({ it, i, g: genOf(it) }))
      .sort((a, b) => a.g - b.g || a.i - b.i)
      .map((x) => x.it);
  }

  // Generation of each person in a project: parents above children, siblings and friends level
  function generationMap(pr) {
    const list = pr.tree ? pr.tree.people : [];
    const byId = new Map(list.map((p) => [p.id, p]));
    const adj = new Map(list.map((p) => [p.id, []]));
    for (const p of list) {
      for (const l of p.links) {
        if (!byId.has(l.id)) continue;
        // "Father"/"Mother": the other person is one generation below; "Child": one generation above
        const d = l.rel === 'Father' || l.rel === 'Mother' ? 1 : l.rel === 'Child' ? -1 : 0;
        adj.get(p.id).push({ to: l.id, d });
        adj.get(l.id).push({ to: p.id, d: -d });
      }
    }
    const gen = new Map();
    for (const p of list) {
      if (gen.has(p.id)) continue;
      gen.set(p.id, 0);
      const queue = [p.id];
      while (queue.length) {
        const id = queue.shift();
        for (const e of adj.get(id)) {
          if (!gen.has(e.to)) { gen.set(e.to, gen.get(id) + e.d); queue.push(e.to); }
        }
      }
    }
    const min = Math.min(0, ...gen.values());
    gen.forEach((v, k) => gen.set(k, v - min));
    return gen;
  }

  // Oldest generation first (top of the list), then the rest in the order they were added
  function sortByGeneration(items) {
    const cache = new Map();
    items.forEach((it) => {
      if (!cache.has(it.pr)) cache.set(it.pr, generationMap(it.pr));
      it.gen = cache.get(it.pr).get(it.person.id) || 0;
    });
    return items.slice().sort((a, b) => a.gen - b.gen);
  }

  function showGroupView(kind, key) {
    let items, title, sub;
    let related = [];
    if (kind === 'clan') {
      const c = clanRegistry.find((k) => k.name === key);
      if (!c) return;
      items = c.members.map((m) => ({ person: m.person, pr: m.pr, project: m.pr.title }));
      title = c.name + ' clan';
      related = relatedClans(c.key);
      gKind.textContent = 'Clan';
      sub = items.length + (items.length === 1 ? ' member' : ' members') + ' in this clan';
    } else {
      const lower = key.toLowerCase();
      items = allPeople().filter((x) => x.person.last.toLowerCase() === lower);
      title = key;
      gKind.textContent = 'Family';
      sub = items.length + (items.length === 1 ? ' member' : ' members') + ' with this family name';
    }
    items = sortByGeneration(items);
    gTitle.textContent = title;
    gSub.textContent = sub;
    gList.textContent = '';
    if (!items.length) {
      const em = document.createElement('p');
      em.className = 'search-empty';
      em.textContent = 'No members yet.';
      gList.append(em);
    }
    items = sortByGeneration(items);
    items.forEach((it) => gList.append(memberRow(it.person, it.pr, it.project + ' · Generation ' + (it.gen + 1))));
    if (related.length) {
      const h = document.createElement('p');
      h.className = 'lbl';
      h.textContent = 'Related clans';
      const chips = document.createElement('div');
      chips.className = 'related-list';
      related.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'related-chip';
        b.append(document.createTextNode(r.clan.name + ' clan '), Object.assign(document.createElement('small'), { textContent: '· ' + r.rels.join(', ') }));
        b.addEventListener('click', () => showGroupView('clan', r.clan.name));
        chips.append(b);
      });
      gList.append(h, chips);
    }
    groupModal.classList.remove('hidden');
    closeSearch();
  }

  document.getElementById('gClose').addEventListener('click', () => groupModal.classList.add('hidden'));
  groupModal.addEventListener('click', (e) => { if (e.target === groupModal) groupModal.classList.add('hidden'); });

  function buildResults(q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out = [];

    clanRegistry.forEach((c) => {
      if (c.key.includes(query)) {
        out.push({ kind: 'Clan', label: c.name + ' clan', sub: c.members.length + ' members', open: () => showGroupView('clan', c.name) });
      }
    });

    const everyone = allPeople();
    const fams = new Map();
    everyone.forEach(({ person }) => {
      const k = person.last.toLowerCase();
      if (!fams.has(k)) fams.set(k, { name: person.last, count: 0 });
      fams.get(k).count++;
    });
    fams.forEach((v, k) => {
      if (k.includes(query)) {
        out.push({ kind: 'Family', label: v.name, sub: v.count + (v.count === 1 ? ' member' : ' members'), open: () => showGroupView('family', v.name) });
      }
    });

    everyone.forEach(({ person, pr, project }) => {
      const full = (person.first + ' ' + person.last).toLowerCase();
      if (full.includes(query)) {
        out.push({
          kind: 'Person',
          label: person.first + ' ' + person.last,
          sub: person.clan + ' clan · ' + project,
          open: () => { openTree(pr); selectedId = person.id; showPersonCard(person); }
        });
      }
    });

    return out.slice(0, 10);
  }

  function closeSearch() { searchResults.classList.remove('open'); }

  function renderSearch() {
    const q = homeSearch.value;
    searchResults.textContent = '';
    if (!q.trim()) { closeSearch(); return; }
    const res = buildResults(q);
    if (!res.length) {
      const em = document.createElement('div');
      em.className = 'search-empty';
      em.textContent = 'No clan, family or person found.';
      searchResults.append(em);
    }
    res.forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'search-item';
      const s = document.createElement('small');
      s.textContent = r.kind + ' · ' + r.sub;
      b.append(document.createTextNode(r.label), s);
      b.addEventListener('click', () => { closeSearch(); homeSearch.value = ''; r.open(); });
      searchResults.append(b);
    });
    searchResults.classList.add('open');
  }

  homeSearch.addEventListener('input', renderSearch);
  homeSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { homeSearch.value = ''; closeSearch(); homeSearch.blur(); }
    if (e.key === 'Enter') {
      const first = searchResults.querySelector('.search-item');
      if (first) first.click();
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) closeSearch(); });

  /* ----- Settings: export and import ----- */
  const settingsScreen = document.getElementById('settingsScreen');
  const exportMsg = document.getElementById('exportMsg');
  const importMsg = document.getElementById('importMsg');
  const importPreview = document.getElementById('importPreview');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const chosenName = document.getElementById('chosenName');
  let pendingImport = null;

  // null = all projects (gear icon); a project object = that project only (three-dot menu)
  let settingsProject = null;

  function showSettings(project) {
    settingsProject = project && project.title !== undefined ? project : null;
    const one = !!settingsProject;
    document.getElementById('settingsTitle').textContent = one ? 'Project settings' : 'Settings';
    document.getElementById('exportTitle').textContent = one ? 'Export ' + settingsProject.title : 'Export data';
    document.getElementById('exportDesc').textContent = one
      ? 'Saves only this project, with its clan and family members and their relations, as its own CSV or JSON file on this device. The file name has the project name and the date.'
      : 'Saves every project, with its clan and family members and their relations, as a file on this device. The file name includes the date.';
    document.getElementById('importCard').classList.toggle('is-hidden', one);
    document.getElementById('exportBox').classList.add('is-hidden');
    lastExport = '';
    projectScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    settingsScreen.scrollTop = 0;
    exportMsg.textContent = '';
    importMsg.textContent = '';
  }

  function backFromSettings() {
    settingsScreen.classList.add('hidden');
    projectScreen.classList.remove('hidden');
    renderProjects();
  }

  // The list of projects, with their people, in a plain form
  function exportList() {
    const src = settingsProject && projects.includes(settingsProject) ? [settingsProject] : projects;
    return src.map((pr) => ({
      title: pr.title,
      description: pr.desc || '',
      people: (pr.tree ? pr.tree.people : []).map((p) => ({
        id: p.id, first: p.first, last: p.last, clan: p.clan, gender: p.gender,
        status: p.status, dob: p.dob || '', isMe: !!p.isMe,
        links: p.links.map((l) => ({ id: l.id, rel: l.rel })),
        photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : null
      }))
    }));
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCSV(list) {
    const head = ['project_title', 'project_description', 'person_id', 'first_name', 'last_name', 'clan', 'gender', 'status', 'is_me', 'links', 'dob'];
    const lines = [head.join(',')];
    for (const pr of list) {
      if (!pr.people.length) {
        lines.push([pr.title, pr.description, '', '', '', '', '', '', '', '', ''].map(csvCell).join(','));
        continue;
      }
      for (const p of pr.people) {
        const links = p.links.map((l) => String(l.id) + ':' + String(l.rel).replace(/[|:]/g, ' ')).join('|');
        lines.push([pr.title, pr.description, p.id, p.first, p.last, p.clan, p.gender, p.status, p.isMe ? 'yes' : 'no', links, p.dob || ''].map(csvCell).join(','));
      }
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  let lastExport = '';

  function setMsg(el, text, ok) {
    el.textContent = text;
    el.classList.toggle('ok', !!ok);
  }

  async function saveFile(filename, data, mime) {
    setMsg(exportMsg, 'Preparing the file…', false);
    let downloads = null;
    try {
      downloads = window.claude ? await window.claude.use('downloads') : null;
    } catch (e) {
      downloads = null;
    }
    if (downloads) {
      try {
        const r = await downloads.save({ filename, data });
        setMsg(exportMsg, r.status === 'saved' ? 'Saved ' + filename + ' to your device.' : 'The file was sent to the place you chose.', true);
        return;
      } catch (err) {
        if (err && err.code === 'declined') { setMsg(exportMsg, 'Export cancelled.', false); return; }
        // any other problem: try a normal browser download instead
      }
    }
    try {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMsg(exportMsg, 'Downloading ' + filename + '. Check your downloads folder. If nothing was saved, tap "Show data as text" and copy it.', true);
    } catch (e) {
      setMsg(exportMsg, 'This view cannot download files. Tap "Show data as text" and copy it into a file named ' + filename + '.', false);
    }
  }

  async function exportData(kind) {
    const list = exportList();
    const stamp = new Date().toISOString().slice(0, 10);
    const data = kind === 'csv'
      ? buildCSV(list)
      : JSON.stringify({ format: 'abd-family-web', version: 1, exported: new Date().toISOString(), projects: list }, null, 2);
    lastExport = data;
    const slug = settingsProject && settingsProject.title
      ? settingsProject.title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'
      : '';
    const name = slug ? 'ABD-' + slug + '-' + stamp : 'ABD-family-web-' + stamp;
    await saveFile(name + '.' + kind, data, kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json');
  }

  // Shared check for one person from a file
  function cleanPerson(p, warnings) {
    const first = String(p.first || '').trim();
    const last = String(p.last || '').trim();
    const clan = String(p.clan || '').trim();
    const gender = String(p.gender || '').trim().toLowerCase();
    const status = String(p.status || 'living').trim().toLowerCase() === 'deceased' ? 'deceased' : 'living';
    if (!first || !last || !clan || (gender !== 'male' && gender !== 'female')) {
      warnings.push((first + ' ' + last).trim() || 'unnamed person');
      return null;
    }
    const links = (Array.isArray(p.links) ? p.links : [])
      .map((l) => ({ id: Number(l.id), rel: String(l.rel || '').trim() }))
      .filter((l) => l.id && l.rel);
    const photo = typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : null;
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dob || '').trim()) ? String(p.dob).trim() : '';
    return { id: Number(p.id) || 0, first, last, clan, gender, status, dob, isMe: !!p.isMe, links, photo };
  }

  function csvToList(text) {
    const rows = parseCSV(text).filter((r) => r.some((x) => x.trim() !== ''));
    if (!rows.length) throw new Error('The CSV file is empty.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    if (head.indexOf('project_title') < 0) throw new Error('The CSV file needs a project_title column.');
    const warnings = [];
    const byTitle = new Map();
    for (let r = 1; r < rows.length; r++) {
      const cell = (name) => { const i = head.indexOf(name); return i >= 0 ? (rows[r][i] || '').trim() : ''; };
      const title = cell('project_title') || 'Imported project';
      if (!byTitle.has(title)) byTitle.set(title, { title, description: cell('project_description'), people: [] });
      if (!cell('first_name') && !cell('last_name')) continue;
      const links = cell('links').split('|').filter(Boolean).map((part) => {
        const k = part.indexOf(':');
        return k < 0 ? null : { id: Number(part.slice(0, k)), rel: part.slice(k + 1) };
      }).filter(Boolean);
      const person = cleanPerson({
        id: cell('person_id'), first: cell('first_name'), last: cell('last_name'), clan: cell('clan'),
        gender: cell('gender'), status: cell('status'), dob: cell('dob'), isMe: cell('is_me').toLowerCase() === 'yes', links
      }, warnings);
      if (person) byTitle.get(title).people.push(person);
    }
    return { projects: [...byTitle.values()], warnings };
  }

  function jsonToList(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('This file is not valid JSON.'); }
    const arr = Array.isArray(data) ? data : data.projects;
    if (!Array.isArray(arr)) throw new Error('The JSON file needs a "projects" list.');
    const warnings = [];
    const out = arr.map((pr) => ({
      title: String(pr.title || '').trim() || 'Imported project',
      description: String(pr.description || ''),
      people: (Array.isArray(pr.people) ? pr.people : []).map((p) => cleanPerson(p, warnings)).filter(Boolean)
    }));
    return { projects: out, warnings };
  }

  // Parses CSV text into rows, handling quoted commas and line breaks
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  async function handleImportFile(file) {
    setMsg(importMsg, '', false);
    importPreview.textContent = '';
    if (!file) { chosenName.textContent = 'No file chosen'; return; }
    chosenName.textContent = file.name;
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const isJSON = /\.json$/i.test(file.name) || /^\s*[\[{]/.test(text);
      const parsed = isJSON ? jsonToList(text) : csvToList(text);
      const people = parsed.projects.reduce((n, pr) => n + pr.people.length, 0);
      if (!people && !parsed.projects.length) {
        setMsg(importMsg, 'No people or projects were found in this file.', false);
        return;
      }
      const r = importProjects(parsed);
      setMsg(importMsg, 'Imported ' + r.people + (r.people === 1 ? ' person' : ' people') + ' into ' +
        parsed.projects.map((p) => p.title).join(', ') + '.', true);
      if (parsed.warnings.length) {
        const w = document.createElement('p');
        w.className = 'import-warn';
        w.textContent = parsed.warnings.length + ' person(s) skipped because a name, clan or gender was missing: ' +
          parsed.warnings.slice(0, 3).join(', ') + (parsed.warnings.length > 3 ? ' …' : '');
        importPreview.append(w);
      }
      toast('Import complete');
    } catch (err) {
      setMsg(importMsg, err.message || 'This file could not be read.', false);
    }
    importInput.value = '';
  }

  // Adds the people to the project named in the file (creating the project if needed)
  // Lays a project's people out in clean rows: oldest generation at the top,
  // relatives next to each other inside each row, and nobody on top of anyone else
  function arrangeProject(pr) {
    const list = pr.tree ? pr.tree.people : [];
    if (!list.length) return;
    const gen = generationMap(pr);
    const byId = new Map(list.map((q) => [q.id, q]));
    const order = new Map();
    let idx = 0;
    list.slice().sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0)).forEach((start) => {
      if (order.has(start.id)) return;
      order.set(start.id, idx++);
      const queue = [start.id];
      while (queue.length) {
        const cur = byId.get(queue.shift());
        cur.links.forEach((l) => {
          if (byId.has(l.id) && !order.has(l.id)) { order.set(l.id, idx++); queue.push(l.id); }
        });
      }
    });
    const rows = new Map();
    list.forEach((q) => {
      const g = gen.get(q.id) || 0;
      if (!rows.has(g)) rows.set(g, []);
      rows.get(g).push(q);
    });
    const GAP_X = 210, GAP_Y = 220;
    [...rows.keys()].sort((a, b) => a - b).forEach((g) => {
      const row = rows.get(g).sort((a, b) => order.get(a.id) - order.get(b.id));
      const width = (row.length - 1) * GAP_X;
      row.forEach((q, i) => { q.x = -width / 2 + i * GAP_X; q.y = g * GAP_Y; });
    });
  }

  function importProjects(list) {
    let peopleCount = 0;
    const touched = new Set();
    for (const item of list.projects) {
      let pr = projects.find((p) => p.title.toLowerCase() === item.title.toLowerCase());
      if (!pr) {
        pr = { title: item.title, desc: item.description || '', date: new Date().toLocaleDateString(), tree: { people: [], nextId: 1 } };
        projects.push(pr);
      }
      if (!pr.tree) pr.tree = { people: [], nextId: 1 };
      const t = pr.tree;

      // New ids, so imported people never clash with existing ones
      const idMap = new Map();
      const incoming = item.people.map((p) => {
        const id = t.nextId++;
        idMap.set(p.id, id);
        return { ...p, id };
      });
      incoming.forEach((p) => {
        p.links = p.links.map((l) => ({ id: idMap.get(l.id), rel: l.rel })).filter((l) => l.id !== undefined);
      });

      // Place the people: unlinked ones in a row, linked ones around the person they connect to
      const offsetX = t.people.length ? Math.max(...t.people.map((q) => q.x)) + 420 : 0;
      const placed = new Map();
      let k = 0;
      incoming.forEach((p) => {
        if (!p.links.length) {
          placed.set(p.id, { x: offsetX + (k % 3) * 220, y: Math.floor(k / 3) * 200 });
          k++;
        }
      });
      let guard = 0;
      while (placed.size < incoming.length && guard++ < 60) {
        incoming.forEach((p) => {
          if (placed.has(p.id)) return;
          const base = p.links.map((l) => placed.get(l.id)).find(Boolean);
          if (!base) return;
          const a = Math.random() * Math.PI * 2;
          const d = 170 + Math.random() * 40;
          placed.set(p.id, { x: base.x + Math.cos(a) * d, y: base.y + Math.sin(a) * d });
        });
      }
      incoming.forEach((p) => { if (!placed.has(p.id)) placed.set(p.id, { x: offsetX, y: 0 }); });

      const created = [];
      incoming.forEach((p) => {
        const pos = placed.get(p.id);
        const person = {
          id: p.id, first: p.first, last: p.last, clan: p.clan, gender: p.gender, status: p.status, dob: p.dob || '',
          photo: p.photo, img: null,
          x: pos.x, y: pos.y, links: p.links, isMe: p.isMe
        };
        if (p.photo) {
          const im = new Image();
          im.onload = () => { person.img = im; };
          im.src = p.photo;
        }
        t.people.push(person);
        const reg = registerClan(p.clan, person, pr);
        person.clan = reg.clan.name;
        created.push(person);
        peopleCount++;
      });
      created.forEach((person) => recordClanPairs(person, pr));
      arrangeProject(pr);
      touched.add(pr);
    }
    renderProjects();
    return { people: peopleCount, projects: touched.size };
  }

  function commitImport() {
    if (!pendingImport) return;
    const r = importProjects(pendingImport);
    importMsg.textContent = 'Imported ' + r.people + (r.people === 1 ? ' person' : ' people') + ' into ' +
      r.projects + (r.projects === 1 ? ' project.' : ' projects.');
    pendingImport = null;
    importBtn.disabled = true;
    importPreview.textContent = '';
    chosenName.textContent = 'No file chosen';
    importInput.value = '';
    toast('Import complete');
  }

  document.getElementById('showTextBtn').addEventListener('click', () => {
    const box = document.getElementById('exportBox');
    box.value = lastExport || buildCSV(exportList());
    box.classList.remove('is-hidden');
    box.focus();
    box.select();
  });
  document.getElementById('settingsBtn').addEventListener('click', () => showSettings(null));
  document.getElementById('settingsBackBtn').addEventListener('click', backFromSettings);
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportData('csv'));
  document.getElementById('exportJsonBtn').addEventListener('click', () => exportData('json'));
  document.getElementById('chooseFileBtn').addEventListener('click', () => { importInput.value = ''; importInput.click(); });
  importInput.addEventListener('change', (e) => handleImportFile(e.target.files[0]));
  importBtn.addEventListener('click', commitImport);

  /* ----- Language picker ----- */
  const langModal = document.getElementById('langModal');
  const langList = document.getElementById('langList');

  function setLang(code) {
    lang = code;
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    applyTreeLabels();
  }

  function openLangModal() {
    langList.textContent = '';
    LANGS.forEach((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = l.code === lang ? 'clay' : 'white-clay dark';
      b.style.width = '100%';
      b.textContent = l.name;
      b.addEventListener('click', () => { setLang(l.code); langModal.classList.add('hidden'); });
      langList.append(b);
    });
    langModal.classList.remove('hidden');
  }

  document.getElementById('langBtn').addEventListener('click', openLangModal);
  document.getElementById('langClose').addEventListener('click', () => langModal.classList.add('hidden'));
  langModal.addEventListener('click', (e) => { if (e.target === langModal) langModal.classList.add('hidden'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') langModal.classList.add('hidden'); });

  /* ----- Delete project: confirm, then 10 seconds to undo ----- */
  function safePersist() {
    try { persistProjects(); } catch (err) { console.error('Could not save projects', err); }
  }
  const pendingBar = document.getElementById('pendingBar');
  const pendingText = document.getElementById('pendingText');
  let pending = null; // { project, index, left, timer }

  function rebuildPairs() {
    clanPairs.clear();
    projects.forEach((q) => { if (q.tree) q.tree.people.forEach((person) => recordClanPairs(person, q)); });
  }

  function setPendingText() {
    pendingText.textContent = '"' + pending.project.title + '" will be deleted in ' + pending.left + 's';
  }

  function finishPending(message) {
    if (!pending) return;
    clearInterval(pending.timer);
    pending = null;
    pendingBar.classList.add('is-hidden');
    safePersist();
    renderProjects();
    if (message) toast(message);
  }

  function startPendingDelete(p) {
    finishPending();
    const index = projects.indexOf(p);
    if (index < 0) return;
    projects.splice(index, 1);
    rebuildClanRegistry();
    rebuildPairs();
    renderProjects();
    pending = { project: p, index, left: 10, timer: null };
    pending.timer = setInterval(() => {
      if (!pending) return;
      pending.left--;
      if (pending.left <= 0) finishPending('Project deleted');
      else setPendingText();
    }, 1000);
    setPendingText();
    pendingBar.classList.remove('is-hidden');
  }

  document.getElementById('pendingUndo').addEventListener('click', () => {
    if (!pending) return;
    const pd = pending;
    clearInterval(pd.timer);
    pending = null;
    pendingBar.classList.add('is-hidden');
    projects.splice(Math.min(pd.index, projects.length), 0, pd.project);
    rebuildClanRegistry();
    rebuildPairs();
    renderProjects();
    safePersist();
    toast('Project restored');
  });
  document.getElementById('pendingNow').addEventListener('click', () => finishPending('Project deleted'));

  /* ----- Each project's own galaxy (clan view), with zoom and threads ----- */
  const pgScreen = document.getElementById('pgScreen');
  const pgCanvas = document.getElementById('pgCanvas');
  const pgCtx = pgCanvas.getContext('2d');
  const PG_COLORS = ['#cfe3ff', '#ffe14d', '#ffb347', '#9be7ff', '#ff6b4a', '#b388ff', '#ffd166', '#3cff7a', '#ff7eb6'];
  const PG_PALETTES = [
    { pts: ['#8fe6ff', '#4fb8ff', '#e6f7ff'], haze: ['40,140,255', '60,190,255', '20,100,220'], core: 'rgba(230,248,255,0.7)' },
    { pts: ['#d6b8ff', '#8fb3ff', '#ffe1f7'], haze: ['140,90,255', '200,120,255', '90,80,220'], core: 'rgba(250,235,255,0.7)' },
    { pts: ['#fff0b3', '#9fe8ff', '#fff9e6'], haze: ['255,190,90', '120,200,255', '255,140,60'], core: 'rgba(255,248,220,0.7)' },
    { pts: ['#9dffe6', '#4fd8ff', '#e8fffa'], haze: ['60,230,190', '40,160,255', '30,200,170'], core: 'rgba(230,255,250,0.7)' }
  ];
  const PG_ZMIN = 0.3, PG_ZMAX = 4;
  let pg = null;
  let pgFrom = 'projects';

  function pgHash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pgRandom(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pgResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pgCanvas.width = window.innerWidth * dpr;
    pgCanvas.height = window.innerHeight * dpr;
    pgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pgZoomAt(px, py, factor) {
    const W = window.innerWidth, H = window.innerHeight;
    const oldZ = pg.zoom;
    const wx = (px - (W / 2 + pg.panX)) / oldZ;
    const wy = (py - (H / 2 + pg.panY)) / oldZ;
    pg.zoom = Math.min(PG_ZMAX, Math.max(PG_ZMIN, oldZ * factor));
    pg.panX = px - W / 2 - wx * pg.zoom;
    pg.panY = py - H / 2 - wy * pg.zoom;
  }

  // Opens the members of one clan in this project, oldest generation first
  function openProjectClanMembers(pr, name) {
    const items = (pr.tree ? pr.tree.people : [])
      .filter((q) => q.clan === name)
      .map((person) => ({ person, pr, project: pr.title }));
    const sorted = sortByGeneration(items);
    gKind.textContent = 'Clan in ' + pr.title;
    gTitle.textContent = name + ' clan';
    gSub.textContent = sorted.length + (sorted.length === 1 ? ' member' : ' members') + ' · generation order';
    gList.textContent = '';
    if (!sorted.length) {
      const em = document.createElement('p');
      em.className = 'search-empty';
      em.textContent = 'No members yet.';
      gList.append(em);
    }
    sorted.forEach((it) => gList.append(memberRow(it.person, it.pr, it.project + ' · Generation ' + (it.gen + 1))));
    groupModal.classList.remove('hidden');
  }

  function openProjectGalaxy(pr) {
    const rnd = pgRandom(pgHash(pr.title + '|' + (pr.shareId || '')));
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const names = [];
    (pr.tree ? pr.tree.people : []).forEach((q) => {
      let n = names.find((x) => x.name === q.clan);
      if (!n) { n = { name: q.clan, key: String(q.clan).toLowerCase(), count: 0 }; names.push(n); }
      n.count++;
    });
    names.forEach((n, k) => {
      n.color = PG_COLORS[pgHash(n.name) % PG_COLORS.length];
      n.angle = k * 2.39996 + rnd() * 0.6;
      n.r = 0.22 + 0.62 * Math.sqrt((k + 1) / (names.length + 1)) + rnd() * 0.05;
    });
    // Each project gets its own real galaxy type: spiral, barred spiral, elliptical or irregular
    const kinds = ['spiral', 'spiral', 'barred', 'elliptical', 'irregular'];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const palette = PG_PALETTES[Math.floor(rnd() * PG_PALETTES.length)];
    const gal = { kind, palette, rot: rnd() * Math.PI * 2, tilt: 0.5 + rnd() * 0.4 };
    const pick = () => palette.pts[Math.floor(rnd() * palette.pts.length)];
    const arms = [];
    const addPoint = (x, y, s, b) => arms.push({ x, y, s, b, col: pick(), ph: rnd() * 6.28 });
    if (kind === 'spiral' || kind === 'barred') {
      const n = kind === 'barred' ? 2 : 2 + Math.floor(rnd() * 3);
      const k = 2.5 + rnd() * 2.2;
      for (let i = 0; i < 1500; i++) {
        const arm = i % n;
        const u = Math.pow(rnd(), 0.7);
        const th = arm * (Math.PI * 2 / n) + k * Math.log(1 + u * 5) + gauss() * 0.16 * (1 - u * 0.5);
        const r = (kind === 'barred' ? 0.42 : 0) + u * (kind === 'barred' ? 0.55 : 0.95);
        addPoint(Math.cos(th) * r, Math.sin(th) * r, 0.4 + rnd() * 1.1, 0.3 + rnd() * 0.6 * (1 - u * 0.6));
      }
      if (kind === 'barred') {
        for (let i = 0; i < 220; i++) addPoint((rnd() * 2 - 1) * 0.42, gauss() * 0.05, 0.5 + rnd() * 0.9, 0.5 + rnd() * 0.4);
      }
      for (let i = 0; i < 260; i++) {
        const r = Math.pow(rnd(), 1.8) * 0.28, th = rnd() * Math.PI * 2;
        addPoint(Math.cos(th) * r, Math.sin(th) * r, 0.6 + rnd() * 1.2, 0.6 + rnd() * 0.4);
      }
      for (let i = 0; i < 300; i++) {
        const r = Math.sqrt(rnd()) * 0.95, th = rnd() * Math.PI * 2;
        addPoint(Math.cos(th) * r, Math.sin(th) * r, 0.3 + rnd() * 0.6, 0.12 + rnd() * 0.15);
      }
    } else if (kind === 'elliptical') {
      for (let i = 0; i < 900; i++) {
        const x = gauss() * 0.42, y = gauss() * 0.42;
        addPoint(x, y, 0.4 + rnd() * 1.1, Math.max(0.12, 0.9 - Math.hypot(x, y) * 1.4));
      }
    } else {
      const clumps = [];
      for (let q = 0; q < 6; q++) clumps.push({ x: (rnd() - 0.5) * 1.3, y: (rnd() - 0.5) * 1.3 });
      for (let i = 0; i < 900; i++) {
        const cl = clumps[i % clumps.length];
        addPoint(cl.x + gauss() * 0.14, cl.y + gauss() * 0.14, 0.4 + rnd() * 1.0, 0.35 + rnd() * 0.5);
      }
    }
    // Background stars that twinkle
    const stars = [];
    for (let i = 0; i < 380; i++) {
      stars.push({ x: rnd() - 0.5, y: rnd() - 0.5, s: 0.4 + rnd() * 1.1, a: 0.25 + rnd() * 0.7, f: 0.0015 + rnd() * 0.004, ph: rnd() * 6.28 });
    }
    // Soft blue nebula haze
    const haze = [];
    const hazeCols = gal.palette.haze;
    for (let i = 0; i < 6; i++) {
      haze.push({ x: rnd() * 1.2 - 0.6, y: rnd() - 0.5, r: 0.5 + rnd() * 0.6, a: 0.07 + rnd() * 0.07, col: hazeCols[i % 3] });
    }
    pg = { pr, names, arms, gal, stars, haze, zoom: 1, panX: 0, panY: 0, drag: null, moved: false, hits: [], touches: new Map(), pinch: 0 };
    document.getElementById('pgTitle').textContent = pr.title;
    document.getElementById('pgHint').textContent = names.length
      ? 'Tap a clan crest to see its members in generation order. Scroll or pinch to zoom.'
      : 'No clans in this project yet.';
    projectScreen.classList.add('hidden');
    pgScreen.classList.remove('hidden');
    pgResize();
  }

  function drawProjectGalaxy(t) {
    if (!pg || pgScreen.classList.contains('hidden')) return;
    const W = window.innerWidth, H = window.innerHeight, c = pgCtx;
    const cx = W / 2 + pg.panX, cy = H / 2 + pg.panY;
    const R = Math.min(W, H) * 0.42 * pg.zoom;
    const rot = t * 0.000015;

    // Deep blue-black sky
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#02040a';
    c.fillRect(0, 0, W, H);

    c.globalCompositeOperation = 'lighter';
    // Nebula haze
    pg.haze.forEach((hz) => {
      const x = cx + hz.x * R, y = cy + hz.y * R * 0.6, rr = hz.r * R;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(' + hz.col + ',' + hz.a + ')');
      g.addColorStop(1, 'rgba(' + hz.col + ',0)');
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    });

    // Background stars, twinkling
    pg.stars.forEach((st) => {
      const tw = 0.55 + 0.45 * Math.sin(t * st.f + st.ph);
      c.fillStyle = '#cfeaff';
      c.globalAlpha = st.a * tw;
      c.beginPath();
      c.arc((st.x + 0.5) * W, (st.y + 0.5) * H, st.s, 0, Math.PI * 2);
      c.fill();
    });

    // Glowing spiral arms
    const gca = Math.cos(pg.gal.rot + rot), gsa = Math.sin(pg.gal.rot + rot);
    pg.arms.forEach((d) => {
      const Y = d.y * pg.gal.tilt;
      const x = cx + (d.x * gca - Y * gsa) * R * 1.7;
      const y = cy + (d.x * gsa + Y * gca) * R * 1.7;
      const tw = 0.7 + 0.3 * Math.sin(t * 0.002 + d.ph);
      c.fillStyle = d.col;
      c.globalAlpha = d.b * tw;
      c.beginPath(); c.arc(x, y, d.s, 0, Math.PI * 2); c.fill();
    });

    // Bright blue-white core
    const core = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
    core.addColorStop(0, pg.gal.palette.core);
    core.addColorStop(0.3, 'rgba(90,200,255,0.3)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1;
    c.fillStyle = core;
    c.beginPath(); c.arc(cx, cy, R * 0.45, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over';

    // Clan positions on the screen
    pg.names.forEach((n) => {
      const a = n.angle + rot;
      n.x = cx + Math.cos(a) * n.r * R;
      n.y = cy + Math.sin(a) * n.r * R * 0.6;
    });

    // Neon threads: from the centre to each clan, and between related clans
    c.save();
    c.shadowColor = '#4fd2ff';
    c.shadowBlur = 10;
    c.strokeStyle = 'rgba(120,220,255,0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    pg.names.forEach((n) => { c.moveTo(cx, cy); c.lineTo(n.x, n.y); });
    c.stroke();
    c.beginPath();
    clanPairs.forEach((pair) => {
      const A = pg.names.find((n) => n.key === pair.a), B = pg.names.find((n) => n.key === pair.b);
      if (!A || !B) return;
      c.moveTo(A.x, A.y);
      c.lineTo(B.x, B.y);
    });
    c.stroke();
    c.restore();

    // Clan crests with a neon halo
    pg.hits = [];
    const k = Math.min(1.3, Math.max(0.8, pg.zoom));
    pg.names.forEach((n, i) => {
      const x = n.x, y = n.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + i);
      c.save();
      c.shadowColor = '#7fe0ff';
      c.shadowBlur = 16 + pulse * 8;
      c.strokeStyle = '#7fe0ff';
      c.lineWidth = 1.5;
      c.globalAlpha = 0.35 + pulse * 0.25;
      c.beginPath(); c.arc(x, y, 22 * k, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = '#000';
      c.beginPath(); c.arc(x, y, 14 * k, 0, Math.PI * 2); c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = n.color;
      c.stroke();
      c.restore();
      c.fillStyle = n.color;
      c.font = '700 ' + Math.round(13 * k) + 'px "Sora", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText((n.name || '?').charAt(0).toUpperCase(), x, y + 1);
      c.fillStyle = '#e6f7ff';
      c.font = '600 ' + Math.round(12 * k) + 'px "Sora", system-ui, sans-serif';
      c.textBaseline = 'top';
      c.fillText(n.name + ' clan', x, y + 26 * k);
      c.fillStyle = '#8fb8d0';
      c.font = Math.round(11 * k) + 'px "Sora", system-ui, sans-serif';
      c.fillText(n.count + (n.count === 1 ? ' member' : ' members'), x, y + 42 * k);
      pg.hits.push({ name: n.name, x, y });
    });
    c.globalAlpha = 1;
  }

  function pgLoop(t) {
    drawProjectGalaxy(t);
    requestAnimationFrame(pgLoop);
  }
  requestAnimationFrame(pgLoop);

  pgCanvas.addEventListener('wheel', (e) => {
    if (!pg) return;
    e.preventDefault();
    pgZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  pgCanvas.addEventListener('pointerdown', (e) => {
    if (!pg) return;
    pg.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pg.touches.size === 1) {
      pg.drag = { x: e.clientX, y: e.clientY, panX: pg.panX, panY: pg.panY };
      pg.moved = false;
    } else if (pg.touches.size === 2) {
      const [a, b] = [...pg.touches.values()];
      pg.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pg.drag = null;
      pg.moved = true;
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!pg || !pg.touches.has(e.pointerId)) return;
    pg.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pg.touches.size === 2) {
      const [a, b] = [...pg.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pg.pinch > 0) pgZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pg.pinch);
      pg.pinch = d;
      return;
    }
    if (pg.drag) {
      const dx = e.clientX - pg.drag.x, dy = e.clientY - pg.drag.y;
      if (Math.hypot(dx, dy) > 6) pg.moved = true;
      pg.panX = pg.drag.panX + dx;
      pg.panY = pg.drag.panY + dy;
    }
  });

  function pgEndPointer(e) {
    if (!pg || !pg.touches.has(e.pointerId)) return;
    const wasTap = pg.touches.size === 1 && !pg.moved && e.type === 'pointerup';
    pg.touches.delete(e.pointerId);
    if (pg.touches.size < 2) pg.pinch = 0;
    if (pg.touches.size === 0) pg.drag = null;
    if (!wasTap) return;
    let best = null, bestD = 28;
    pg.hits.forEach((h) => {
      const d = Math.hypot(h.x - e.clientX, h.y - e.clientY);
      if (d < bestD) { bestD = d; best = h; }
    });
    if (best) openProjectClanMembers(pg.pr, best.name);
  }
  window.addEventListener('pointerup', pgEndPointer);
  window.addEventListener('pointercancel', pgEndPointer);
  window.addEventListener('resize', () => { if (!pgScreen.classList.contains('hidden')) pgResize(); });

  document.getElementById('pgZoomIn').addEventListener('click', () => { if (pg) pgZoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25); });
  document.getElementById('pgZoomOut').addEventListener('click', () => { if (pg) pgZoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8); });
  document.getElementById('pgZoomReset').addEventListener('click', () => { if (pg) { pg.zoom = 1; pg.panX = 0; pg.panY = 0; } });

  document.getElementById('pgBackBtn').addEventListener('click', () => {
    pgScreen.classList.add('hidden');
    if (pgFrom === 'tree' && treeProject) {
      treeScreen.classList.remove('hidden');
    } else {
      projectScreen.classList.remove('hidden');
      renderProjects();
    }
  });
  document.getElementById('treeClanBtn').addEventListener('click', () => {
    if (!treeProject) return;
    pgFrom = 'tree';
    treeScreen.classList.add('hidden');
    openProjectGalaxy(treeProject);
  });

  /* ----- Phone back button and swipe from the left edge ----- */
  const LAYER_MODALS = [
    ['confirmModal', 'confirmNo'], ['relPickModal', 'relPickClose'], ['langModal', 'langClose'],
    ['groupModal', 'gClose'], ['personModal', 'pCancel'], ['renameModal', 'renCancel'], ['projectModal', 'cancelProjectBtn']
  ];
  const LAYER_SCREENS = [
    ['pgScreen', 'pgBackBtn'], ['treeScreen', 'treeBackBtn'], ['aboutScreen', 'aboutBackBtn'],
    ['settingsScreen', 'settingsBackBtn'], ['sharedScreen', 'sharedBackBtn'], ['projectScreen', 'backBtn']
  ];
  const isOpen = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
  const cardOpen = () => { const el = document.getElementById('personCard'); return !!el && el.classList.contains('show'); };

  // How many layers are open on top of the home page
  function layerCount() {
    return LAYER_MODALS.filter(([id]) => isOpen(id)).length + (cardOpen() ? 1 : 0) + LAYER_SCREENS.filter(([id]) => isOpen(id)).length;
  }

  // Closes the top-most open layer, the same way its Back button does. Returns false on the home page.
  function backAction() {
    for (const [id, close] of LAYER_MODALS) {
      if (isOpen(id)) { document.getElementById(close).click(); return true; }
    }
    if (cardOpen()) { document.getElementById('personCard').classList.remove('show'); return true; }
    for (const [id, back] of LAYER_SCREENS) {
      if (isOpen(id)) { document.getElementById(back).click(); return true; }
    }
    return false;
  }

  // Keeps the browser history in step with the open layers, so the phone's back button works
  let prevLayers = 0, ignorePop = 0;
  function syncHistory() {
    const c = layerCount();
    if (c > prevLayers) {
      for (let i = prevLayers; i < c; i++) history.pushState({ layer: true }, '');
    } else if (c < prevLayers) {
      for (let i = c; i < prevLayers; i++) { ignorePop++; history.back(); }
    }
    prevLayers = c;
  }
  prevLayers = layerCount();
  history.pushState({ guard: true }, '');
  new MutationObserver(syncHistory).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    if (!backAction()) history.pushState({ guard: true }, ''); // home page: stay in the app
    prevLayers = layerCount();
  });

  // Swipe right from the left edge of the screen to go back
  let edgeStart = null;
  window.addEventListener('pointerdown', (e) => {
    edgeStart = e.pointerType === 'touch' && e.clientX < 28 ? { x: e.clientX, y: e.clientY } : null;
  });
  window.addEventListener('pointerup', (e) => {
    if (!edgeStart) return;
    const dx = e.clientX - edgeStart.x, dy = Math.abs(e.clientY - edgeStart.y);
    edgeStart = null;
    if (dx > 90 && dy < 70) backAction();
  });

  /* ----- Delete person (with confirmation) ----- */
  const confirmModal = document.getElementById('confirmModal');
  let confirmAction = null;

  function askConfirm(title, text, onYes) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    confirmAction = onYes;
    confirmModal.classList.remove('hidden');
    setTimeout(() => document.getElementById('confirmNo').focus(), 50);
  }

  function closeConfirm() {
    confirmAction = null;
    confirmModal.classList.add('hidden');
  }

  document.getElementById('confirmYes').addEventListener('click', () => {
    const fn = confirmAction;
    closeConfirm();
    try {
      if (fn) fn();
    } catch (err) {
      console.error(err);
      toast('Delete failed: ' + (err && err.message ? err.message : 'unknown error'));
    }
  });
  document.getElementById('confirmNo').addEventListener('click', closeConfirm);
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeConfirm(); });

  function deletePerson(p) {
    const pr = treeProject;
    if (!pr || !pr.tree) return;
    pr.tree.people = pr.tree.people.filter((q) => q !== p);
    pr.tree.people.forEach((q) => { q.links = q.links.filter((l) => l.id !== p.id); });

    // Remove them from clan lists, and drop clans that have no members left
    clanRegistry.forEach((c) => { c.members = c.members.filter((m) => m.person !== p); });
    for (let i = clanRegistry.length - 1; i >= 0; i--) {
      if (!clanRegistry[i].members.length) clanRegistry.splice(i, 1);
    }

    // Rebuild the related-clan threads from what is left
    clanPairs.clear();
    projects.forEach((q) => { if (q.tree) q.tree.people.forEach((person) => recordClanPairs(person, q)); });

    if (selectedId === p.id) selectedId = null;
    personCard.classList.remove('show');
    updateTreeHint();
    persistProjects(); histPush();
    toast('Person deleted');
  }

  document.getElementById('pcDelete').addEventListener('click', () => {
    const p = personById(selectedId);
    if (!p) return;
    personCard.classList.remove('show');
    askConfirm(
      'Delete ' + p.first + ' ' + p.last + '?',
      'This removes them and all their connections from the family web. This cannot be undone.',
      () => deletePerson(p)
    );
  });

  /* ----- Shared project view ----- */
  const sharedScreen = document.getElementById('sharedScreen');
  const sharedList = document.getElementById('sharedList');

  function showSharedMessage(text) {
    sharedList.textContent = '';
    const em = document.createElement('p');
    em.className = 'search-empty';
    em.textContent = text;
    sharedList.append(em);
  }

  function renderSharedProject(d) {
    document.getElementById('sharedTitle').textContent = d.title || 'Shared project';
    document.getElementById('sharedDesc').textContent = d.description || 'No description.';
    sharedList.textContent = '';
    const people = Array.isArray(d.people) ? d.people : [];
    if (!people.length) {
      showSharedMessage('No people in this project yet.');
      return;
    }
    people.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.style.cursor = 'default';
      const thumb = document.createElement('div');
      thumb.className = 'member-thumb';
      thumb.textContent = (q.first?.[0] || '') + (q.last?.[0] || '');
      const info = document.createElement('div');
      info.className = 'member-info';
      const name = document.createElement('strong');
      name.textContent = (q.first || '') + ' ' + (q.last || '') + (q.isMe ? ' (me)' : '');
      const meta = document.createElement('span');
      const rels = (q.links || []).map((l) => {
        const other = people.find((o) => o.id === l.id);
        return other ? l.rel + ' of ' + other.first + ' ' + other.last : null;
      }).filter(Boolean);
      meta.textContent = (q.clan || 'Unknown') + ' clan · ' +
        (q.gender === 'male' ? 'Male' : q.gender === 'female' ? 'Female' : 'Not specified') + ' · ' +
        (q.status === 'deceased' ? 'Deceased' : 'Living') +
        (rels.length ? ' · ' + rels.join(' · ') : '');
      info.append(name, meta);
      row.append(thumb, info);
      sharedList.append(row);
    });
  }

  async function openSharedFromHash() {
    const inline = location.hash.match(/^#shared-data=([A-Za-z0-9_-]+)$/);
    const legacy = location.hash.match(/^#shared-([a-z0-9]+)$/i);
    if (!inline && !legacy) return;

    homeScreen.classList.add('hidden');
    projectScreen.classList.add('hidden');
    sharedScreen.classList.remove('hidden');
    document.getElementById('sharedTitle').textContent = 'Shared project';
    document.getElementById('sharedDesc').textContent = '';
    sharedList.textContent = '';
    showSharedMessage('Loading shared project…');

    if (inline) {
      try {
        const encoded = inline[1].replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (!data || data.format !== 'abd-family-web-shared' || !Array.isArray(data.people)) {
          throw new Error('Invalid shared project');
        }
        renderSharedProject(data);
      } catch (err) {
        showSharedMessage('This shared project link is invalid or incomplete.');
      }
      return;
    }

    // Keep older database-backed share links working where that service exists.
    const db = await getDb();
    if (!db) {
      showSharedMessage('This is an older share link. Create a new link from the project menu.');
      return;
    }
    try {
      const snap = await db.doc('shared/' + legacy[1]).get();
      if (!snap.exists) {
        showSharedMessage('This shared project is not available.');
        return;
      }
      renderSharedProject(snap.data());
    } catch (err) {
      showSharedMessage('This shared project could not be loaded.');
    }
  }

  document.getElementById('sharedBackBtn').addEventListener('click', () => {
    sharedScreen.classList.add('hidden');
    history.replaceState(null, '', location.pathname + location.search);
    homeScreen.classList.remove('hidden');
  });

  /* ----- About us ----- */
  const aboutScreen = document.getElementById('aboutScreen');
  let aboutReturn = 'home';
  function showAbout(from) {
    aboutReturn = from;
    if (from === 'home') homeScreen.classList.add('hidden');
    else projectScreen.classList.add('hidden');
    aboutScreen.classList.remove('hidden');
    aboutScreen.scrollTop = 0;
  }
  function backFromAbout() {
    aboutScreen.classList.add('hidden');
    if (aboutReturn === 'home') homeScreen.classList.remove('hidden');
    else { projectScreen.classList.remove('hidden'); renderProjects(); }
  }
  document.getElementById('aboutBtn').addEventListener('click', () => showAbout('home'));
  document.getElementById('aboutBtnProjects').addEventListener('click', () => showAbout('projects'));
  document.getElementById('aboutBackBtn').addEventListener('click', backFromAbout);

  /* ----- Rename project ----- */
  const renameModal = document.getElementById('renameModal');
  const renTitle = document.getElementById('renTitle');
  const renDesc = document.getElementById('renDesc');
  const renError = document.getElementById('renError');
  let renameIdx = -1;

  function openRename(i) {
    renameIdx = i;
    renTitle.value = projects[i].title;
    renDesc.value = projects[i].desc || '';
    renError.textContent = '';
    renameModal.classList.remove('hidden');
    setTimeout(() => { renTitle.focus(); renTitle.select(); }, 50);
  }

  function closeRename() { renameModal.classList.add('hidden'); }

  document.getElementById('renameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = renTitle.value.trim();
    if (!title) { renError.textContent = 'Please enter a project title.'; renTitle.focus(); return; }
    projects[renameIdx].title = title;
    projects[renameIdx].desc = renDesc.value.trim();
    persistProjects();
    closeRename();
    renderProjects();
    toast('Project renamed');
  });
  document.getElementById('renCancel').addEventListener('click', closeRename);
  renameModal.addEventListener('click', (e) => { if (e.target === renameModal) closeRename(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRename(); });

  renderProjects();
  addBtn.addEventListener('click', showProjects);
  document.getElementById('backBtn').addEventListener('click', backToHome);
  document.getElementById('newProjectBtn').addEventListener('click', openProjectModal);
  document.getElementById('cancelProjectBtn').addEventListener('click', closeProjectModal);
  projectModal.addEventListener('click', (e) => { if (e.target === projectModal) closeProjectModal(); });
  document.addEventListener('click', () => {
    if (openMenu !== -1) { openMenu = -1; renderProjects(); }
  });
  window.addEventListener('beforeunload', persistProjects);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
      if (openMenu !== -1) { openMenu = -1; renderProjects(); }
    }
  });
  /* ----- Undo / redo (family web tree) ----- */
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  let hStates = [], hIdx = -1;
  function histSnap() {
    if (!treeProject || !treeProject.tree) return '';
    return JSON.stringify({ nextId: treeProject.tree.nextId, people: treeProject.tree.people.map(({ img, ...q }) => q) });
  }
  function histUI() {
    undoBtn.disabled = !(hIdx > 0);
    redoBtn.disabled = !(hIdx >= 0 && hIdx < hStates.length - 1);
  }
  function histReset() { hStates = [histSnap()]; hIdx = 0; histUI(); }
  function histPush() {
    const s = histSnap();
    if (s === hStates[hIdx]) { histUI(); return; }
    hStates = hStates.slice(0, hIdx + 1);
    hStates.push(s);
    if (hStates.length > 40) hStates.shift();
    hIdx = hStates.length - 1;
    histUI();
  }
  function histApply(i) {
    if (!treeProject || i < 0 || i >= hStates.length) return;
    hIdx = i;
    const d = JSON.parse(hStates[i]);
    treeProject.tree.nextId = d.nextId;
    treeProject.tree.people = d.people;
    restoreProjectImages(treeProject);
    rebuildClanRegistry();
    persistProjects();
    selectedId = null;
    personCard.classList.remove('show');
    updateTreeHint();
    histUI();
  }
  function undo() { if (hIdx > 0) { histApply(hIdx - 1); toast('Undone'); } }
  function redo() { if (hIdx < hStates.length - 1) { histApply(hIdx + 1); toast('Redone'); } }
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if (treeScreen.classList.contains('hidden')) return;
    if (!document.getElementById('personModal').classList.contains('hidden')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
  });

  /* ----- Full screen / focus view (home + tree) ----- */
  function inFocus() { return document.body.classList.contains('focus-mode'); }
  function fsUI() {
    const on = inFocus();
    ['fsHome', 'fsTree'].forEach((id) => {
      const b = document.getElementById(id);
      b.setAttribute('aria-label', on ? 'Exit full screen view' : 'Full screen view');
      b.title = on ? 'Exit full screen view' : 'Full screen view';
    });
  }
  function enterFocus() {
    document.body.classList.add('focus-mode');
    fsUI();
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) { const r = el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); }
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (err) { /* browsers without the Fullscreen API still get the clean view */ }
  }
  function exitFocus() {
    if (!inFocus()) return;
    document.body.classList.remove('focus-mode');
    fsUI();
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (err) {}
  }
  ['fsHome', 'fsTree'].forEach((id) => document.getElementById(id).addEventListener('click', () => { if (inFocus()) exitFocus(); else enterFocus(); }));
  const onFsChange = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement && inFocus()) exitFocus(); };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') exitFocus(); });

  /* ----- Help: image by image guide with a working practice model ----- */
  const helpModal = document.getElementById('helpModal');
  const hpStage = document.getElementById('hpStage');
  const SV = (b) => '<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><rect width="320" height="180" fill="#050505"/>' + b + '</svg>';
  const hb = (x, y, w, t, light) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="20" rx="8" fill="' + (light ? '#ececec' : '#2a2a2a') + '"/><text x="' + (x + w / 2) + '" y="' + (y + 13.5) + '" text-anchor="middle" font-size="8.5" font-weight="600" fill="' + (light ? '#000' : '#eee') + '">' + t + '</text>';
  const hi = (x, y, g) => '<rect x="' + x + '" y="' + y + '" width="20" height="20" rx="7" fill="#2a2a2a"/>' + (g || '<circle cx="' + (x + 10) + '" cy="' + (y + 10) + '" r="5" fill="none" stroke="#eee" stroke-width="1.3"/>');
  const hn = (x, y, t, g, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 15) + '" fill="#111" stroke="' + (g ? '#3cff7a' : '#bbb') + '" stroke-width="1.6"/><text x="' + x + '" y="' + (y + 3) + '" text-anchor="middle" font-size="8" fill="#eee">' + t + '</text>';
  const hl = (a, b, c, d) => '<line x1="' + a + '" y1="' + b + '" x2="' + c + '" y2="' + d + '" stroke="#5a605d" stroke-width="1.3"/>';
  const ht = (x, y) => '<circle class="hp-tap" cx="' + x + '" cy="' + y + '" r="6" fill="none" stroke="#3cff7a" stroke-width="2"/><circle cx="' + x + '" cy="' + y + '" r="3.2" fill="#3cff7a"/>';
  const hx = (x, y, t, s, f) => '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="' + (s || 9) + '" fill="' + (f || '#8b918e') + '">' + t + '</text>';
  const brand = '<text x="14" y="22" font-size="9" fill="#fff" font-weight="600">ΔBD <tspan fill="#3cff7a">FAMILY WEB</tspan></text>';
  const topIcons = (extra) => hi(220, 10) + hi(246, 10) + hb(272, 10, 40, 'Add', true) + (extra || '');
  const STEPS = [
    { t: 'Welcome to the galaxy', d: 'The home page is a galaxy of clan crests. Drag to look around, pinch (or Ctrl + scroll) to zoom, and tap a crest to see the family inside it.',
      s: () => SV(hl(80, 100, 160, 80) + hl(160, 80, 240, 110) + hl(160, 80, 150, 40) + hn(80, 100, 'Nair', 0) + hn(160, 80, 'Pillai', 1, 19) + hn(240, 110, 'Menon', 0) + hn(150, 40, 'Iyer', 0, 12) + ht(160, 80) + hx(160, 168, 'Tap a crest to open its family')) },
    { t: 'Add a project', d: 'Press "Add project" at the top right. A project is one family web, for example "My family". Then press "+ Add new project" and give it a name.',
      s: () => SV(brand + hi(14, 36) + hi(40, 36, '<text x="50" y="50" text-anchor="middle" font-size="11" fill="#eee">?</text>') + '<rect x="68" y="36" width="140" height="20" rx="10" fill="#101010"/>' + hx(138, 50, 'Search clan or family', 8) + hb(222, 36, 84, 'Add project', true) + ht(264, 46) + hx(160, 120, 'Top bar of the home page', 9)) },
    { t: 'Open your project', d: 'Your projects are listed as cards. Tap a card to open its family web, or use its menu to rename or share it.',
      s: () => SV(hx(60, 26, 'Projects', 12, '#fff') + hb(200, 12, 108, '+ Add new project', true) + '<rect x="16" y="50" width="130" height="80" rx="14" fill="#101010" stroke="#333"/>' + hx(81, 84, 'My family', 11, '#fff') + hx(81, 102, 'Tap to open', 8) + ht(81, 90) + '<rect x="160" y="50" width="130" height="80" rx="14" fill="#101010" stroke="#222"/>') },
    { t: 'Add yourself first', d: 'In the family web page press "+ Add person". Fill the name, clan, gender and status, then choose "Me" for the very first person. You become the first thread of the web.',
      s: () => SV(hi(172, 10, '<path d="M6 10h8M10 6v8" stroke="#eee" stroke-width="1.4"/>') + hb(200, 10, 40, 'Back') + hb(246, 10, 66, '+ Add person', true) + ht(279, 20) + hn(160, 100, 'Me', 1, 20)) },
    { t: 'Add relatives and friends', d: 'Tap anyone in the web to open their card, then press "Add relative". Pick who they are connected to and the relation, such as Father, Sibling or Friend.',
      s: () => SV(hl(160, 50, 90, 80) + hl(160, 50, 230, 80) + hn(160, 50, 'Me', 1) + hn(90, 80, 'Father') + hn(230, 80, 'Mother') + '<rect x="50" y="112" width="220" height="56" rx="14" fill="#0b0b0b" stroke="#444"/>' + hb(58, 144, 48, 'Add relative', true) + hb(110, 144, 36, 'Delete') + hb(150, 144, 40, 'Modify', true) + hb(194, 144, 38, 'Close') + hx(160, 130, 'Me · Living · 1 thread', 8) + ht(82, 154)) },
    { t: 'Move, zoom and look around', d: 'Drag a person to move them. Drag empty space to pan. Pinch with two fingers, or Ctrl + scroll on a computer, to zoom. Everything saves by itself.',
      s: () => SV(hl(90, 100, 160, 70) + hl(160, 70, 230, 100) + hn(90, 100, 'Dad') + hn(230, 100, 'Mom') + '<g class="hp-move">' + hn(160, 70, 'Me', 1) + '<circle cx="160" cy="70" r="4" fill="#3cff7a"/></g>' + hx(160, 160, 'Drag a person to move it')) },
    { t: 'Undo and redo', d: 'Made a mistake? Use the arrows at the top right of the family web page. Undo steps back through added, edited, deleted or moved people, and redo brings them back. On a computer you can also press Ctrl + Z and Ctrl + Y.',
      s: () => SV(hi(206, 10, '<path d="M8 12 5 9l3-3M5 9h6a3 3 0 0 1 0 6H9" fill="none" stroke="#eee" stroke-width="1.3"/>') + hi(232, 10, '<path d="m12 12 3-3-3-3M15 9H9a3 3 0 0 0 0 6h2" fill="none" stroke="#eee" stroke-width="1.3"/>') + hb(258, 10, 54, 'Add person', true) + ht(216, 20) + hn(120, 100, 'Me', 1) + hn(200, 120, 'New') + hl(120, 100, 200, 120) + hx(160, 168, 'Undo removes "New"; redo brings it back')) },
    { t: 'Full screen view', d: 'Press the corner button at the bottom left, on the home page or the family web page, to hide all tools and see only the family members and clan webs. Press it again, or Esc, to bring the tools back.',
      s: () => SV(hl(90, 70, 160, 90) + hl(160, 90, 235, 60) + hn(90, 70, 'Dad') + hn(160, 90, 'Me', 1) + hn(235, 60, 'Mom') + '<rect x="12" y="144" width="24" height="24" rx="8" fill="#2a2a2a"/><path d="M19 152v-3h3M33 152v-3h-3M19 160v3h3M33 160v3h-3" transform="translate(-6 3)" fill="none" stroke="#eee" stroke-width="1.3"/>' + ht(24, 156) + hx(190, 164, 'Only the web, no buttons')) },
    { t: 'Try it yourself', d: 'This small model works like the real thing. Drag the people, tap one to select it, add a person to connect to it, then try Undo and Redo.', live: true }
  ];
  let hpI = 0;
  const hpDots = document.getElementById('hpDots');
  STEPS.forEach((_, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Step ' + (i + 1)); b.addEventListener('click', () => hpGo(i)); hpDots.append(b); });

  // Practice model
  const PNAMES = ['Father', 'Mother', 'Sibling', 'Friend', 'Uncle', 'Cousin', 'Aunt', 'Niece'];
  let pm = null, pS = [], pI = 0, pSel = 0, pDrag = null, pMoved = false;
  const pSeed = () => ({ n: [{ x: 160, y: 80, t: 'Me' }, { x: 90, y: 50, t: 'Dad' }, { x: 230, y: 50, t: 'Mom' }], l: [[0, 1], [0, 2]], k: 0 });
  function pSnapPush() { const s = JSON.stringify(pm); if (s === pS[pI]) return; pS = pS.slice(0, pI + 1); pS.push(s); pI = pS.length - 1; pDraw(); }
  function pDraw() {
    const sv = document.getElementById('hpLive'); if (!sv) return;
    let o = '<rect width="320" height="160" fill="#050505"/>';
    pm.l.forEach(([a, b]) => { o += hl(pm.n[a].x, pm.n[a].y, pm.n[b].x, pm.n[b].y); });
    pm.n.forEach((q, i) => { o += '<g data-i="' + i + '">' + hn(q.x, q.y, q.t, i === pSel, 15) + '</g>'; });
    sv.innerHTML = o;
    document.getElementById('pUndo').disabled = pI <= 0;
    document.getElementById('pRedo').disabled = pI >= pS.length - 1;
  }
  function pLoad(i) { pI = i; pm = JSON.parse(pS[i]); if (pSel >= pm.n.length) pSel = 0; pDraw(); }
  function pAdd() {
    if (pm.n.length >= 12) return;
    const base = pm.n[pSel], a = pm.k * 1.1 + 0.6, k = pm.n.length;
    const x = Math.min(300, Math.max(20, base.x + Math.cos(a) * 52)), y = Math.min(140, Math.max(20, base.y + Math.sin(a) * 46));
    pm.n.push({ x, y, t: PNAMES[pm.k % PNAMES.length] }); pm.l.push([pSel, k]); pm.k++; pSel = k; pSnapPush();
  }
  function pStart() { pm = pSeed(); pS = [JSON.stringify(pm)]; pI = 0; pSel = 0; pDraw(); }
  function pBuild() {
    hpStage.innerHTML = '<div class="hp-practice"><svg id="hpLive" viewBox="0 0 320 160" aria-label="Practice family web"></svg><div class="hp-practice-bar"><button class="white-clay" type="button" id="pAdd">+ Person</button><button class="white-clay" type="button" id="pUndo">Undo</button><button class="white-clay" type="button" id="pRedo">Redo</button><button class="white-clay" type="button" id="pReset">Reset</button></div></div>';
    const sv = document.getElementById('hpLive');
    const pt = (e) => { const r = sv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 320, y: (e.clientY - r.top) / r.height * 160 }; };
    sv.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-i]'); if (!g) return;
      pDrag = Number(g.dataset.i); pSel = pDrag; pMoved = false; sv.setPointerCapture(e.pointerId); pDraw();
    });
    sv.addEventListener('pointermove', (e) => {
      if (pDrag === null) return; const p = pt(e);
      pm.n[pDrag].x = Math.min(305, Math.max(15, p.x)); pm.n[pDrag].y = Math.min(145, Math.max(15, p.y)); pMoved = true; pDraw();
    });
    const up = () => { if (pDrag === null) return; pDrag = null; if (pMoved) pSnapPush(); };
    sv.addEventListener('pointerup', up); sv.addEventListener('pointercancel', up);
    document.getElementById('pAdd').addEventListener('click', pAdd);
    document.getElementById('pUndo').addEventListener('click', () => { if (pI > 0) pLoad(pI - 1); });
    document.getElementById('pRedo').addEventListener('click', () => { if (pI < pS.length - 1) pLoad(pI + 1); });
    document.getElementById('pReset').addEventListener('click', pStart);
    pStart();
  }

  function hpGo(i) {
    hpI = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[hpI];
    document.getElementById('hpCount').textContent = 'Step ' + (hpI + 1) + ' of ' + STEPS.length;
    document.getElementById('hpTitle').textContent = s.t;
    document.getElementById('hpText').textContent = s.d;
    if (s.live) pBuild(); else hpStage.innerHTML = s.s();
    [...hpDots.children].forEach((b, k) => b.classList.toggle('on', k === hpI));
    document.getElementById('hpPrev').disabled = hpI === 0;
    document.getElementById('hpPrev').style.opacity = hpI === 0 ? '0.4' : '';
    document.getElementById('hpNext').textContent = hpI === STEPS.length - 1 ? 'Done' : 'Next';
  }
  function openHelp() { helpModal.classList.remove('hidden'); hpGo(0); }
  function closeHelp() { helpModal.classList.add('hidden'); }
  document.getElementById('helpBtn').addEventListener('click', openHelp);
  document.getElementById('hpClose').addEventListener('click', closeHelp);
  document.getElementById('hpPrev').addEventListener('click', () => hpGo(hpI - 1));
  document.getElementById('hpNext').addEventListener('click', () => { if (hpI === STEPS.length - 1) closeHelp(); else hpGo(hpI + 1); });
  helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });
  document.addEventListener('keydown', (e) => {
    if (helpModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeHelp();
    else if (e.key === 'ArrowRight') hpGo(hpI + 1);
    else if (e.key === 'ArrowLeft') hpGo(hpI - 1);
  });
  // Swipe between steps on touch screens (not on the practice model)
  let swX = null;
  hpStage.addEventListener('pointerdown', (e) => { swX = STEPS[hpI].live ? null : e.clientX; });
  hpStage.addEventListener('pointerup', (e) => {
    if (swX === null) return;
    const dx = e.clientX - swX; swX = null;
    if (Math.abs(dx) > 50) hpGo(hpI + (dx < 0 ? 1 : -1));
  });

  /* ----- Tree page -> galaxy clan view ----- */
  document.getElementById('clanViewBtn').addEventListener('click', () => {
    exitFocus();
    closePersonModal();
    personCard.classList.remove('show');
    rebuildClanRegistry();
    treeScreen.classList.add('hidden');
    projectScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    if (window.__homeBg) window.__homeBg.focusClanView();
  });

  openSharedFromHash();
})();

(function introGlobe() {
    const intro = document.getElementById('introScreen');
    const content = document.getElementById('introContent');
    const cv = document.getElementById('globe');
    const g = cv.getContext('2d');
    const TAU = Math.PI * 2;
    if (/^#shared-/.test(location.hash)) { intro.classList.add('hidden'); return; }
    const homeScreen = document.getElementById('homeScreen');

    let W = 0, H = 0, R = 100, cx = 0, cy = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.34;
      cx = W / 2; cy = H * 0.42;
    }

    // Points spread evenly over a sphere
    const DOTS = 700;
    const dots = [];
    for (let i = 0; i < DOTS; i++) {
      const y = 1 - 2 * (i + 0.5) / DOTS, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      dots.push({ x: r * Math.cos(th), y, z: r * Math.sin(th) });
    }
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

    // Nodes, each linked to its two nearest nodes by curved threads
    // Hub points: each hub spreads threads out to many points across the globe
    const nodes = [];
    for (let i = 0; i < 60; i++) nodes.push(dots[Math.floor(Math.random() * DOTS)]);
    function makeArc(a, b) {
      const S = 36, om = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), pts = [];
      for (let k = 0; k <= S; k++) {
        const s = k / S, lift = 1 + 0.14 * Math.sin(Math.PI * s);
        const wa = om > 1e-4 ? Math.sin((1 - s) * om) / Math.sin(om) : 1 - s;
        const wb = om > 1e-4 ? Math.sin(s * om) / Math.sin(om) : s;
        pts.push({ x: (a.x * wa + b.x * wb) * lift, y: (a.y * wa + b.y * wb) * lift, z: (a.z * wa + b.z * wb) * lift });
      }
      return { pts, ph: Math.random() };
    }
    const arcs = [];
    const HUBS = 5, SPOKES = 11;
    for (let h = 0; h < HUBS; h++) {
      const targets = nodes.map((_, j) => j).filter((j) => j !== h).sort(() => Math.random() - 0.5).slice(0, SPOKES);
      targets.forEach((j) => arcs.push(makeArc(nodes[h], nodes[j])));
    }

    // Spin the globe, then tilt it a little
    function rot(p, ry) {
      const c = Math.cos(ry), s = Math.sin(ry);
      const x = p.x * c + p.z * s, z = -p.x * s + p.z * c;
      const ct = Math.cos(0.35), st = Math.sin(0.35);
      return { x, y: p.y * ct - z * st, z: p.y * st + z * ct };
    }
    const proj = (p) => ({ x: cx + p.x * R, y: cy - p.y * R, z: p.z });

    function draw(t) {
      const ry = t * 0.0009;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      const hg = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.5);
      hg.addColorStop(0, 'rgba(60,255,122,0.10)');
      hg.addColorStop(1, 'rgba(60,255,122,0)');
      g.fillStyle = hg;
      g.fillRect(0, 0, W, H);

      for (const d of dots) {
        const p = proj(rot(d, ry));
        g.fillStyle = 'rgba(230,240,235,' + (p.z > 0 ? 0.18 + 0.55 * p.z : 0.04) + ')';
        g.fillRect(p.x - 0.7, p.y - 0.7, 1.4, 1.4);
      }

      g.lineWidth = 1;
      for (const arc of arcs) {
        const P = arc.pts.map((q) => proj(rot(q, ry)));
        for (let k = 0; k < P.length - 1; k++) {
          const z = (P[k].z + P[k + 1].z) / 2;
          g.strokeStyle = 'rgba(255,255,255,' + (z > 0 ? 0.15 + 0.6 * z : 0.03) + ')';
          g.beginPath();
          g.moveTo(P[k].x, P[k].y);
          g.lineTo(P[k + 1].x, P[k + 1].y);
          g.stroke();
        }
        const idx = Math.min(P.length - 1, Math.floor(((t * 0.00028 + arc.ph) % 1) * P.length));
        const q = P[idx];
        if (q.z > 0) {
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.beginPath(); g.arc(q.x, q.y, 1.8, 0, TAU); g.fill();
        }
      }

      for (const n of nodes) {
        const p = proj(rot(n, ry));
        if (p.z <= 0) {
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.beginPath(); g.arc(p.x, p.y, 2, 0, TAU); g.fill();
          continue;
        }
        const gl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
        gl.addColorStop(0, 'rgba(255,255,255,0.6)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(p.x, p.y, nodes.indexOf(n) < 5 ? 4.5 : 2.8, 0, TAU); g.fill();
      }
    }

    let running = true;
    const start = performance.now();
    function frame(now) {
      if (!running) return;
      try { draw(now - start); } catch (err) { running = false; console.error(err); }
      requestAnimationFrame(frame);
    }

    function enter() {
      running = false;
      intro.classList.add('hidden');
      homeScreen.classList.remove('hidden');
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
    setTimeout(() => content.classList.add('show'), 1000);
    document.getElementById('enterBtn').addEventListener('click', enter);
  })();
