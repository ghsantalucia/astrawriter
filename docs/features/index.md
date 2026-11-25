# Features do Astra Writer: índice

> Cada **feature** é uma funcionalidade que o usuário reconhece, e terá (ou terá, quando for escrita) um arquivo em `docs/features/`
> com: o que faz (alto nível), como o usuário usa, **como foi implementada**, **arquivos fundamentais**, eventos, atalhos e
> limitações. Features "modulares" (como o explorer, que tem muitos botões) ficam **num arquivo só**.
>
> Como manter: **toda feature nova ou alterada entra aqui**. Modelo de arquivo: [`_modelo.md`](_modelo.md).
> Documentos transversais: [`../ai/modos-da-ia.md`](../ai/modos-da-ia.md), [`../ai/perfis-de-uso-da-ia.md`](../ai/perfis-de-uso-da-ia.md),
> [`../ai/fluxos-da-ia.md`](../ai/fluxos-da-ia.md), [`../ai/ai-tools.md`](../ai/ai-tools.md), [`../project.md`](../project.md),
> [`../guia-do-usuario.md`](../guia-do-usuario.md).

Legenda de documentação: ✅ escrita · 📝 a escrever · ⏳ feature proposta (não implementada).

## 1. Editor e arquivos

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Editor de texto | Editor Markdown (Toast UI) com modo formatado e modo Markdown, barra de formatação, contagem de palavras | 📝 |
| Barra superior do editor (toolbar) | Abas do capítulo (Manuscrito/Esboço/Análise), Ouvir, Ortografia, Auto-link, Histórico, Exportar, Sincronizar | 📝 |
| Rascunho e sincronização | Edição vira rascunho (`.md.temp`); **Sincronizar** confirma e grava versão no histórico | 📝 |
| Histórico de versões | Lista de versões de um arquivo, comparação e restauração | 📝 |
| Variáveis do arquivo (dados) | Caixa "Dados do arquivo": campos tipados (texto, lista, eventos), tags | 📝 |
| Tags | Tags coloridas por hash, busca por `#tag` | 📝 |
| Links internos | Links entre arquivos do livro, validação, link quebrado, remover link | 📝 |
| Links do app (`app:`) | Links que abrem janelas do app (`app:settings`, `app:central/<central>/<aba>`), usados no Manual de Uso | 📝 |
| Auto-link | Cria links para nomes e apelidos de fichas citados no texto | 📝 |
| Procurar e substituir | Ctrl+F no arquivo aberto | 📝 |
| Correção ortográfica e gramatical | Sublinhado do Chromium, contagem Hunspell, idioma, dicionário pessoal | 📝 |
| Narrador (ouvir em voz alta) | Síntese de voz do arquivo aberto, play/pause/stop | 📝 |
| Exportar arquivo/livro | Markdown, Word, PDF; livro inteiro, capítulos ou projeto (zip) | 📝 |

## 2. Explorer e organização

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Explorer | Árvore por aba (Anotações, Escrita, Mundo), botões de cada item, **navegação por teclado**, arrastar/mover | 📝 |
| Pesquisa de arquivos | Busca por título, texto e `#tag`, com pontuação | 📝 |
| Pastas, mover e excluir | Criar/renomear/excluir pastas do autor; mover só dentro da categoria | 📝 |
| Permissões e cadeados | `aiRead`/`aiWrite`/`aiDelete` por arquivo e pasta; cadeado geral das anotações | 📝 |
| Arquivos avançados | Mostrar/ocultar índices, modelos e outros arquivos de sistema | 📝 |
| Cronômetro de produtividade | Opcional; play/pause, modo Auto, registros e gráfico (Central do Sistema) | 📝 |
| Bolinha "alterado pela IA" | Marca arquivos gravados pela IA no modo autônomo | 📝 |

## 3. Livros e estrutura

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Livros (selecionar, criar, importar zip, exportar, excluir) | Seletor de livros, wizard de criação, importar `.zip` exportado pelo app | 📝 |
| Wizard de criação | Assistente de livro, capítulo, ficha e anotação (campos tipados, listas, eventos) | 📝 |
| Capítulos | 3 arquivos por capítulo: Esboço, Manuscrito, Análise | 📝 |
| Fichas do mundo | Personagens, Ambientes, Conceitos, Eventos (templates + variáveis) | 📝 |
| Eventos e Linha do tempo | Campos antes/depois, ordem calculada **sem IA**, seção "sem data", linha do tempo = índice dos eventos | 📝 |
| Índices | `index.md` das categorias mantidos pelo sistema | 📝 |
| Anotações | Arquivos livres e pastas, cadeado da IA | 📝 |
| Templates e perfis de template | Modelos por tipo de arquivo, 3 conjuntos (assistente/co-autor/autônomo), editor de templates | 📝 |
| Manual de Uso (primeira abertura) | Livro padrão instalado na primeira abertura, abre em "Comece por aqui" | 📝 |
| Changelog e rollback | Registro de tudo o que muda no livro, com desfazer | 📝 |
| Backup | Backup dos livros em pasta (nuvem via pasta sincronizada), automático ao abrir | 📝 |

