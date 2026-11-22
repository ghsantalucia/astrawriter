/**
 * @file Plano de fundo animado "Órbitas" do chat: vetorial (só contorno), sem dependências. Planetas com luas em órbita,
 * asteroides cruzando a tela e estrelas piscando, num canto do elemento (1/4 de círculo visível). Tudo é SVG animado
 * (SMIL) e as cores vêm de variáveis CSS (`--ob-*`), então trocar as cores não reconstrói a cena.
 */

const DEFAULTS = {
  background: "#c0c8e6",
  stroke: "#ededed",
  orbitColor: "#e1e1e1",
  planetColor: "#ededed",
  moonColor: "#ffffff",
  asteroidColor: "#d1d1d1",
  starColor: "#ffffff",
  strokeWidth: 1.4,
  orbitOpacity: 0.35,
  corner: "bottom-left",
  orbits: 6,
  planets: 7,
  moons: 4,
  asteroids: 3,
  stars: 45,
  speed: 1,
  seed: 7,
};

/** Paletas prontas para cada tema (a cor de fundo pode ser trocada pelo usuário). */
export const ORBIT_PRESETS = {
  light: { ...DEFAULTS },
  dark: {
    ...DEFAULTS,
    background: "#1b1530",
    stroke: "#e6c7ff",
    orbitColor: "#7b6aa6",
    planetColor: "#e6c7ff",
    moonColor: "#e6c7ff",
    asteroidColor: "#ffb8d1",
    starColor: "#ffe9a8",
  },
};

/** Tamanho do viewBox. */
const V = 1000;
const NS = "http://www.w3.org/2000/svg";

/**
 * Gerador pseudo-aleatório com seed (mulberry32): o mesmo seed gera sempre o mesmo arranjo.
 * @param {number} seed - Semente.
 * @returns {() => number}
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cria um elemento SVG.
 * @param {string} name - Tag.
 * @param {Object} attrs - Atributos.
 * @param {string} [style] - Estilo inline.
 * @returns {SVGElement}
 */
function el(name, attrs?, style?) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (style) node.setAttribute("style", style);
  return node;
}

/**
 * Centro das órbitas conforme o canto escolhido.
 * @param {string} corner - Canto.
 * @returns {[number, number]}
 */
function centerFor(corner) {
  switch (corner) {
    case "top-left":
      return [0, 0];
    case "top-right":
      return [V, 0];
    case "bottom-right":
      return [V, V];
    case "center":
      return [V / 2, V / 2];
    default:
      return [0, V];
  }
}

/**
 * Desenha um planeta (liso, com anel, com crateras ou listrado).
 * @param {SVGElement} g - Grupo do planeta.
 * @param {number} size - Raio.
 * @param {string} type - Tipo.
 * @param {() => number} r - Gerador aleatório.
 * @param {string} color - Cor do contorno.
 * @returns {void}
 */
function drawPlanet(g, size, type, r, color) {
  const st = `stroke:${color}`;
  g.appendChild(el("circle", { r: size }, st));
  if (type === "ringed") {
    g.appendChild(
      el(
        "ellipse",
        { rx: size * 1.9, ry: size * 0.5, transform: "rotate(-18)" },
        st,
      ),
    );
  } else if (type === "cratered") {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * size * 0.5;
      g.appendChild(
        el(
          "circle",
          {
            cx: Math.cos(a) * d,
            cy: Math.sin(a) * d,
            r: size * (0.12 + r() * 0.16),
          },
          st,
        ),
      );
    }
  } else if (type === "striped") {
    [-0.45, 0, 0.4].forEach((f) => {
      const y = f * size;
      const dx = Math.sqrt(size * size - y * y) * 0.96;
      g.appendChild(
        el("path", { d: `M${-dx},${y} Q0,${y + size * 0.18} ${dx},${y}` }, st),
      );
    });
  }
}

/**
 * Contorno irregular de um asteroide.
 * @param {() => number} r - Gerador aleatório.
 * @param {number} size - Tamanho.
 * @returns {string}
 */
