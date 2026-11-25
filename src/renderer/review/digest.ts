/**
 * @file Digests: o "arquivo-sombra" de metadados de cada arquivo do livro, em `.system/digests/`. A IA lê cada arquivo UMA vez
 * e extrai um resumo estruturado (entidades, fatos atômicos e eventos). As análises seguintes (contradições, linha do
 * tempo, consultas da IA) trabalham sobre os digests, que são muito menores que os capítulos: é assim que o app economiza
 * tokens. Aqui ficam as partes puras: prompts, leitura tolerante do JSON da IA e a detecção de candidatos a contradição.
 */

import { foldText } from "../utils/helpers.js";
import { shortHash } from "./issueCheckers.js";

/** Tamanho máximo de texto de um arquivo enviado para o digest (caracteres). */
export const MAX_DIGEST_CHARS = 24000;
/** Máximo de fatos guardados por arquivo. */
const MAX_FACTS = 30;

/**
 * Instruções de sistema do digest, só com as partes pedidas (cada parte a mais custa tokens de resposta).
 * @param {Object} [options]
 * @param {boolean} [options.facts=true] - Extrair fatos (base das contradições).
 * @param {boolean} [options.events=true] - Extrair eventos e datas (linha do tempo).
 * @param {boolean} [options.style=false] - Registrar narrador, tempo verbal e tom.
 * @returns {string}
 */
export function digestSystem({ facts = true, events = true, style = false } = {}) {
  const fields = [
    '  "summary": "resumo de 1 a 3 frases do que o arquivo contém"',
    '  "entities": [{"name": "Nome", "kind": "personagem|lugar|elemento|evento|outro"}]',
  ];
  if (facts) {
    fields.push(
      '  "facts": [{"entity": "Nome", "attribute": "atributo curto em minúsculas (ex.: cor dos olhos, idade, profissão, local de nascimento)", "value": "valor afirmado", "quote": "trecho EXATO e curto do texto que afirma isso", "when": "momento, se o texto situar o fato no tempo (opcional)"}]',
    );
  }
  if (events) {
    fields.push(
      '  "events": [{"title": "nome curto do evento", "when": "momento, se houver", "after": ["evento anterior citado"], "before": ["evento posterior citado"]}]',
    );
  }
  if (style) {
    fields.push(
      '  "style": {"pov": "primeira pessoa | terceira limitada | terceira onisciente | segunda pessoa | misto | n/a", "tense": "passado | presente | futuro | misto | n/a", "tone": "1 a 3 palavras (ex.: sombrio, leve, épico)"}',
    );
  }
  const rules = [];
  if (facts) {
    rules.push(
      `inclua apenas fatos afirmados explicitamente no texto, nunca invente; no máximo ${MAX_FACTS} fatos, priorizando os que poderiam ser contraditos em outro arquivo (traços físicos, idades, datas, parentescos, locais, regras do mundo). Copie "quote" exatamente como está no texto`,
    );
  }
  rules.push("se algo não existir, use lista vazia");
  return `Você extrai metadados estruturados de um arquivo de um livro (capítulo, ficha ou anotação) para um editor.
Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários), neste formato:
{
${fields.join(",\n")}
}
Regras: ${rules.join(". ")}.`;
}

/** Instruções de sistema do digest completo (fatos e eventos). */
export const DIGEST_SYSTEM = digestSystem();

/** Instruções de sistema da verificação de contradições. */
export const VERIFY_SYSTEM = `Você confere se afirmações extraídas de arquivos diferentes de um livro se contradizem.
Responda SOMENTE com JSON válido: {"verdict": "conflict" | "compatible" | "unsure", "explanation": "uma ou duas frases em português"}.
"conflict" = não podem ser verdade ao mesmo tempo no mesmo momento da história; "compatible" = podem coexistir (ex.: o fato mudou com o tempo, são aspectos diferentes ou apelidos); "unsure" = falta contexto.`;

