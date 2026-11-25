/**
 * @file Ferramentas da IA para eventos e linha do tempo. As fichas de eventos (`assets/events/`) são criadas pelas tools de
 * criação (categoria `assets/events`) e guardam o momento (`when`) e a ordem (`after` / `before`). O sistema calcula uma
 * sugestão de ordem sem IA; a IA consulta essa sugestão (economiza processamento) e decide o que entra na linha do tempo.
 * A linha do tempo (`assets/events/timeline.md`) é somente leitura para o autor: quem a preenche é a IA (ou o sistema, quando
 * o autor aprova a sugestão na Central de Revisões).
 */

import { t } from "../../../shared/i18n.js";
import { timelineMarkdown } from "../../review/timeline.js";
import { assertPermission, locateFile } from "./permissions.js";
import { beginEdit, readCurrent, saveDraft } from "./bookTools.js";

const TIMELINE = "assets/events/timeline.md";

/**
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerEventTools(registry) {
  registry.register({
    name: "get_timeline_suggestion",
    description:
      t("Devolve a ordem de eventos que o SISTEMA já calculou (sem IA) a partir do momento (when) e da ordem (after/before) das fichas de eventos, mais os problemas encontrados (ordem circular, momentos contraditórios, eventos sem posição). Use antes de montar a linha do tempo: confira a sugestão, corrija o que for preciso e grave com update_timeline. Economiza leitura de arquivos."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const suggestion = ctx.issues.timelineSuggestion();
      await ctx.changelog?.recordBookRead("get_timeline_suggestion", { count: suggestion.ordered.length });
      return {
        events: suggestion.events,
        order: suggestion.ordered.map((e) => ({
          path: e.rel,
          title: e.title,
          when: e.when || null,
          inCycle: e.inCycle || undefined,
        })),
        problems: ctx.issues.list({ category: "timeline" }).map((i) => ctx.issues.brief(i)),
      };
    },
  });

  registry.register({
    name: "update_timeline",
    description:
      t("Escreve a linha do tempo (assets/events/timeline.md) com os eventos na ordem informada. É o único meio de alterá-la: o autor não a edita. Informe os caminhos das fichas de eventos, do mais antigo ao mais recente. Salva como rascunho para o autor revisar."),
    parameters: {
      type: "object",
      properties: {
        order: {
          type: "array",
          items: { type: "string" },
          description: t("Caminhos das fichas de eventos (relativos à raiz do livro) na ordem cronológica."),
        },
      },
      required: ["order"],
    },
    async execute({ order }, ctx) {
      if (!Array.isArray(order) || order.length === 0) throw new Error(t("Informe ao menos um evento em 'order'."));

      const files = ctx.issues.data?.state.files || {};
      const ordered = [];
      for (const raw of order) {
        const rel = String(raw).replace(/^\/+/, "");
        const event = files[rel]?.event;
        if (!event) throw new Error(t('"{path}" não é uma ficha de evento do livro (assets/events/).', { path: raw }));
        ordered.push({ rel, title: event.title, when: event.when });
      }

      const located = await locateFile(ctx.state, TIMELINE);
      assertPermission(located, "aiWrite");
      await beginEdit(ctx);
      const { frontmatter } = await readCurrent(located, ctx);
      await saveDraft(located, frontmatter, timelineMarkdown(ordered), ctx);
      return t("Linha do tempo atualizada com {count} evento(s). O autor irá revisar as alterações.", { count: ordered.length });
    },
  });
}
