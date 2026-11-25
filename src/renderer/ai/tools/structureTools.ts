/**
 * @file Ferramentas de estrutura do livro para a IA: criar pastas, mover e excluir arquivos e pastas. Fazem o mesmo
 * que o usuário faz no explorer (usam os mesmos serviços e regras) e conferem as permissões da IA em cada ação.
 *
 * Toda alteração de estrutura exige que não haja rascunhos pendentes (`beginEdit`), é registrada no changelog com o
 * autor "IA" e avisa a interface (`book:structure-changed`) para atualizar o explorer e o editor.
 */

import { t } from "../../../shared/i18n.js";
import { uiBus } from "../../events/uiBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { canDeleteFile } from "../../utils/deletePermission.js";
import { categoryOf } from "../../services/folderService.js";
import { beginEdit } from "./bookTools.js";
import {
  assertFolderPermission,
  assertPermission,
  collectFolderFiles,
  locateFile,
  locateFolder,
  parseFolderPath,
} from "./permissions.js";

/**
 * Parâmetro de texto que descreve uma pasta.
 * @param {string} description - Descrição para o modelo.
 * @returns {{type: string, description: string}}
 */
const folderParam = (description) => ({ type: "string", description });

/**
 * Garante que há um livro aberto.
 * @param {Object} ctx - Contexto das ferramentas.
 * @returns {string} Caminho do livro (normalizado, sem barra final).
 * @throws {Error} Se nenhum livro está selecionado.
 */
function requireBook(ctx) {
  if (!ctx.state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));
  return normalizePath(ctx.state.currentBookPath).replace(/\/+$/, "");
}

/**
 * Avisa a interface que a estrutura do livro mudou.
 * @param {Object} payload - `deletedPath`, `movedFrom`/`movedTo` (absolutos) ou `restoredPath`.
 * @returns {void}
 */
export function announceStructureChange(payload) {
  uiBus.emit("book:structure-changed", payload);
}

/**
 * Valida o destino de uma movimentação: pasta existente com escrita permitida à IA.
 * @param {string} destination - Pasta de destino informada pela IA.
 * @param {Object} ctx - Contexto das ferramentas.
 * @returns {Promise<string>} Pasta de destino validada (relativa ao livro).
 */
async function resolveDestination(destination, ctx) {
  const segments = parseFolderPath(destination, ctx.state.currentBookPath);
  const { metadata } = await locateFolder(ctx.state, segments);
  const rel = segments.join("/");
  assertFolderPermission(metadata, "aiWrite", metadata.title || rel);
  return rel;
}