/**
 * Prompt do digest de um arquivo.
 * @param {string} rel - Caminho relativo ao livro.
 * @param {string} title - Título.
 * @param {string} body - Corpo do arquivo (já sem frontmatter).
 * @returns {string}
 */
export function digestPrompt(rel, title, body) {
  const text = body.length > MAX_DIGEST_CHARS ? `${body.slice(0, MAX_DIGEST_CHARS)}\n[... texto cortado]` : body;
  return `Arquivo: ${rel}\nTítulo: ${title}\n\n${text}`;
}

/**
 * Lê um JSON devolvido pela IA, tolerando cercas de código e texto em volta.
 * @param {string} text - Resposta da IA.
 * @returns {any|null} O objeto, ou null se não for JSON.
 */
export function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // tenta a próxima forma
    }
  }
  return null;
}

/**
 * Compara textos ignorando espaços repetidos e maiúsculas (para conferir se uma citação existe no arquivo).
 * @param {string} text - Texto.
 * @returns {string}
 */
function squash(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Valida e normaliza o digest devolvido pela IA. Citações que não existem no texto são descartadas (a IA às vezes as
 * reescreve), para o "ir ao trecho" nunca apontar para o lugar errado.
 * @param {any} raw - Objeto lido da resposta.
 * @param {string} content - Conteúdo do arquivo (para conferir as citações).
 * @returns {{summary: string, entities: Object[], facts: Object[], events: Object[]}|null}
 */
export function normalizeDigest(raw, content) {
  if (!raw || typeof raw !== "object") return null;
  const haystack = squash(content);
  const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const list = (v) => (Array.isArray(v) ? v : []);

  const facts = list(raw.facts)
    .map((f) => ({
      entity: text(f?.entity, 80),
      attribute: text(f?.attribute, 80).toLowerCase(),
      value: text(f?.value, 160),
      quote: haystack.includes(squash(f?.quote)) && f?.quote ? text(f.quote, 240) : "",
      when: text(f?.when, 80),
    }))
    .filter((f) => f.entity && f.attribute && f.value)
    .slice(0, MAX_FACTS);

  return {
    summary: text(raw.summary, 500),
    entities: list(raw.entities)
      .map((e) => ({ name: text(e?.name, 80), kind: text(e?.kind, 20) || "outro" }))
      .filter((e) => e.name)
      .slice(0, 60),
    facts,
    style: raw.style && typeof raw.style === "object"
      ? { pov: text(raw.style.pov, 40).toLowerCase(), tense: text(raw.style.tense, 20).toLowerCase(), tone: text(raw.style.tone, 40).toLowerCase() }
      : null,
    events: list(raw.events)
      .map((e) => ({
        title: text(e?.title, 120),
        when: text(e?.when, 80),
        after: list(e?.after).map((x) => text(x, 120)).filter(Boolean).slice(0, 6),
        before: list(e?.before).map((x) => text(x, 120)).filter(Boolean).slice(0, 6),
      }))
      .filter((e) => e.title)
      .slice(0, 30),
  };
}

/**
 * Procura candidatos a contradição SEM IA: o mesmo atributo da mesma entidade com valores diferentes em arquivos (ou
 * trechos) diferentes. Só os candidatos vão para a verificação da IA.
 * @param {Array<{file: string, hash: string, facts: Object[]}>} digests - Digests do livro.
 * @returns {Array<{key: string, entity: string, attribute: string, claims: Array<{file: string, value: string, quote: string, when: string}>}>}
 */
export function findCandidates(digests) {
  const groups = new Map();
  for (const digest of digests) {
    for (const fact of digest.facts || []) {
      const key = `${foldText(fact.entity)}|${foldText(fact.attribute)}`;
      const group = groups.get(key) || { entity: fact.entity, attribute: fact.attribute, claims: [] };
      group.claims.push({ file: digest.file, hash: digest.hash, value: fact.value, quote: fact.quote, when: fact.when });
      groups.set(key, group);
    }
  }

  const candidates = [];
  for (const [key, group] of groups) {
    // Um valor por "ideia": agrupa por valor normalizado e mantém a primeira citação de cada
    const byValue = new Map();
    for (const claim of group.claims) {
      const v = foldText(claim.value);
      if (!byValue.has(v)) byValue.set(v, claim);
    }
    if (byValue.size < 2) continue;
    const claims = [...byValue.values()].slice(0, 4);
    candidates.push({
      key: `${key}|${shortHash(claims.map((c) => `${c.file}:${c.hash}:${foldText(c.value)}`).sort().join("|"))}`,
      entity: group.entity,
      attribute: group.attribute,
      claims,
    });
  }
  return candidates;
}

/**
 * Prompt da verificação de um candidato.
 * @param {{entity: string, attribute: string, claims: Array<{file: string, value: string, quote: string, when: string}>}} candidate - Candidato.
 * @returns {string}
 */
export function verifyPrompt(candidate) {
  const claims = candidate.claims
    .map((c, i) => `${i + 1}. (${c.file}) valor: "${c.value}"${c.when ? ` [momento: ${c.when}]` : ""}${c.quote ? `\n   trecho: "${c.quote}"` : ""}`)
    .join("\n");
  return `Entidade: ${candidate.entity}\nAtributo: ${candidate.attribute}\nAfirmações:\n${claims}`;
}

/**
 * Procura, SEM IA, capítulos que fogem do padrão do livro em narrador (pessoa) ou tempo verbal: o valor mais comum entre
 * os capítulos analisados é o padrão, e os capítulos diferentes viram sugestões. Só vale com pelo menos 3 capítulos.
 * @param {Array<{file: string, style?: {pov: string, tense: string}}>} digests - Digests dos capítulos.
 * @returns {Array<{file: string, message: string}>}
 */
export function findStyleShifts(digests) {
  const chapters = digests.filter((d) => /^content\/chapter_\d+\/2_draft\.md$/i.test(d.file) && d.style);
  if (chapters.length < 3) return [];
  const out = [];
  const label = { pov: "o narrador (pessoa)", tense: "o tempo verbal" };
  for (const field of ["pov", "tense"]) {
    const valid = chapters.filter((d) => d.style[field] && !/^(n\/a|misto)$/.test(d.style[field]));
    const counts = new Map();
    for (const d of valid) counts.set(d.style[field], (counts.get(d.style[field]) || 0) + 1);
    const [top, topCount] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0] || [];
    if (!top || topCount <= valid.length / 2) continue;
    for (const d of valid) {
      if (d.style[field] !== top) {
        out.push({ file: d.file, message: `Neste capítulo ${label[field]} é "${d.style[field]}", mas a maioria dos capítulos usa "${top}". Se não foi proposital, vale uniformizar.` });
      }
    }
  }
  return out;
}

/** Instruções de sistema da comparação dos capítulos com o objetivo do livro. */
export const ALIGN_SYSTEM = `Você compara os resumos dos capítulos de um livro com o objetivo do livro (a sinopse) e aponta capítulos que parecem fugir dele.
Responda SOMENTE com JSON válido: {"issues": [{"file": "caminho do capítulo exatamente como informado", "message": "uma ou duas frases em português explicando o desvio"}]}.
Aponte só desvios claros (tema, tom ou rumo que contradizem a sinopse); no máximo 5. Se tudo estiver coerente, devolva {"issues": []}.`;

/**
 * Prompt da comparação com o objetivo do livro.
 * @param {string} synopsis - Texto da sinopse.
 * @param {Array<{file: string, summary: string}>} chapters - Resumos dos capítulos.
 * @returns {string}
 */
export function alignPrompt(synopsis, chapters) {
  return `# Sinopse (objetivo do livro)\n${synopsis.slice(0, 6000)}\n\n# Capítulos\n${chapters.map((c) => `- ${c.file}: ${c.summary}`).join("\n")}`;
}
