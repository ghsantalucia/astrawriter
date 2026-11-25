/**
 * @file Ferramentas de criação guiada (livro, capítulo, ficha e anotação) para a IA.
 *
 * Usam o mesmo serviço do wizard da interface (`CreationService`), então o passo a passo é idêntico:
 * `start_creation` devolve os campos a preencher; a IA só pergunta ao autor o que faltar (uma única vez) e chama
 * `complete_creation`, que confere se os dados obrigatórios vieram do autor, valida e cria o item. Se o autor já
 * informou tudo (ex.: o título do capítulo), a criação acontece na mesma resposta, sem pedir confirmação.
 */

import { t } from "../../../shared/i18n.js";
import { uiBus } from "../../events/uiBus.js";
import { CREATION_KINDS } from "../../services/creationService.js";
import { allFields } from "../../utils/template.js";
import { foldText } from "../../utils/helpers.js";

/** Quantas mensagens recentes da conversa servem de prova de que o autor informou um dado. */
const EVIDENCE_MESSAGES = 6;

/**
 * Confere que cada campo obrigatório preenchido pela IA veio do autor: o valor precisa ser o padrão do campo ou
 * aparecer (ignorando maiúsculas/acentos) nas mensagens recentes da conversa. Isso impede a IA de inventar respostas
 * SEM obrigá-la a perguntar de novo o que o autor já disse — a causa do ciclo infinito de confirmações.
 * @param {Object} spec - Especificação da criação (campos).
 * @param {Object<string, string>} values - Valores informados pela IA, por id de campo.
 * @param {{prompt?: string, history?: Array<{content?: string}>}} [conversation] - Conversa atual.
 * @returns {void}
 * @throws {Error} Se um campo obrigatório tem um valor que não consta na conversa.
 */
function assertValuesFromAuthor(spec, values, conversation: { prompt?: string; history?: Array<{ content?: string }> } = {}) {
  const corpus = foldText(
    [
      ...(conversation.history || [])
        .slice(-EVIDENCE_MESSAGES)
        .map((m) => m.content || ""),
      conversation.prompt || "",
    ].join("\n"),
  );

  for (const field of allFields(spec.steps).filter((f) => f.required)) {
    const value = String(values[field.id] ?? "").trim();
    if (!value || value === String(field.value ?? "").trim()) continue;
    if (!corpus.includes(foldText(value))) {
      throw new Error(
        t('O valor de "{label}" ("{value}") não aparece na conversa com o autor. Não invente: pergunte ao autor esse dado (uma única vez) e aguarde a resposta.', { label: field.label, value }),
      );
    }
  }
}

/** Tipos que a IA pode criar: sempre dentro do livro aberto. Criar livros é só do autor (pela interface). */
const AI_CREATION_KINDS = CREATION_KINDS.filter((kind) => kind !== "book");

/**
 * Recusa pedidos de criação de livro (a IA só trabalha dentro do livro aberto).
 * @param {string} kind - Tipo pedido.
 * @returns {void}
 * @throws {Error} Se for `book` ou um tipo desconhecido.
 */
function assertAiKind(kind) {
  if (kind === "book") {
    throw new Error(t("A IA não cria livros: ela trabalha só dentro do livro aberto. Quem cria livros é o autor, pelo seletor de livros (Novo livro)."));
  }
  if (!AI_CREATION_KINDS.includes(kind)) {
    throw new Error(t('Tipo de criação inválido: "{kind}". Use: {kinds}.', { kind, kinds: AI_CREATION_KINDS.join(", ") }));
  }
}

const KIND_PARAM = {
  type: "string",
  enum: AI_CREATION_KINDS,
  // getter: a constante é criada na importação do módulo, antes de o idioma ser definido
  get description() {
    return t("O que criar, dentro do livro aberto: 'chapter' (capítulo), 'entity' (ficha de personagem/ambiente/sistema, requer `folder`) ou 'note' (anotação).");
  },
};

const FOLDER_PARAM = {
  type: "string",
  get description() {
    return t("Apenas para kind='entity': pasta da ficha relativa ao livro, ex.: assets/characters. Se omitida, o erro lista as pastas disponíveis.");
  },
};

/** Pasta (relativa ao livro) cujas permissões regem a criação de cada tipo. */
const PERMISSION_FOLDER = { chapter: "content", note: "notes" };

/**
 * Garante que a IA pode criar o item no destino (a pasta precisa ter `aiWrite` ativo no folder.yml).
 * @param {"book"|"chapter"|"entity"|"note"} kind - Tipo de criação.
 * @param {string|undefined} folder - Pasta da ficha (apenas `entity`).
 * @param {Object} ctx - Contexto das ferramentas.
 * @returns {Promise<void>}
 * @throws {Error} Se a IA não tem permissão de escrita na pasta de destino.
 */
async function assertAiCanCreate(kind, folder, ctx) {
  const target = kind === "entity" ? folder : PERMISSION_FOLDER[kind];
  const metadata = await ctx.creation.getFolderMetadata(target);

  if (metadata.aiWrite !== true) {
    throw new Error(
      t('Acesso negado: o autor não permitiu escrita da IA em "{target}" (aiWrite está desativado). Peça ao autor para criar pela interface.', { target: metadata.title || target }),
    );
  }
}

/**
 * Resolve e valida a pasta de uma ficha, listando as opções quando ela é inválida ou omitida.
 * @param {string|undefined} folder - Pasta informada pela IA.
 * @param {Object} ctx - Contexto das ferramentas.
 * @returns {Promise<string>} Pasta validada, relativa ao livro.
 * @throws {Error} Se a pasta não aceita fichas.
 */