/**
 * Registra as ferramentas de estrutura (pastas, mover e excluir).
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerStructureTools(registry) {
  registry.register({
    name: "create_folder",
    description:
      t("Cria uma pasta em Anotações (`notes`) ou dentro de uma categoria do Mundo (`assets/characters`, `assets/places`, `assets/elements`), inclusive dentro de pastas já criadas por usuário. Requer que a pasta pai permita escrita da IA."),
    parameters: {
      type: "object",
      properties: {
        parent: folderParam(
          t("Pasta pai relativa ao livro, ex.: notes ou assets/characters/protagonistas."),
        ),
        name: folderParam(t("Nome exibido da nova pasta.")),
      },
      required: ["parent", "name"],
    },
    async execute({ parent, name }, ctx) {
      requireBook(ctx);
      const segments = parseFolderPath(parent, ctx.state.currentBookPath);
      const parentRel = segments.join("/");
      if (!ctx.folders.canCreateIn(parentRel)) {
        throw new Error(
          t("Não é permitido criar pastas neste local. Só em notes e nas categorias do Mundo (assets/characters, assets/places, assets/elements)."),
        );
      }
      const { metadata } = await locateFolder(ctx.state, segments);
      assertFolderPermission(metadata, "aiWrite", metadata.title || parentRel);

      await beginEdit(ctx);
      const created = await ctx.folders.createFolder(
        parentRel,
        name,
        ctx.changelog.aiActor(),
      );
      announceStructureChange({});
      ctx.notice?.(t('Pasta "{title}" - Criada pela IA', { title: created.title }));
      return t('Pasta "{title}" criada (caminho: {path}).', { title: created.title, path: created.rel });
    },
  });

  registry.register({
    name: "move_file",
    description:
      t("Move um arquivo para outra pasta da MESMA categoria (anotações, personagens, ambientes ou sistemas), corrigindo os links internos que apontavam para ele. Requer permissão de escrita da IA no arquivo e na pasta de destino."),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: t("Arquivo relativo ao livro, ex.: notes/note_001.md"),
        },
        destination: folderParam(t("Pasta de destino relativa ao livro.")),
      },
      required: ["path", "destination"],
    },
    async execute({ path, destination }, ctx) {
      const book = requireBook(ctx);
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      const destRel = await resolveDestination(destination, ctx);

      const check = ctx.folders.checkMove(located.relPath, destRel);
      if (!check.ok) throw new Error(check.reason);

      await beginEdit(ctx);
      const from = normalizePath(located.originalPath).replace(/\.temp$/, "");
      const { to } = await ctx.folders.moveFile(
        from,
        destRel,
        ctx.changelog.aiActor(),
      );
      announceStructureChange({ movedFrom: from, movedTo: to });
      ctx.notice?.(t('"{title}" - Movido pela IA', { title: located.title }));
      return t('"{title}" movido para {path}.', { title: located.title, path: to.slice(book.length + 1) });
    },
  });

  registry.register({
    name: "move_folder",
    description:
      t("Move uma pasta criada pelo usuário (com tudo o que há dentro) para dentro de outra pasta da MESMA categoria, corrigindo os links internos. Requer permissão de escrita da IA na pasta, em todos os arquivos dentro dela e na pasta de destino."),
    parameters: {
      type: "object",
      properties: {
        path: folderParam(t("Pasta a mover, relativa ao livro.")),
        destination: folderParam(t("Pasta de destino relativa ao livro.")),
      },
      required: ["path", "destination"],
    },
    async execute({ path, destination }, ctx) {
      const book = requireBook(ctx);
      const segments = parseFolderPath(path, ctx.state.currentBookPath);
      const rel = segments.join("/");
      const { node, metadata } = await locateFolder(ctx.state, segments);
      const label = metadata.title || rel;
      assertFolderPermission(metadata, "aiWrite", label);
      if (metadata.userRename !== true) {
        throw new Error(t("Esta pasta é estrutural e não pode ser movida."));
      }
      for (const file of collectFolderFiles(node, rel)) {
        assertPermission(
          { metadata: file.metadata, title: file.title },
          "aiWrite",
        );
      }
      const destRel = await resolveDestination(destination, ctx);

      const check = ctx.folders.checkFolderMove(rel, destRel);
      if (!check.ok) throw new Error(check.reason);

      await beginEdit(ctx);
      const { moved } = await ctx.folders.moveFolder(
        rel,
        destRel,
        ctx.changelog.aiActor(),
      );
      announceStructureChange({
        movedFrom: `${book}/${rel}`,
        movedTo: `${book}/${destRel}/${segments[segments.length - 1]}`,
      });
      ctx.notice?.(t('Pasta "{label}" - Movida pela IA', { label }));
      return t('Pasta "{label}" movida para {path} ({count} arquivo(s)).', { label, path: destRel, count: moved });
    },
  });

  registry.register({
    name: "delete_file",
    description:
      t("Exclui um arquivo (e o rascunho dele). Só funciona se o frontmatter do arquivo tiver `aiWrite: true` e `aiDelete: true`. Arquivos de `content/`, índices (`index.md`) e modelos (`template.md`) nunca podem ser excluídos. O link do arquivo é removido do índice. Use apenas quando o autor pedir; a exclusão é registrada no changelog."),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: t("Arquivo relativo ao livro, ex.: notes/note_001.md"),
        },
      },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      requireBook(ctx);
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      if (!canDeleteFile(located.metadata, located.relPath, "ai")) {
        throw new Error(
          t('Acesso negado: o arquivo "{title}" não permite exclusão pela IA (arquivos da escrita, índices e modelos nunca são excluídos; os demais exigem aiDelete: true no frontmatter). Peça ao autor para excluir pela interface.', { title: located.title }),
        );
      }

      await beginEdit(ctx);
      const abs = normalizePath(located.originalPath).replace(/\.temp$/, "");
      await ctx.deletion.deleteFile(abs, { who: "ai" });
      announceStructureChange({ deletedPath: abs });
      ctx.notice?.(t('"{title}" - Excluído pela IA', { title: located.title }));
      return t('"{title}" excluído e removido do índice.', { title: located.title });
    },
  });

  registry.register({
    name: "delete_folder",
    description:
      t("Exclui uma pasta criada pelo usuário com TUDO o que há dentro. Só funciona se o `folder.yml` tiver `userDelete: true`, `aiWrite: true` e `aiDelete: true`, se todos os arquivos dentro permitirem escrita da IA e nenhum tiver `aiDelete: false`. Os links dos arquivos são removidos dos índices. Use apenas quando o autor pedir."),
    parameters: {
      type: "object",
      properties: {
        path: folderParam(t("Pasta a excluir, relativa ao livro.")),
      },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const book = requireBook(ctx);
      const segments = parseFolderPath(path, ctx.state.currentBookPath);
      const rel = segments.join("/");
      if (categoryOf(rel) === rel) {
        throw new Error(t("As pastas das categorias não podem ser excluídas."));
      }
      const { node, metadata } = await locateFolder(ctx.state, segments);
      const label = metadata.title || rel;
      if (metadata.userDelete !== true) {
        throw new Error(t('A pasta "{label}" não pode ser excluída.', { label }));
      }
      assertFolderPermission(metadata, "aiWrite", label);
      assertFolderPermission(metadata, "aiDelete", label);
      for (const file of collectFolderFiles(node, rel)) {
        assertPermission(
          { metadata: file.metadata, title: file.title },
          "aiWrite",
        );
        if (file.metadata.aiDelete === false) {
          throw new Error(
            t('Acesso negado: o arquivo "{title}" dentro da pasta proíbe exclusão pela IA (aiDelete: false).', { title: file.title }),
          );
        }
      }

      await beginEdit(ctx);
      const { deleted } = await ctx.folders.deleteFolder(
        rel,
        ctx.changelog.aiActor(),
      );
      announceStructureChange({ deletedPath: `${book}/${rel}` });
      ctx.notice?.(t('Pasta "{label}" - Excluída pela IA', { label }));
      return t('Pasta "{label}" excluída ({count} arquivo(s)).', { label, count: deleted });
    },
  });
}
