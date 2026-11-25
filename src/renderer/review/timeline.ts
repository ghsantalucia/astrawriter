/**
 * @file Lógica (sem IA) da linha do tempo a partir das fichas de eventos (`assets/events/`). Cada evento tem um momento
 * (`when`, texto livre como "ano 312" ou "durante a guerra") e relações de ordem com outros eventos (`after` e `before`,
 * nomes de outros eventos). Daqui saem:
 *  - uma **sugestão de ordem** (ordenação topológica, desempatada pelo ano quando existe);
 *  - **issues** da categoria "linha do tempo": ordem circular, momento que contradiz a ordem declarada, referência a evento
 *    inexistente e evento sem posição nenhuma.
 *
 * A decisão final de colocar algo na linha do tempo é sempre do autor ou da IA; isto só sugere e economiza processamento.
 */

import { foldText } from "../utils/helpers.js";
import { shortHash } from "./issueCheckers.js";
import { typeInfo } from "./issueTypes.js";
import { t, intlLocale } from "../../shared/i18n.js";

/** Arquivos de `assets/events/` que não são eventos. */
const NOT_EVENT = /(^|\/)(index|template|timeline)\.md$/i;

/**
 * Indica se um caminho (relativo ao livro) é uma ficha de evento.
 * @param {string} rel - Caminho relativo.
 * @returns {boolean}
 */
export function isEventFile(rel) {
  return /^assets\/events\/.+\.md$/i.test(rel) && !NOT_EVENT.test(rel);
}

/**
 * Lê o número do ano de um momento em texto livre ("ano 312", "312 d.C.", "Ano 5, inverno", "300 a.C.").
 * @param {string} when - Momento.
 * @returns {number|null} O ano, ou null se não há número.
 */
export function parseYear(when) {
  const text = String(when || "");
  const match = text.match(/-?\d+/);
  if (!match) return null;
  let year = parseInt(match[0], 10);
  if (/a\.?\s?c\b|antes de cristo|\bBC\b/i.test(text) && year > 0) year = -year;
  return year;
}

/**
 * Divide uma lista de nomes separados por vírgula, ponto e vírgula ou quebra de linha.
 * @param {string} value - Texto bruto.
 * @returns {string[]}
 */