async function resolveEntityFolder(folder, ctx) {
  const options = await ctx.creation.listEntityFolders();
  const clean = String(folder || "").replace(/^\/+|\/+$/g, "");
  const found = options.find((option) => option.folder === clean);

  if (!found) {
    const list = options.map((o) => `- ${o.folder} (${o.title})`).join("\n");
    throw new Error(
      `${t("Informe 'folder' com uma das pastas que aceitam fichas:")}\n${list || t("(nenhuma encontrada)")}`,
    );
  }
  return found.folder;
}

/**
 * Registra as ferramentas de criação guiada.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerCreationTools(registry) {
  registry.register({
    name: "start_creation",
    description:
      t("Primeira etapa para criar, no livro aberto, um capítulo, ficha (personagem, ambiente, sistema) ou anotação (a IA não cria livros): retorna os campos a preencher. Se o autor JÁ informou os campos obrigatórios (ex.: o título) ou já respondeu a você, chame complete_creation logo em seguida, na mesma resposta, SEM pedir confirmação. Só pergunte se faltar algum campo obrigatório (uma única vez) e então aguarde a resposta. Nunca invente as respostas."),
    parameters: {
      type: "object",
      properties: { kind: KIND_PARAM, folder: FOLDER_PARAM },
      required: ["kind"],
    },
    async execute({ kind, folder }, ctx) {
      assertAiKind(kind);
      if (!ctx.state.currentBookPath) {
        throw new Error(t("Nenhum livro selecionado."));
      }

      const cleanFolder =
        kind === "entity" ? await resolveEntityFolder(folder, ctx) : undefined;
      await assertAiCanCreate(kind, cleanFolder, ctx);

      const spec = await ctx.creation.getSpec({ kind, folder: cleanFolder });

      // A IA não lembra das ferramentas chamadas em mensagens anteriores. Se esta criação já foi iniciada antes,
      // preserva a mensagem de origem: assim, depois de o autor responder, complete_creation é liberado
      // (reiniciar o marcador a cada mensagem prendia a IA num ciclo eterno de confirmações).
      const previous = ctx.state.pendingCreation;
      const alreadyStarted =
        previous?.kind === kind &&
        previous?.folder === cleanFolder &&
        previous.messageId !== ctx.messageId;

      if (!alreadyStarted) {
        ctx.state.pendingCreation = {
          kind,
          folder: cleanFolder,
          messageId: ctx.messageId,
        };
      }

      return {
        kind,
        folder: cleanFolder,
        title: spec.title,
        alreadyStarted,
        instructions: alreadyStarted
          ? t("Esta criação JÁ foi iniciada em uma mensagem anterior. NÃO pergunte novamente: chame complete_creation agora com as respostas que o autor deu (inclusive por botão ou 'confirmado'); campos opcionais não informados ficam em branco.")
          : t("Se a conversa já traz os campos obrigatórios (ex.: o título que o autor pediu), chame complete_creation AGORA, na mesma resposta, sem pedir confirmação. Se faltar algum campo obrigatório, pergunte só o que falta (uma única vez, sugerindo valores) e aguarde a resposta; campos opcionais podem ficar em branco. Para fichas, o autor pode optar por criar só com os dados principais."),
        steps: spec.steps.map((step, index) => ({
          step: index + 1,
          title: step.title,
          description: step.description || "",
          fields: step.fields.map((field) => ({
            id: field.id,
            label: field.label,
            required: field.required,
            type: field.type,
            placeholder: field.placeholder || "",
            default: field.value || "",
          })),
        })),
      };
    },
  });

  registry.register({
    name: "complete_creation",
    description:
      t("ÚLTIMA etapa da criação: cria o item com as respostas do autor. Pode ser chamada na mesma resposta de start_creation quando o autor já informou os campos obrigatórios (os valores precisam constar na conversa). Campos não informados usam o valor padrão."),
    parameters: {
      type: "object",
      properties: {
        kind: KIND_PARAM,
        folder: FOLDER_PARAM,
        answers: {
          type: "array",
          description:
            t("Respostas do autor, uma por campo (use os ids retornados por start_creation)."),
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: t("Id do campo.") },
              value: { type: "string", description: t("Resposta do autor.") },
            },
            required: ["field", "value"],
          },
        },
      },
      required: ["kind", "answers"],
    },
    async execute({ kind, folder, answers }, ctx) {
      assertAiKind(kind);
      if (!ctx.state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));
      const cleanFolder =
        kind === "entity"
          ? String(folder || "").replace(/^\/+|\/+$/g, "")
          : undefined;

      await assertAiCanCreate(kind, cleanFolder, ctx);

      const values = {};
      for (const answer of Array.isArray(answers) ? answers : []) {
        if (answer?.field) values[answer.field] = String(answer.value ?? "");
      }

      // Os dados obrigatórios precisam ter vindo do autor (não exige uma rodada extra de confirmação)
      const spec = await ctx.creation.getSpec({ kind, folder: cleanFolder });
      assertValuesFromAuthor(spec, values, ctx.conversation);

      const result = await ctx.creation.create({
        kind,
        folder: cleanFolder,
        values,
        source: "ai",
      });
      ctx.state.pendingCreation = null;

      uiBus.emit("toast:show", {
        message: t('A IA criou "{title}".', { title: result.title }),
        type: "success",
      });

      return t('Criado com sucesso: "{title}" ({kind}). Já aparece para o autor no explorer. Avise o autor usando o título.', { title: result.title, kind });
    },
  });
}
