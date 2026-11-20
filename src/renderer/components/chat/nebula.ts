// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Plano de fundo animado "Nebula" (WebGL, sem dependências) usado no chat de IA no tema claro.
 *
 * Duas passagens: a nebulosa é desenhada em baixa resolução numa textura e depois composta, em resolução maior, com o
 * campo de estrelas. Para não pesar no computador: octaves de ruído reduzidos, resolução interna baixa, limite de
 * quadros por segundo, e a animação PAUSA quando o elemento sai da tela, a aba fica oculta ou a gaveta é recolhida.
 */

const VERT =
  "attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}";

const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform vec2 uAspect;
uniform float uTime;
uniform float uSeed;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
float hash31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void camera(float t,out float ang,out vec2 cam){
  ang=t*0.025+sin(t*0.07)*0.06;
  cam=vec2(sin(t*0.06)*0.5+t*0.012, cos(t*0.045)*0.4+sin(t*0.021)*0.2);
}`;

const NEB_FRAG =
  COMMON +
  `
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise3(p);p=p*2.07+vec3(13.1,7.7,3.3);a*=.52;}return s;}
float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*noise3(p);p=p*2.03+vec3(13.1,7.7,3.3);a*=.5;}return s;}
float billow(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*abs(2.*noise3(p)-1.);p=p*2.15+vec3(3.3,9.1,5.5);a*=.5;}return s;}
float ridged(vec3 p){float s=0.,a=.55;for(int i=0;i<3;i++){float n=1.-abs(2.*noise3(p)-1.);s+=a*n*n;p=p*2.1+vec3(5.2,1.3,8.8);a*=.5;}return s;}
uniform vec3 uViolet;
uniform vec3 uLilac;
uniform vec3 uPink;
#define VIOLET uViolet
#define LILAC uLilac
#define PINK uPink
const vec3 YELLOW=vec3(1.00,0.92,0.50);
const vec3 LIME  =vec3(0.72,1.00,0.45);
const vec3 CYAN  =vec3(0.45,0.96,1.00);
const vec3 RED   =vec3(1.00,0.32,0.38);
vec3 layer(vec2 uv,float t,float seed,out float alpha){
  vec3 p=vec3(uv,t*0.04+seed);
  vec2 q=vec2(fbm3(p+vec3(0.,0.,1.7)),fbm3(p+vec3(5.2,1.3,2.8)));
  vec3 pw=p+vec3((q-0.5)*0.9,0.);
  float n=fbm(pw);
  n+=(billow(pw*3.0+vec3(0.,0.,7.3))-0.5)*0.15;
  float r=ridged(pw*1.6+vec3(0.,0.,3.1));
  float dens=smoothstep(0.47,0.80,n);
  float fil=smoothstep(0.55,0.92,r)*smoothstep(0.42,0.62,n)*0.6;
  float c1=clamp((fbm3(pw*0.45+vec3(31.,17.,0.))-0.5)*2.8+0.5,0.,1.);
  float c2=clamp((fbm3(pw*0.8+vec3(7.,91.,3.))-0.5)*2.8+0.5,0.,1.);
  vec3 col=mix(VIOLET,LILAC,smoothstep(0.20,0.58,c1));
  col=mix(col,PINK,smoothstep(0.38,0.72,c2));
  col=mix(col,CYAN,smoothstep(0.60,0.88,c1)*0.95);
  col=mix(col,LIME,smoothstep(0.60,0.88,c2)*smoothstep(0.02,0.14,c1)*(1.-smoothstep(0.20,0.34,c1))*0.6*dens);
  col=mix(col,RED,pow(smoothstep(0.70,0.92,n),2.)*smoothstep(0.32,0.10,c2)*0.75);
  col=mix(col,YELLOW,fil*fil*0.7*smoothstep(0.50,0.78,c1)*dens);
  col=col*1.2+dens*dens*0.65*mix(mix(LILAC,PINK,c2),CYAN,smoothstep(0.6,0.9,c1))+fil*fil*0.6*mix(PINK,YELLOW,c1);
  alpha=clamp(dens*0.9+fil*0.35,0.,1.);
  return col;
}
void main(){
  vec2 uv=(v-0.5)*uAspect;
  float t=uTime;float ang;vec2 cam;camera(t,ang,cam);
  vec3 col=vec3(0.);float cov=1.;float a;vec3 c;
  c=layer(rot(ang*0.7)*uv*2.3+cam*0.5,t*0.8,uSeed+3.1,a);a*=0.5;col+=c*a;cov*=1.-a;
  c=layer(rot(ang*0.85)*uv*1.5+cam*0.9,t,uSeed+17.3,a);a*=0.65;col+=c*a;cov*=1.-a;
  c=layer(rot(ang)*uv*1.0+cam*1.4,t*1.2,uSeed+41.7,a);a*=0.8;col+=c*a;cov*=1.-a;
  float h=noise3(vec3(uv*0.8+cam*0.2,t*0.02+uSeed));
  float h2=noise3(vec3(uv*0.5+cam*0.15+vec2(40.,9.),t*0.015+uSeed));
  vec3 haze=mix(vec3(0.16,0.09,0.30),vec3(0.30,0.19,0.47),h);
  haze=mix(haze,vec3(0.13,0.30,0.42),smoothstep(0.5,0.8,h2)*0.7);
  col=haze+col;
  gl_FragColor=vec4(col,1.-cov);
}`;

const STAR_FRAG =
  COMMON +
  `
