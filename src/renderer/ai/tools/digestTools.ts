/**
 * @file Ferramentas da IA que consultam os digests (arquivos-sombra de metadados em `.system/digests/`). Servem para a IA
 * conferir um arquivo ou um fato do livro sem reler capítulos inteiros, o que economiza muitos tokens.
 */

import { t } from "../../../shared/i18n.js";
import { assertPermission, locateFile } from "./permissions.js";

/**
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerDigestTools(registry) {
  registry.register({
    name: "get_file_digest",
    description:
      t("Devolve o digest de um arquivo: resumo, entidades citadas, fatos atômicos (entidade, atributo, valor, citação) e eventos. É muito mais barato que read_file; use primeiro para entender o que um arquivo diz. Se o arquivo ainda não foi analisado (ou mudou desde a última análise), diga isso ao autor e leia o arquivo com read_file. Exige permissão de leitura da IA."),
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: t("Arquivo, relativo à raiz do livro.") },
      },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiRead");
      const digest = await ctx.analysis.getDigest(located.relPath);
      if (!digest) {
        return { available: false, note: t("Este arquivo ainda não foi analisado. Use read_file ou peça ao autor para rodar a análise (Central de Revisões).") };
      }
      await ctx.changelog?.recordAiRead(located.originalPath, "get_file_digest");
      return { available: true, ...digest };
    },
  });

  registry.register({
    name: "search_facts",
    description:
      t("Procura nos digests de todo o livro os fatos sobre uma entidade (personagem, lugar...) e/ou um atributo (ex.: idade, cor dos olhos). Devolve arquivo, valor e citação de cada fato. Use para checar consistência sem ler os arquivos. Só encontra o que já foi analisado."),
    parameters: {
      type: "object",
      properties: {
        entity: { type: "string", description: t("Parte do nome da entidade.") },
        attribute: { type: "string", description: t("Parte do nome do atributo.") },
      },
    },
    async execute({ entity, attribute }, ctx) {
      if (!entity && !attribute) throw new Error(t("Informe 'entity' e/ou 'attribute'."));
      const facts = (await ctx.analysis.searchFacts({ entity, attribute })).slice(0, 60);
      await ctx.changelog?.recordBookRead("search_facts", { count: facts.length });
      return { total: facts.length, facts };
    },
  });
}