function asteroidPath(r, size) {
  const n = 6 + Math.floor(r() * 3);
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = size * (0.65 + r() * 0.5);
    d += `${i ? "L" : "M"}${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * Estrela de quatro pontas.
 * @param {number} s - Tamanho.
 * @returns {string}
 */
function starPath(s) {
  const i = s * 0.32;
  return `M0,${-s} L${i},${-i} L${s},0 L${i},${i} L0,${s} L${-i},${i} L${-s},0 L${-i},${-i} Z`;
}

/**
 * Monta a cena SVG.
 * @param {Object} o - Opções.
 * @returns {SVGSVGElement}
 */
function build(o) {
  const r = rng(o.seed);
  const [cx, cy] = centerFor(o.corner);
  const spd = 1 / Math.max(0.05, o.speed);

  const svg = el(
    "svg",
    {
      viewBox: `0 0 ${V} ${V}`,
      preserveAspectRatio: "xMidYMid slice",
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": o.strokeWidth,
      "aria-hidden": "true",
    },
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block",
  );
  svg.classList.add("orbit-bg-svg");

  const c = {
    orbit: "var(--ob-orbit)",
    planet: "var(--ob-planet)",
    moon: "var(--ob-moon)",
    asteroid: "var(--ob-asteroid)",
    star: "var(--ob-star)",
  };

  // Estrelas
  const starsG = el("g");
  for (let i = 0; i < o.stars; i++) {
    const x = r() * V;
    const y = r() * V;
    const s = 3 + r() * 6;
    const g = el("g", {
      transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
    });
    const dx = (r() - 0.5) * 40;
    const dy = (r() - 0.5) * 40;
    g.appendChild(
      el("animateTransform", {
        attributeName: "transform",
        type: "translate",
        additive: "sum",
        values: `0 0; ${dx.toFixed(1)} ${dy.toFixed(1)}; 0 0`,
        dur: `${(40 + r() * 40) * spd}s`,
        begin: `-${(r() * 40).toFixed(1)}s`,
        repeatCount: "indefinite",
      }),
    );
    const shape =
      r() < 0.7
        ? el("path", { d: starPath(s) }, `stroke:${c.star}`)
        : el("circle", { r: s * 0.35 }, `stroke:${c.star}`);
    shape.appendChild(
      el("animate", {
        attributeName: "opacity",
        values: "0.15;1;0.15",
        dur: `${(2.5 + r() * 5) * spd}s`,
        begin: `-${(r() * 6).toFixed(1)}s`,
        repeatCount: "indefinite",
      }),
    );
    g.appendChild(shape);
    starsG.appendChild(g);
  }
  svg.appendChild(starsG);

  // Órbitas
  const isCorner = o.corner !== "center";
  const rMin = isCorner ? V * 0.14 : V * 0.1;
  const rMax = isCorner ? V * 1.32 : V * 0.47;
  const radii = [];
  const orbitsG = el("g", { opacity: o.orbitOpacity });
  for (let i = 0; i < o.orbits; i++) {
    const base = rMin + (rMax - rMin) * ((i + 0.5) / o.orbits);
    const rad = base + (((r() - 0.5) * (rMax - rMin)) / o.orbits) * 0.5;
    radii.push(rad);
    orbitsG.appendChild(
      el("circle", { cx, cy, r: rad.toFixed(1) }, `stroke:${c.orbit}`),
    );
  }
  svg.appendChild(orbitsG);

  // Planetas (e luas)
  const types = ["plain", "ringed", "cratered", "striped"];
  const planetsG = el("g");
  let moonsLeft = o.moons;
  for (let i = 0; i < o.planets; i++) {
    const rad = radii[i % radii.length];
    const start = r() * 360;
    const dir = r() < 0.25 ? -1 : 1;
    const period =
      (55 + 70 * Math.pow(rad / V, 0.9)) * (0.85 + r() * 0.3) * spd;
    const size = 9 + rad * 0.022 + r() * 6;

    const orbitG = el("g");
    orbitG.appendChild(
      el("animateTransform", {
        attributeName: "transform",
        type: "rotate",
        from: `${start} ${cx} ${cy}`,
        to: `${start + 360 * dir} ${cx} ${cy}`,
        dur: `${period.toFixed(1)}s`,
        repeatCount: "indefinite",
      }),
    );

    const pos = el("g", {
      transform: `translate(${(cx + rad).toFixed(1)} ${cy})`,
    });
    const body = el("g");
    body.appendChild(
      el("animateTransform", {
        attributeName: "transform",
        type: "rotate",
        from: "0",
        to: `${dir * 360}`,
        dur: `${(30 + r() * 40) * spd}s`,
        repeatCount: "indefinite",
      }),
    );
    drawPlanet(body, size, types[Math.floor(r() * types.length)], r, c.planet);
    pos.appendChild(body);

    if (moonsLeft > 0 && (r() < 0.6 || o.planets - i <= moonsLeft)) {
      const count = Math.min(moonsLeft, 1 + (r() < 0.3 ? 1 : 0));
      for (let m = 0; m < count; m++) {
        const mr = size * (1.8 + m * 0.7);
        pos.appendChild(
          el(
            "circle",
            { r: mr.toFixed(1), "stroke-dasharray": "2 5", opacity: 0.6 },
            `stroke:${c.moon}`,
          ),
        );
        const mg = el("g");
        const mstart = r() * 360;
        const mdir = r() < 0.5 ? -1 : 1;
        mg.appendChild(
          el("animateTransform", {
            attributeName: "transform",
            type: "rotate",
            from: `${mstart}`,
            to: `${mstart + 360 * mdir}`,
            dur: `${(9 + r() * 12) * spd}s`,
            repeatCount: "indefinite",
          }),
        );
        mg.appendChild(
          el(
            "circle",
            { cx: mr.toFixed(1), cy: 0, r: (size * 0.26).toFixed(1) },
            `stroke:${c.moon}`,
          ),
        );
        pos.appendChild(mg);
      }
      moonsLeft -= count;
    }

    orbitG.appendChild(pos);
    planetsG.appendChild(orbitG);
  }
  svg.appendChild(planetsG);

  // Asteroides cruzando a tela
  const astG = el("g");
  for (let i = 0; i < o.asteroids; i++) {
    const size = 7 + r() * 8;
    const horiz = r() < 0.5;
    const flip = r() < 0.5 ? 1 : -1;
    let x1;
    let y1;
    let x2;
    let y2;
    if (horiz) {
      x1 = flip > 0 ? -80 : V + 80;
      x2 = V - x1;
      y1 = r() * V;
      y2 = y1 + (r() - 0.5) * V * 0.8;
    } else {
      y1 = flip > 0 ? -80 : V + 80;
      y2 = V - y1;
      x1 = r() * V;
      x2 = x1 + (r() - 0.5) * V * 0.8;
    }
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const dur = (16 + r() * 22) * spd;

    const g = el("g");
    g.appendChild(
      el("animateTransform", {
        attributeName: "transform",
        type: "translate",
        from: `${x1.toFixed(1)} ${y1.toFixed(1)}`,
        to: `${x2.toFixed(1)} ${y2.toFixed(1)}`,
        dur: `${dur.toFixed(1)}s`,
        begin: `-${(r() * dur).toFixed(1)}s`,
        repeatCount: "indefinite",
      }),
    );
    const trail = el("g", {
      transform: `rotate(${ang.toFixed(1)})`,
      opacity: 0.55,
    });
    trail.appendChild(
      el(
        "line",
        {
          x1: -size * 1.6,
          y1: 0,
          x2: -size * 4.2,
          y2: 0,
          "stroke-dasharray": "4 5",
        },
        `stroke:${c.asteroid}`,
      ),
    );
    trail.appendChild(
      el(
        "line",
        {
          x1: -size * 1.3,
          y1: size * 0.7,
          x2: -size * 2.8,
          y2: size * 0.7,
          "stroke-dasharray": "3 6",
        },
        `stroke:${c.asteroid}`,
      ),
    );
    g.appendChild(trail);
    const body = el("g");
    body.appendChild(
      el("animateTransform", {
        attributeName: "transform",
        type: "rotate",
        from: "0",
        to: r() < 0.5 ? "360" : "-360",
        dur: `${(6 + r() * 8) * spd}s`,
        repeatCount: "indefinite",
      }),
    );
    body.appendChild(
      el("path", { d: asteroidPath(r, size) }, `stroke:${c.asteroid}`),
    );
    g.appendChild(body);
    astG.appendChild(g);
  }
  svg.appendChild(astG);

  return svg;
}

/**
 * Aplica as cores ao contêiner (variáveis CSS lidas pelo SVG).
 * @param {HTMLElement} container - Elemento do fundo.
 * @param {Object} o - Opções com as cores.
 * @returns {void}
 */
function applyColors(container, o) {
  const s = container.style;
  s.setProperty("--ob-bg", o.background);
  s.setProperty("--ob-orbit", o.orbitColor || o.stroke);
  s.setProperty("--ob-planet", o.planetColor || o.stroke);
  s.setProperty("--ob-moon", o.moonColor || o.stroke);
  s.setProperty("--ob-asteroid", o.asteroidColor || o.stroke);
  s.setProperty("--ob-star", o.starColor || o.stroke);
  s.backgroundColor = "var(--ob-bg)";
  s.backgroundImage = "none";
}

/**
 * Monta o fundo de órbitas dentro de um elemento.
 * @param {HTMLElement} container - Elemento que recebe o fundo (o conteúdo fica por cima).
 * @param {Object} [options] - Opções (ver `ORBIT_PRESETS`).
 * @returns {{pause: Function, resume: Function, setBackground: (color: string) => void, destroy: Function}}
 */
export function mountOrbits(container, options = {}) {
  const o = { ...DEFAULTS, ...options };
  applyColors(container, o);
  const svg = build(o);
  container.insertBefore(svg, container.firstChild);

  return {
    pause: () => svg.pauseAnimations(),
    resume: () => svg.unpauseAnimations(),
    setBackground(color) {
      container.style.setProperty("--ob-bg", color);
    },
    destroy() {
      svg.remove();
      const s = container.style;
      [
        "--ob-bg",
        "--ob-orbit",
        "--ob-planet",
        "--ob-moon",
        "--ob-asteroid",
        "--ob-star",
      ].forEach((name) => s.removeProperty(name));
      s.backgroundColor = "";
      s.backgroundImage = "";
    },
  };
}