## 4. Central de Revisões e análise

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Central de Revisões | Issues por categoria (links, ortografia, linha do tempo, contradições, dicas) | 📝 |
| Verificadores determinísticos | Links quebrados, palavras repetidas, ordem de eventos (sem IA) | 📝 |
| Análise do livro (digest) | Resumo, fatos e eventos por arquivo; verificação de contradições com IA; orçamento | 📝 |
| Dicas de melhoria (sugestões) | Tipos: estilo, clareza, prolixo, ritmo, ficha ausente, grounding (registradas pela IA com `register_issues`) | 📝 |

## 5. IA

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Chat de IA | Gaveta, fundos (estrelas, nebulosa, órbitas), links clicáveis, horário, botão Parar, botões de resposta | 📝 |
| Provedores e contas | Gemini, Claude, ChatGPT, Groq, Puter (puter.js), Ollama, compatível OpenAI; chaves; copiar chave | 📝 |
| Assistente Astra (embutido) | Provedor sem IA que sempre existe: citações, comandos `/ajuda`… | 📝 |
| Fallback entre contas | Lista de contas alternativas em erro de limite | 📝 |
| Perfis de uso | Mínimo…Ultra: tools, análise, histórico, otimizar instruções | ✅ [`perfis`](../ai/perfis-de-uso-da-ia.md) |
| Modos da IA | Assistente, Co-autor, Autônomo | ✅ [`modos`](../ai/modos-da-ia.md) |
| Fluxos da IA | Gatilho → perfil → modo → ações | ✅ [`fluxos`](../ai/fluxos-da-ia.md) |
| Prompt e contexto | Prompt de sistema (normal/enxuto), contexto, mapa do livro, perfil | 📝 |
| Tools da IA | Registro, tiers (`get_tool_specs`), permissões, escopo do livro aberto | ✅ [`ai-tools`](../ai/ai-tools.md) |
| Skills | Biblioteca, Loja, gatilhos, execução, hash de arquivos, otimizar, cor | ✅ [`skills`](skills.md) |
| Revisão das alterações da IA | Janela lado a lado; modo autônomo grava direto | 📝 |
| Depuração e log de erros | Últimos 10 turnos, alfinete, log de erros da IA | 📝 |
| Uso por modelo | Contagem de tokens por provedor/modelo | 📝 |

## 6. Sistema e interface

| Feature | Resumo | Doc |
| --- | --- | :---: |
| Centrais (casco) | Janela grande com abas, troca de central pelo título, Esc | 📝 |
| Central do Sistema | Geral, Atualização, Aparência, Acessibilidade, Editor, Produtividade, Atalhos, Templates, Backup | 📝 |
| Temas e aparência | Claro/escuro, temas de cores, criar tema, fundo do chat | 📝 |
| Acessibilidade | Zoom, modo noturno, narrador | 📝 |
| Atalhos de teclado | Padrões, personalização, teclas reservadas | 📝 |
| Tecla Esc | Fecha uma camada por vez | 📝 |
| Título da janela | "Nome do Livro - Astra Writer" | 📝 |
| Atualização automática | Verificação de versão e Squirrel (`update.electronjs.org`) | 📝 |
| Instalador e releases | Squirrel + zip portátil, auditoria, publicação no GitHub | ✅ [`guia-de-instalacao`](../guia-de-instalacao.md) |
| Rotina de inicialização | Atualização, backup, skills `app-start` | 📝 |

## 7. Features feitas por IA

Detalhadas em [`../ai/features-ia.md`](../ai/features-ia.md): skills nativas e da Loja, "Corrigir tudo", criar skills com a IA, importação por arquivo
(extração por regras), análise do livro. Neste índice aparecem apenas como **feito por IA**.

## 8. Pendências (⏳)

| Item | Situação |
| --- | --- |
| Busca web em provedores além de Claude e Gemini | hoje só esses dois; os demais rodam sem busca, com aviso |
| Modo autônomo como laço contínuo; modo que força o perfil | decisão de produto pendente |
| Etapa opcional de IA na importação de arquivos | possível, não pedida |
| Escrever os arquivos de feature (📝) do índice | a fazer, um por vez |
