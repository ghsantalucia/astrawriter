# Tradução (i18n): como funciona e glossário

## Como funciona

- O **português é a chave**. No código: `t("Salvar livro")`; em templates Handlebars: `{{t "Salvar livro"}}` (ou `{{{t "..."}}}` quando o texto tem HTML).
- Parâmetros usam chaves: `t("Excluir {name}?", { name })` e `{{t "Excluir {name}?" name=nome}}`.
- O inglês fica em `src/shared/i18n/en/<área>.json`, no formato `{ "texto em português": "text in English" }`. Cada área do app tem o seu arquivo.
- Texto sem entrada no dicionário aparece em português (nada some da tela). O português nunca é alterado pelo sistema.
- O idioma é escolhido em **Central do Sistema → Aparência → Idioma do aplicativo** (ao trocar, a tela recarrega). Na primeira abertura vale o idioma do sistema (`pt*` → português, o resto → inglês). Testes usam `ASTRA_LANG`.
- O que **não** se traduz: comentários, `console.*`, nomes de arquivo/pasta, ids, nomes de eventos e canais IPC, valores gravados em arquivos (frontmatter, config.json), chaves de armazenamento e qualquer texto que o código compare com um literal.

## Glossário (português → inglês)

| Português | Inglês |
| --- | --- |
| Livro | Book |
| Capítulo | Chapter |
| Esboço / Manuscrito / Análise (arquivos do capítulo) | Outline / Manuscript / Analysis |
| Mundo | World |
| Ficha (genérica) | Sheet |
| Personagens / Ambientes / Conceitos / Eventos | Characters / Places / Concepts / Events |
| Ficha de personagem / de ambiente / de conceito / de evento | Character sheet / Place sheet / Concept sheet / Event sheet |
| Anotações | Notes |
| Linha do tempo | Timeline |
| Rascunho (alteração ainda não sincronizada, `.md.temp`) | Draft |
| Sincronizar / Sincronizado | Sync / Synced |
| Central do Livro / do Sistema / de IA / de Revisões | Book Center / System Center / AI Center / Review Center |
| Explorer (árvore de arquivos) | Explorer |
| Barra de ferramentas | Toolbar |
| Pesquisa / Pesquisar | Search |
| Revisão / Pendência | Review / Issue |
| Histórico / Changelog | History / Changelog |
| Dados do arquivo / Variável | File data / Variable |
| Tag | Tag |
| Auto-link / Link automático | Auto-link |
| Permissões / Somente leitura | Permissions / Read-only |
| Tool (ferramenta da IA) / Skill | Tool / Skill |
| Template / Perfil de template | Template / Template profile |
| Assistente / Co-autor / Autônomo (perfis) | Assistant / Co-author / Autonomous |
| Auxílio de Escrita / Criação Guiada / Criação Autônoma (modos) | Writing Assistance / Guided Creation / Autonomous Creation |
| Modo autônomo | Autonomous mode |
| Importar / Exportar | Import / Export |
| Narrador | Narrator |
| Modo noturno / Tema (claro, escuro) | Night mode / Theme (light, dark) |
| Chave de API / Provedor / Modelo | API key / Provider / Model |
| Backup / Atualização | Backup / Update |

Estilo do inglês: natural e curto, mesma capitalização do português (só a primeira letra maiúscula em frases e botões), sem gírias, sem traduzir "Astra Writer".