export function splitNames(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Extrai os dados de evento do frontmatter de uma ficha.
 * @param {string} rel - Caminho relativo.
 * @param {Object} meta - Frontmatter da ficha.
 * @param {string} title - Título.
 * @returns {{rel: string, title: string, aliases: string[], when: string, after: string[], before: string[]}}
 */
export function eventFromMetadata(rel, meta, title) {
  const field = (name) => meta?.data?.[name]?.content ?? "";
  return {
    rel,
    title,
    aliases: splitNames(field("aliases")),
    when: String(field("when") || "").trim(),
    after: splitNames(field("after")),
    before: splitNames(field("before")),
  };
}

/**
 * Cria um issue da linha do tempo.
 * @param {string} type - Tipo.
 * @param {string} file - Ficha do evento.
 * @param {string} message - Mensagem.
 * @returns {Object}
 */
function timelineIssue(type, file, message) {
  const info = typeInfo(type);
  return {
    id: `t-${shortHash(`${type}|${file}|${message}`)}`,
    category: info.category,
    type,
    severity: info.severity,
    source: "system",
    file,
    start: null,
    end: null,
    line: null,
    excerpt: "",
    message,
  };
}

/**
 * Analisa os eventos: monta o grafo de ordem, procura ciclos e contradições e sugere a ordem final.
 * @param {Array<{rel: string, title: string, aliases: string[], when: string, after: string[], before: string[]}>} events - Eventos.
 * @returns {{ordered: Array<Object>, issues: Object[]}}
 */
export function analyzeTimeline(events) {
  const issues = [];
  const byName = new Map<any, any>();
  for (const e of events) {
    for (const name of [e.title, ...e.aliases]) {
      const key = foldText(name);
      if (key && !byName.has(key)) byName.set(key, e);
    }
  }

  // Aresta A -> B significa "A aconteceu antes de B"
  const edges = new Map<any, Set<any>>(events.map((e) => [e.rel, new Set()]));
  const addEdge = (from, to) => {
    if (from.rel !== to.rel) edges.get(from.rel).add(to.rel);
  };
  for (const e of events) {
    for (const name of e.after) {
      const other = byName.get(foldText(name));
      if (!other) {
        issues.push(timelineIssue("timeline-ref", e.rel, t('"{title}" cita o evento "{name}" (depois de), mas não existe uma ficha de evento com esse nome.', { title: e.title, name })));
        continue;
      }
      addEdge(other, e);
    }
    for (const name of e.before) {
      const other = byName.get(foldText(name));
      if (!other) {
        issues.push(timelineIssue("timeline-ref", e.rel, t('"{title}" cita o evento "{name}" (antes de), mas não existe uma ficha de evento com esse nome.', { title: e.title, name })));
        continue;
      }
      addEdge(e, other);
    }
  }

  const byRel = new Map<any, any>(events.map((e) => [e.rel, e]));
  const year = (e) => parseYear(e.when);

  // Momento que contradiz a ordem declarada
  for (const [from, targets] of edges) {
    for (const to of targets) {
      const a = byRel.get(from);
      const b = byRel.get(to);
      if (year(a) !== null && year(b) !== null && year(a) > year(b)) {
        issues.push(timelineIssue("timeline-order", b.rel, t('"{a}" ({whenA}) deveria vir antes de "{b}" ({whenB}), mas o momento informado é posterior.', { a: a.title, whenA: a.when, b: b.title, whenB: b.when })));
      }
    }
  }

  // Ciclos (componentes fortemente conectados com mais de um evento)
  const index = new Map<any, number>();
  const low = new Map<any, number>();
  const onStack = new Set<any>();
  const stack: any[] = [];
  let counter = 0;
  const cyclic = new Set<any>();
  const visit = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) {
        component.forEach((rel) => cyclic.add(rel));
        const titles = component.map((rel) => byRel.get(rel).title).sort();
        issues.push(
          timelineIssue(
            "timeline-cycle",
            component.map((rel) => rel).sort()[0],
            t('Ordem circular entre os eventos: {chain} → {first}. Um deles precisa ser o primeiro.', { chain: titles.join(" → "), first: titles[0] }),
          ),
        );
      }
    }
  };
  for (const e of events) if (!index.has(e.rel)) visit(e.rel);

  // Eventos sem posição nenhuma (sem momento e sem relação com outros)
  const linked = new Set<any>();
  for (const [from, targets] of edges) {
    if (targets.size) linked.add(from);
    targets.forEach((t) => linked.add(t));
  }
  for (const e of events) {
    if (!e.when && !linked.has(e.rel)) {
      issues.push(timelineIssue("timeline-gap", e.rel, t('"{title}" não tem momento nem relação de ordem com outros eventos: fica fica na seção "sem data conhecida" da linha do tempo.', { title: e.title })));
    }
  }

  // Sugestão de ordem: ordenação topológica (Kahn), desempatando por ano e título
  const indegree = new Map<any, number>(events.map((e) => [e.rel, 0]));
  for (const targets of edges.values()) targets.forEach((t) => indegree.set(t, indegree.get(t) + 1));
  const compare = (x, y) => {
    const ya = year(byRel.get(x));
    const yb = year(byRel.get(y));
    if (ya !== null && yb !== null && ya !== yb) return ya - yb;
    if (ya !== null && yb === null) return -1;
    if (ya === null && yb !== null) return 1;
    return byRel.get(x).title.localeCompare(byRel.get(y).title, intlLocale(), { numeric: true });
  };
  const ready = events.filter((e) => indegree.get(e.rel) === 0).map((e) => e.rel).sort(compare);
  const ordered = [];
  while (ready.length) {
    const rel = ready.shift();
    ordered.push(byRel.get(rel));
    for (const t of edges.get(rel)) {
      indegree.set(t, indegree.get(t) - 1);
      if (indegree.get(t) === 0) {
        ready.push(t);
        ready.sort(compare);
      }
    }
  }
  // Eventos presos em ciclos entram no fim, para a lista estar completa
  for (const e of events) if (!ordered.includes(e)) ordered.push(e);

  return {
    ordered: ordered.map((e) => ({
      rel: e.rel,
      title: e.title,
      when: e.when,
      year: year(e),
      inCycle: cyclic.has(e.rel),
      // Sem momento e sem relação de ordem com nenhum outro evento: vai para a seção "sem data conhecida"
      undated: !e.when && !linked.has(e.rel),
    })),
    issues,
  };
}

/**
 * Texto Markdown do corpo da linha do tempo, a partir da ordem sugerida.
 * @param {Array<{rel: string, title: string, when: string}>} ordered - Eventos em ordem.
 * @returns {string}
 */
export function timelineMarkdown(ordered) {
  const line = (e, i) => `${i + 1}. [${e.title.replace(/[[\]]/g, "")}](/${e.rel})${e.when ? ` — ${e.when}` : ""}`;
  const dated = ordered.filter((e) => !e.undated);
  const undated = ordered.filter((e) => e.undated);
  const parts = [t("# LINHA DO TEMPO"), t("> Gerada a partir das fichas de eventos. Não é editável pelo autor: quem a preenche é o sistema ou a IA.")];
  if (dated.length) parts.push(dated.map(line).join("\n"));
  if (undated.length) {
    parts.push(
      t("## Sem data conhecida"),
      t('> Eventos sem momento e sem relação de ordem com outros eventos. Informe o momento ou ligue-os a outros eventos ("antes" e "depois") para que entrem na ordem.'),
      undated.map(line).join("\n"),
    );
  }
  return `${parts.join("\n\n")}\n`;
}