uniform sampler2D uNeb;
uniform float uStarDensity;
vec3 starField(vec2 p,float cells,float thr,float bright,float t,float seed,bool spikes){
  thr=1.-(1.-thr)*uStarDensity;
  vec2 g=floor(p*cells),f=fract(p*cells);
  vec3 acc=vec3(0.);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y));vec2 id=g+o+seed;
    float h=hash21(id);
    if(h>thr){
      float sz=(h-thr)/max(1.-thr,1e-4);
      vec2 sp=o+vec2(hash21(id+1.3),hash21(id+7.1))-f;
      float d=length(sp);
      float tw=0.55+0.45*sin(t*(1.0+hash21(id+3.7)*3.5)+hash21(id+9.9)*6.2832);
      float b=bright*(0.3+sz*sz*1.4)*tw;
      float glow=b*0.004/(d*d+0.0012);
      float tint=hash21(id+5.5);
      vec3 sc=mix(mix(vec3(0.72,0.85,1.0),vec3(1.0),smoothstep(0.3,0.5,tint)),vec3(1.0,0.85,0.70),smoothstep(0.6,0.9,tint));
      float sp2=0.;
      if(spikes&&sz>0.6){
        float k=(sz-0.6)*2.5;
        sp2=k*b*0.6*(smoothstep(0.35*k,0.,abs(sp.x))*smoothstep(0.012,0.,abs(sp.y))+smoothstep(0.35*k,0.,abs(sp.y))*smoothstep(0.012,0.,abs(sp.x)));
      }
      acc+=sc*(glow+sp2);
    }
  }
  return acc;
}
void main(){
  vec2 uv=(v-0.5)*uAspect;
  float t=uTime;float ang;vec2 cam;camera(t,ang,cam);
  vec4 nb=texture2D(uNeb,v);
  vec3 col=nb.rgb;
  float occ=1.-nb.a*0.45;
  vec3 s=vec3(0.);
  s+=starField(rot(ang*0.6)*uv+cam*0.4,30.,0.90,0.85,t,uSeed,false)*occ;
  s+=starField(rot(ang*0.8)*uv+cam*0.7,16.,0.93,1.2,t,uSeed+11.,false)*occ;
  s+=starField(rot(ang)*uv+cam*1.2,7.,0.965,1.8,t,uSeed+23.,true);
  col+=s;
  vec2 vv=(v-0.5)*2.;col*=1.-0.18*dot(vv,vv);
  col=max(col,0.);col=col/(1.+col*0.35);
  gl_FragColor=vec4(col,1.);
}`;

/**
 * Compila um shader.
 * @param {WebGLRenderingContext} gl - Contexto.
 * @param {number} type - Tipo do shader.
 * @param {string} src - Código GLSL.
 * @returns {WebGLShader}
 */
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Nebula: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

/**
 * Liga um programa WebGL.
 * @param {WebGLRenderingContext} gl - Contexto.
 * @param {string} vs - Vertex shader.
 * @param {string} fs - Fragment shader.
 * @returns {WebGLProgram}
 */
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "a");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Nebula link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

/**
 * Valores padrão. A semente é sorteada a cada montagem, para a nebulosa ser diferente a cada inicialização.
 * Qualidade: textura da nebulosa a 45% da resolução (antes 30%), mais estrelas (densidade 2.4) e DPR até 1.5.
 */
const DEFAULTS = {
  speed: 0.4,
  seed: null,
  starDensity: 3.2,
  nebulaScale: 0.45,
  scale: 240,
  maxDPR: 1.5,
  maxFps: 30,
};

/**
 * Monta o fundo nebulosa dentro de um elemento (o canvas fica atrás do conteúdo).
 * @param {HTMLElement} el - Contêiner (deve ter `position` e `overflow: hidden`).
 * @param {Object} [options] - `speed`, `seed`, `starDensity`, `nebulaScale`, `scale`, `maxDPR`, `maxFps`.
 * @returns {{canvas: HTMLCanvasElement, pause: () => void, resume: () => void, destroy: () => void}}
 */
export function mountNebula(el, options = {}) {
  const o = { ...DEFAULTS, ...options };
  /** Paleta (0 a 1 por canal): cores principal, clara e de destaque. */
  const palette = { violet: [0.5, 0.17, 0.92], lilac: [0.8, 0.62, 0.98], pink: [1, 0.48, 0.8] };
  const setPalette = (colors) => {
    for (const key of Object.keys(palette)) {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colors?.[key] || "");
      if (m) palette[key] = [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
    }
  };
  setPalette(options.colors);
  if (o.seed === null || o.seed === undefined) o.seed = 1 + Math.random() * 60;
  const canvas = document.createElement("canvas");
  canvas.className = "nebula-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  el.insertBefore(canvas, el.firstChild);

  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    // Sem WebGL: degradê estático
    canvas.style.background =
      "radial-gradient(ellipse at 30% 40%, #7b3fe4 0%, #ff7ac8 35%, #1a0a33 75%)";
    return { canvas, pause() {}, resume() {}, destroy: () => canvas.remove() };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pNeb = program(gl, VERT, NEB_FRAG);
  const pStar = program(gl, VERT, STAR_FRAG);
  const loc = (p, n) => gl.getUniformLocation(p, n);
  const uN = {
    aspect: loc(pNeb, "uAspect"),
    time: loc(pNeb, "uTime"),
    seed: loc(pNeb, "uSeed"),
    violet: loc(pNeb, "uViolet"),
    lilac: loc(pNeb, "uLilac"),
    pink: loc(pNeb, "uPink"),
  };
  const uS = {
    aspect: loc(pStar, "uAspect"),
    time: loc(pStar, "uTime"),
    seed: loc(pStar, "uSeed"),
    neb: loc(pStar, "uNeb"),
    dens: loc(pStar, "uStarDensity"),
  };

  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let W = 1;
  let H = 1;
  let NW = 1;
  let NH = 1;
  let aspect = [1, 1];

  const resize = () => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, o.maxDPR);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W;
    canvas.height = H;
    NW = Math.max(48, Math.round(W * o.nebulaScale));
    NH = Math.max(48, Math.round(H * o.nebulaScale));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      NW,
      NH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const unit = Math.max(1, o.scale * dpr);
    aspect = [W / unit, H / unit];
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) kick();
  });
  io.observe(el);
  const onVisibility = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener("visibilitychange", onVisibility);

  let time = 0;
  let last = null;
  let raf = 0;
  let running = true;
  let destroyed = false;
  const minDt = 1 / o.maxFps;

  const render = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, NW, NH);
    gl.useProgram(pNeb);
    gl.uniform2f(uN.aspect, aspect[0], aspect[1]);
    gl.uniform1f(uN.time, time);
    gl.uniform1f(uN.seed, o.seed);
    gl.uniform3f(uN.violet, palette.violet[0], palette.violet[1], palette.violet[2]);
    gl.uniform3f(uN.lilac, palette.lilac[0], palette.lilac[1], palette.lilac[2]);
    gl.uniform3f(uN.pink, palette.pink[0], palette.pink[1], palette.pink[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pStar);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uS.neb, 0);
    gl.uniform2f(uS.aspect, aspect[0], aspect[1]);
    gl.uniform1f(uS.time, time);
    gl.uniform1f(uS.seed, o.seed);
    gl.uniform1f(uS.dens, o.starDensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (now) => {
    raf = 0;
    if (destroyed || !running || !visible || document.hidden) {
      last = null;
      return;
    }
    const dt = last === null ? minDt : (now - last) / 1000;
    if (dt < minDt * 0.95) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    time += Math.min(dt, 0.1) * o.speed;
    render();
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && !destroyed && running) raf = requestAnimationFrame(frame);
  };
  kick();

  return {
    canvas,
    setColors(colors) {
      setPalette(colors);
      if (!running) render();
    },
    pause() {
      running = false;
    },
    resume() {
      running = true;
      kick();
    },
    destroy() {
      destroyed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      gl.deleteProgram(pNeb);
      gl.deleteProgram(pStar);
      gl.deleteBuffer(quad);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
