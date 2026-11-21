# Guia do Usuário — Astra Writer

Este guia ensina, passo a passo, a usar o Astra Writer para escrever e organizar um livro. Ele foi escrito para quem **usa** o
aplicativo (autores), não para quem desenvolve. Para a parte técnica, veja [`project.md`](project.md) e
[`ai-tools.md`](ai/ai-tools.md).

> **Como ler:** se você é iniciante, siga os capítulos 1 a 4 na ordem. Os demais são consultas: volte a eles quando precisar.

## Sumário

1. [Primeiros passos](#1-primeiros-passos)
2. [Conhecendo a tela](#2-conhecendo-a-tela)
3. [Como o livro é organizado](#3-como-o-livro-é-organizado)
4. [Escrevendo: rascunho e sincronização](#4-escrevendo-rascunho-e-sincronização)
5. [Dados e tags de um arquivo](#5-dados-e-tags-de-um-arquivo)
6. [Links entre arquivos](#6-links-entre-arquivos)
7. [Pesquisa](#7-pesquisa)
8. [Correção ortográfica e gramatical](#8-correção-ortográfica-e-gramatical)
9. [Pastas, mover e excluir](#9-pastas-mover-e-excluir)
10. [Histórico e changelog](#10-histórico-e-changelog)
11. [O assistente de IA](#11-o-assistente-de-ia)
12. [Permissões: quem pode mexer em quê](#12-permissões-quem-pode-mexer-em-quê)
13. [Dúvidas e problemas comuns](#13-dúvidas-e-problemas-comuns)
14. [Glossário](#14-glossário)

---

## 1. Primeiros passos

### Abrir o aplicativo

Ao abrir, aparece uma tela de abertura ("Per Aspera Ad Astra") com a versão do aplicativo no rodapé. Em seguida a tela principal é
carregada, já no último livro em que você trabalhou.

### Criar seu primeiro livro

1. No canto superior esquerdo, clique no **nome do livro** (a lista de livros).
2. Escolha **"Criar novo livro"**.
3. Responda às perguntas da janela (título e demais informações) e confirme.

O Astra Writer cria uma pasta para o livro com a estrutura padrão (capítulo 1, personagens, lugares, anotações...), abre o livro e já mostra a **Sinopse** no editor.

> **Seus dados ficam no seu computador.** O livro é uma pasta de arquivos Markdown (`.md`). Não há banco de dados nem conta online:
> você pode copiar, versionar ou fazer backup da pasta como qualquer outra.

### Escolher o tema

Clique na **engrenagem** (Configurações) ao lado do nome do livro e use **Modo escuro** para alternar entre o tema claro (roxo) e o
escuro (azul).

### Plano de fundo do chat

Em **Configurações → Aparência → Plano de fundo do chat** (recolhido por padrão; clique para abrir) você escolhe o fundo do assistente, separadamente para o tema escuro e para o claro:
**Estrelas**, **Nebulosa**, **Órbitas** (planetas, luas e asteroides animados) ou **Cor sólida**. Em *Estrelas*, *Órbitas* e *Cor sólida* aparece um
seletor para escolher a **cor de fundo**.

---

## 2. Conhecendo a tela

| Área | Onde fica | Para que serve |
| --- | --- | --- |
| **Lista de livros e engrenagem** | Topo da barra lateral | Trocar de livro, criar livro, abrir as Configurações |
| **Explorer** | Barra lateral | Árvore de arquivos, com as abas **Anotações**, **Escrita** e **Mundo**, a pesquisa e a mini barra de ferramentas |
| **Assistente de Escrita** | Rodapé da barra lateral | Chat com a IA (abre e recolhe com a seta ▲) |
| **Guia do arquivo** | Barra de ferramentas, acima do editor | Nome do arquivo aberto, com a caneta de dados e o `*` de rascunho |
| **Botões da barra** | Canto superior direito | **Auto-link**, **Histórico**, **Exportar** e **Sincronizar** |
| **Editor** | Centro | Onde você escreve |
| **Caixa "Dados do arquivo"** | Entre a barra e o texto | Variáveis e tags do arquivo |
| **Rodapé do editor** | Base do editor | Palavras, tempo de leitura, conexões, avisos e status de salvamento |

**Dica:** quase todo botão tem uma dica: pare o mouse sobre ele por um instante. Passe o mouse sobre o nome do arquivo na guia para ver o **caminho real do arquivo no disco** (por exemplo
`book_001/assets/characters/character_001.md`). Isso ajuda quando o nome exibido é diferente do nome do arquivo.

### Navegar pelo teclado no explorer

Clique em qualquer ponto do explorer e use o teclado:

| Tecla | O que faz |
| --- | --- |
| **↑ / ↓** | Move o destaque entre os arquivos e pastas da aba atual (só destaca, não abre). O ponto de partida é o arquivo selecionado na aba, ou o primeiro item. |
| **→ / ←** | Percorre as **opções** do item destacado (criar, renomear, editar, excluir...). |
| **Enter** | Em uma pasta: abre/fecha. Em um arquivo: abre no editor. Com uma opção escolhida: aciona essa opção. |
| **↓ no último item** | Seleciona o **Assistente de Escrita**; **Enter** abre a gaveta e já coloca o cursor no campo de mensagem. |
| **Esc** | Limpa o destaque. No chat, **Esc** fecha a gaveta e devolve as setas ao explorer. |

### Mini barra do explorer

Logo abaixo da pesquisa:

- **Olho** — mostra ou oculta os *arquivos avançados* (índices e arquivos técnicos).
- **Cadeado** (aba Anotações) — bloqueia ou libera a escrita da IA em **todas** as anotações de uma vez (arquivos e pastas herdam a regra).
- **Árvore de pastas** — abre todas as pastas da aba; se já estiverem todas abertas, fecha todas.
- **Novo capítulo** (aba Escrita), **Nova pasta** e **Nova anotação** (aba Anotações).

---

## 3. Como o livro é organizado

O explorer tem três abas, que correspondem às três pastas principais do livro:

| Aba | Pasta | O que guarda |
| --- | --- | --- |
| **Escrita** | `content/` | Capítulos, sinopse (`plot.md`) e o índice de capítulos |
| **Mundo** | `assets/` | Personagens, locais (ambientes), conceitos/sistemas e a linha do tempo |
| **Anotações** | `notes/` | Anotações livres e pastas que você criar |

### Capítulos

Cada capítulo é uma pasta `content/chapter_001/`, `chapter_002/`... com **três arquivos**:

- **Manuscrito** (`2_draft.md`) — o texto do capítulo em si.
- **Esboço** (`1_outline.md`) — o plano do capítulo, escrito antes de pôr a mão na massa (serve de prompt para a IA gerar o capítulo).
- **Análise** (`3_analysis.md`) — gerada depois da escrita, com sugestões da IA: análise, planejamento dos próximos capítulos e pistas (foreshadowing).

No explorer cada capítulo aparece como **um único item** (ícone de livro aberto); clicar abre o manuscrito. Acima do editor há três guias — **Manuscrito**, **Esboço** e **Análise**: a do arquivo aberto mostra o nome e as outras encolhem para só o ícone; clicar em uma delas abre o arquivo.
Livros antigos são migrados sozinhos (o backlog vira a Análise; nada que você escreveu é perdido e tudo fica no changelog).

Para criar um, use **Novo capítulo** na aba Escrita. Ao excluir um capítulo, os seguintes são **renumerados** automaticamente para não
sobrar buracos.

### Fichas do Mundo

Personagens, locais e conceitos são *fichas*: arquivos com **dados** (variáveis, como nome, apelidos e idade) e seções de texto.
Para criar uma, passe o mouse sobre a pasta da categoria (por exemplo **Personagens**) e clique no **+** ("Novo item em..."). A janela
pergunta os dados e as seções, e a ficha é criada.

### Índices automáticos

Cada categoria tem um arquivo de índice (visível com o olho ligado, por exemplo "Índice de Personagens"). **Você não precisa
editá-lo:** quando uma ficha é criada, o link dela entra no índice; quando é excluída, o link sai. O mesmo vale para os capítulos.

---

## 4. Escrevendo: rascunho e sincronização

Este é o conceito mais importante do Astra Writer.

### Dois estados para cada arquivo

- **Arquivo oficial** (`nome.md`) — a versão "valendo".
- **Rascunho** (`nome.md.temp`) — o que você digitou e ainda não sincronizou.

Enquanto você digita, o texto é **salvo automaticamente como rascunho**. Um arquivo com rascunho mostra um **`*`** ao lado do nome, no
explorer e na guia do arquivo.

### Sincronizar

Clique em **Sincronizar** (canto superior direito) para transformar os rascunhos em versões oficiais. A sincronização:

1. grava o texto oficial;
2. registra a versão no histórico (veja o [capítulo 10](#10-histórico-e-changelog));
3. remove o `*`.

Quando a IA vai editar algo, o app **exige que tudo esteja
sincronizado** antes (para nunca misturar o seu rascunho com o dela).

### Barra de ferramentas do editor

Títulos, negrito, itálico, tachado, linha, citação, listas (com marcadores, numeradas e de tarefas), recuo, tabela, imagem, link,
**procurar e substituir** (`Ctrl+F`) e a alternância entre **texto formatado** e **Markdown cru**.

### Exportar o arquivo

O botão **Exportar** (barra superior, ao lado de Histórico) salva o arquivo aberto fora do aplicativo. Escolha o formato:

| Formato | Para que serve |
| --- | --- |
| **Markdown** (`.md`) | O texto como está no editor, para usar em outros programas de escrita. |
| **Word** (`.docx`) | Para enviar a editores e revisores ou continuar o trabalho no Word. |
| **PDF** | Para ler, imprimir ou compartilhar com a formatação pronta (página A4). |

Depois de escolher, o aplicativo pergunta **onde salvar**. O texto exportado inclui o que você acabou de digitar, mesmo sem sincronizar.
Os links entre arquivos do livro viram texto simples (eles só funcionam dentro do aplicativo); links da web continuam links.

### Exportar o livro

Na **Central do Livro → Exportar** (abra pela caneta ao lado do livro no seletor, ou pelo menu) escolha:

- **O que exportar:** o livro em **um único arquivo** (capítulos na ordem, cada um em página nova), os **capítulos separados** (um arquivo por capítulo, em um zip) ou o **projeto completo** (zip com todos os arquivos, útil como cópia de segurança).
- **O formato** (para os dois primeiros): Markdown, Word ou PDF. O projeto completo mantém os arquivos como estão.

Entram o manuscrito de cada capítulo (com o que você digitou, mesmo sem sincronizar); esboço e análise não. No zip do projeto ficam de fora os dados internos do app (`.system`) e os rascunhos não sincronizados.

### Arquivos somente leitura

Um cadeado no explorer indica que o arquivo **não pode ser editado por você** (por exemplo, índices). A permissão é definida no
próprio arquivo; veja o [capítulo 12](#12-permissões-quem-pode-mexer-em-quê).

---

## 5. Dados e tags de um arquivo

### Caixa "Dados do arquivo"

Fica entre a barra de ferramentas e o texto. Clique em **"Dados do arquivo"** (ou na **caneta** da guia) para abrir ou fechar.
Contém:

- **Tags** do arquivo;
- as **variáveis** da ficha (nome, apelidos, idade, papel na história...). O nome da ficha também é editado aqui: ao mudá-lo, o
  título do arquivo, a linha de título do texto, o explorer e a guia são atualizados.

Clique em **Salvar dados** para gravar. As alterações vão para o **rascunho** do arquivo, como qualquer edição.

> Você também pode abrir os dados de um arquivo **sem abri-lo**, pelo ícone de **lápis** que aparece ao passar o mouse sobre ele
> no explorer.

### Tags

Tags são etiquetas para agrupar arquivos de qualquer categoria (por exemplo `magia`, `vilão`, `arco-1`).

**Como adicionar:**

1. Abra a caixa de dados e clique no campo **Tags**.
2. Digite a palavra e use **vírgula** ou **Enter**: ela vira uma tag colorida.
3. Para remover, clique no **×** da tag (ou use **Backspace** com o campo vazio).

**Sugestões:** ao digitar, aparecem as tags que já existem em outros arquivos do livro. Navegue com **↑ ↓** e escolha com **Enter**,
ou clique.

**Regras:**

- O **#** é só enfeite: aparece antes de cada tag, mas não precisa ser digitado (se digitar, ele é removido).
- Tudo vira **minúsculo**. São aceitos letras (inclusive acentuadas), números e os símbolos `- _ / .`.
- Espaços no meio da tag viram hífen: `alta fantasia` → `alta-fantasia`. Espaços ao redor das vírgulas são ignorados.
- A **cor** de cada tag é escolhida automaticamente a partir do texto dela: a mesma tag tem **sempre a mesma cor** (há 40 cores,
  com versões para o tema claro e o escuro).

As tags do arquivo aparecem também no cabeçalho da caixa, à frente de "Dados do arquivo · N campos". **Clique numa tag** do cabeçalho para
pesquisar por ela: o `#tag` é colocado no campo de pesquisa do explorer (clicar fora das tags abre ou fecha a caixa). Mais sobre pesquisa no
[capítulo 7](#7-pesquisa).

---

## 6. Links entre arquivos

Links ligam suas fichas e capítulos entre si (como uma wiki).

- **Inserir um link:** botão de **link** na barra do editor. Procure o arquivo do livro pelo nome ou informe um endereço da web.
- **Auto-link:** o botão **Auto-link** (barra superior) transforma automaticamente em links as menções a **nomes e apelidos das
  fichas** que aparecem no texto. É útil depois de escrever um capítulo inteiro. Os links criados pelo auto-link aparecem em **rosa**
  até a sincronização, quando passam a azul. Código e textos que já são links são ignorados; títulos são linkados normalmente.
- **Apelidos:** preencha a variável de apelidos da ficha (separados por vírgula) para que o auto-link também reconheça esses nomes.
- **Remover um link:** clique com o botão direito sobre ele e escolha **Remover link**.
- **Link quebrado:** se o arquivo de destino for excluído, o link fica **cinza**.

### Avisos no rodapé

No rodapé do editor aparecem avisos quando há problemas, por exemplo **"2 links internos inválidos"**. **Clique no aviso** para o cursor
ir ao primeiro problema; clique de novo para ir ao próximo, em ordem (no fim, volta ao primeiro).

---

## 7. Pesquisa

O campo de pesquisa fica acima da árvore de arquivos e procura em **títulos, textos e variáveis** de todo o livro. Os resultados
mostram o trecho encontrado, com o termo destacado, e cada aba mostra um número com a quantidade de resultados.

### Pesquisa tolerante

Você não precisa digitar exatamente como está escrito. A busca ignora **maiúsculas, acentos, pontuação** (vírgulas, hífens,
travessões) e as palavrinhas **artigos, conjunções e preposições** (*o, a, e, de, do, em, para...*):

| Você digita | Encontra |
| --- | --- |
| `vira lata` | "vira-lata" |
| `grimório eldoria` | "Grimório de Eldoria" |
| `grande magnífico` | "o grande e magnífico" |

### Vários termos de uma vez

Separe os termos com **vírgula** para procurar vários de uma vez: `reino, magia` mostra os arquivos que têm **reino** ou **magia**. Vale
para texto e para tags, inclusive misturados (`conceito, #vilão`). Uma vírgula sobrando no fim é ignorada.

**Em que ordem os resultados aparecem:**

1. quem casa com **mais termos** vem primeiro (um arquivo que tem os 3 termos fica à frente de um que tem só 1);
2. se empatar, vale a **ordem dos termos** que você digitou (quem casa com o primeiro termo vem antes de quem casa só com o segundo);
3. se ainda empatar, **ordem alfabética**.

Como o explorer é uma árvore, isso vale dentro de cada pasta, e as pastas com os melhores resultados sobem.

### Pesquisa por tags

Comece com **#**: `#magia` mostra os arquivos que têm uma tag com esse nome (basta parte do nome). A tag encontrada aparece no
lugar do trecho de texto. Com várias (`#magia #vilão`), o arquivo precisa ter **todas**.

Ao tentar um `#` com vários termos, lembre: **espaço** junta tags no mesmo termo (todas precisam existir) e **vírgula** separa termos (qualquer um serve).

Se nada for encontrado, a mensagem **"Sem resultados para a pesquisa"** aparece logo abaixo da barra.

---

## 8. Correção ortográfica e gramatical

- **Sublinhado ondulado vermelho** nas palavras que o dicionário não conhece e **laranja** nas palavras repetidas em sequência ("de de").
- **Clique com o botão direito** sobre um sublinhado para abrir o menu:
  - **sugestões** de correção (clique para trocar a palavra);
  - **Ignorar** — deixa de marcar essa palavra até você fechar o aplicativo;
  - **Adicionar ao dicionário** — a palavra passa a ser aceita sempre (vale para todos os seus livros);
  - nas repetições: **Remover a repetição** ou **Manter assim**.
- **O dicionário do livro:** os **nomes e apelidos de todas as fichas** do livro (personagens, locais, conceitos...) já fazem parte do
  dicionário daquele livro. Por isso, o nome de um personagem nunca é marcado como erro e você não precisa adicioná-lo. Textos que já
  são links, código e endereços também não são conferidos.
- **Rodapé:** mostra **"N problemas de escrita"**. Clique no aviso para ir ao problema seguinte, na ordem do texto.
- **Configurações → Idioma e correção:** o switch **"Correção ortográfica e gramatical"** liga ou desliga tudo (sublinhado, menu e
  contador) e **Idioma da correção** troca o dicionário (português do Brasil, inglês, espanhol, francês).

> A parte gramatical é uma verificação simples (palavras repetidas). Para uma revisão de estilo e gramática mais profunda, peça ao
> assistente de IA.

---

## 9. Pastas, mover e excluir

### Criar arquivos direto numa pasta

Passe o mouse sobre uma pasta criada por você: em **Anotações** aparece **Nova anotação em...**; dentro de **Personagens**, **Ambientes**
e **Conceitos** aparece o **+** ("Novo item em..."). O processo é o mesmo da categoria, mas o arquivo já nasce dentro da pasta, sem
precisar movê-lo.

### Pastas

Em **Anotações** e dentro de cada categoria do **Mundo** você pode criar suas próprias pastas (botão **Nova pasta**, ou o ícone de pasta
ao passar o mouse sobre uma pasta). Pastas criadas por você têm um ícone próprio e podem ser **renomeadas** e **excluídas**
(excluir uma pasta apaga tudo o que há dentro dela, e o aplicativo pede confirmação).

### Mover

**Arraste** arquivos e pastas para outra pasta **da mesma categoria** (um personagem só vai para outra pasta de personagens). Os links
internos que apontavam para o arquivo são corrigidos automaticamente.

### Excluir

Passe o mouse sobre o arquivo e clique na **lixeira**. Uma janela pede confirmação. O conteúdo excluído continua no
[changelog](#10-histórico-e-changelog) (ele registra o texto integral). Alguns itens nunca são excluídos individualmente: arquivos de
capítulo (apague o capítulo inteiro), índices e modelos.

---

## 10. Histórico e changelog

O Astra Writer registra **tudo** o que acontece no livro: quem fez (você, a IA ou o próprio sistema), o quê e quando.

### Histórico de um arquivo

Com o arquivo aberto, clique em **Histórico**. A lista mostra as versões anteriores. Escolha uma para ver a **comparação lado a lado**
com a versão atual (o que foi removido em vermelho, o que foi incluído em verde) e clique em **Restaurar esta versão** para voltar a
ela. Restaurar não apaga o registro das versões seguintes, mas elas deixam de poder ser restauradas.

### Changelog do livro

A **Central do Livro → Changelog** mostra todas as ações do livro e o espaço em disco que o histórico (com o conteúdo guardado para
rollback) ocupa. O **Log de erros da IA**, com falhas de conexão ou limite de uso dos provedores, fica na **Central de IA → Log de erros**.

---

## 11. O assistente de IA

O **Assistente de Escrita** fica no rodapé da barra lateral. Clique na seta ▲ para abrir o chat. Enquanto a IA trabalha, o botão de enviar vira um botão **parar** (quadrado vermelho): ele interrompe a resposta na hora. Passe o mouse sobre uma mensagem para ver o horário em que foi enviada.

**Sem IA conectada?** O app traz o **Assistente Astra**, um assistente embutido que sempre existe (não dá para removê-lo). Ele **não é uma IA de verdade**: na primeira mensagem de cada sessão se apresenta com uma citação de escritor e oferece conectar uma IA de verdade (**Central de IA → Contas e modelo**) ou ver o que sabe fazer; depois responde a comandos como `/ajuda`, `/listar`, `/ler`, `/anexar`, com os quais já dá para mexer no livro, de forma mais trabalhosa. O título da janela do Windows mostra o livro aberto ("Nome do Livro - Astra Writer").

### Configurar (uma vez)

1. Abra **Configurações → Inteligência artificial → Provedor e modelo**.
2. Escolha o **provedor** (Claude ou Gemini) e o **modelo**.
3. Cole a **chave de API** do provedor e salve.

> **A chave é sua** (modelo *Bring-Your-Key*): fica salva só no seu computador e nunca é mostrada à IA. Há também um provedor **Mock**,
> usado apenas para testes, que não chama nenhuma IA real.

### O que a IA pode fazer

Conversando em linguagem natural, você pode pedir à IA, por exemplo:

- ler e resumir arquivos, revisar o tom, checar a consistência entre capítulos e fichas;
- redigir ou reescrever trechos e acrescentar texto a um arquivo;
- criar capítulos, personagens, locais e anotações;
- criar, mover e excluir pastas e arquivos (se você permitir);
- alterar variáveis e tags de fichas, e ativar o auto-link em um arquivo;
- consultar o histórico e o changelog, e restaurar uma versão antiga (**sempre pedindo a sua confirmação**);
- dizer quais modelos de IA estão configurados (sem nunca revelar a chave).

A lista completa e técnica está em [`ai-tools.md`](ai/ai-tools.md).

### Como a IA mexe nos seus arquivos (com segurança)

1. **Você controla o acesso.** A IA só lê o que está marcado como legível e só altera o que está marcado como editável
   ([capítulo 12](#12-permissões-quem-pode-mexer-em-quê)). Por padrão, ela **não exclui nada**.
2. **Antes de editar**, o aplicativo pede que todos os seus rascunhos estejam sincronizados.
3. **Enquanto a IA trabalha**, o projeto fica **bloqueado** para você (um aviso aparece no editor), evitando edições simultâneas.
4. **Toda edição da IA vira rascunho.** Ao terminar, abre-se a **tela de revisão** com a comparação lado a lado: você escolhe **manter a
   versão nova** ou **descartar** e ficar com a antiga. Alterações só em dados e tags também aparecem ali ("Idade: 31 → 33").
5. Tudo fica registrado no changelog, com o autor **IA**.

### Dicas para pedir bem

- Seja específico: "Reescreva a abertura do capítulo 2 com um tom mais sombrio" funciona melhor que "melhore o capítulo".
- Peça uma coisa de cada vez quando for alterar muitos arquivos, para revisar com calma.
- Se a IA disser que não pode, é porque a permissão do arquivo não deixa — ajuste a permissão se quiser.

---

## 12. Permissões: quem pode mexer em quê

As permissões ficam no topo de cada arquivo `.md` (o chamado *frontmatter*, entre linhas `---`) e, para as pastas, no arquivo
`folder.yml`. Você pode editá-las em qualquer editor de texto.

```yaml
---
title: "Reino de Eldoria"
humanRead: true      # você pode ler
humanWrite: true     # você pode editar
aiRead: true         # a IA pode ler
aiWrite: true        # a IA pode editar (sempre via rascunho)
aiDelete: false      # a IA pode excluir (ausente = não)
tags: [reino, magia] # tags do arquivo
---
```

| Campo | O que controla |
| --- | --- |
| `humanRead` / `humanWrite` | Se **você** pode ler / editar. `humanWrite: false` deixa o arquivo somente leitura (cadeado). |
| `aiRead` / `aiWrite` | Se a **IA** pode ler / editar. |
| `userDelete` | `false` impede que **você** exclua; ausente segue `humanWrite`. |
| `aiDelete` | `true` permite que a **IA** exclua. Ausente: não exclui. |
| `tags` | Lista de tags do arquivo (use a caixa de dados em vez de editar à mão). |

Nas pastas (`folder.yml`), `userDelete` e `userRename` indicam pastas **criadas por você** (as únicas que podem ser renomeadas,
movidas ou excluídas). Veja os detalhes no capítulo de permissões do [`ai-tools.md`](ai/ai-tools.md#permissões).

---

## 13. Dúvidas e problemas comuns

**Digitei algo e o arquivo mostra `*`. Perdi alguma coisa?**
Não. O `*` indica que há um **rascunho** salvo automaticamente. Clique em **Sincronizar** para torná-lo oficial.

**O botão Sincronizar está desativado.**
Não há rascunhos pendentes (ou o projeto está bloqueado enquanto a IA trabalha).

**O editor está bloqueado e não consigo digitar.**
Ou a IA está trabalhando (aguarde a revisão) ou o arquivo é somente leitura (cadeado no explorer). Veja o
[capítulo 12](#12-permissões-quem-pode-mexer-em-quê).

**A IA disse que não tem acesso a um arquivo.**
O arquivo tem `aiRead: false` (ou `aiWrite: false` para edição). Ajuste a permissão no frontmatter se quiser liberar.

**A pesquisa não acha um arquivo que acabei de editar.**
A pesquisa lê também os rascunhos. Confira se o termo está no título, no texto ou nas variáveis, ou use `#tag` para tags.

**Excluí algo sem querer.**
Abra o **Changelog do livro**: o texto integral de arquivos excluídos fica guardado e pode ser recuperado.

**O corretor marca uma palavra que existe.**
Clique com o botão direito nela e escolha **Adicionar ao dicionário** (ou **Ignorar**). Nomes e apelidos das fichas do livro já são aceitos
automaticamente; se o nome ainda aparece sublinhado, confira se ele está no título ou nos apelidos da ficha.

**Como faço backup?**
Copie a pasta do livro (dentro de `books/`). Tudo — texto, permissões, histórico — está nela.

---

## 14. Glossário

| Termo | Significado |
| --- | --- |
| **Livro** | Uma pasta com todos os arquivos de um projeto. |
| **Ficha** | Arquivo do Mundo (personagem, local, conceito) com dados e seções. |
| **Variável / dado** | Campo de uma ficha (nome, idade, apelidos...). |
| **Tag** | Etiqueta colorida para agrupar arquivos; pesquisável com `#`. |
| **Rascunho** (`.md.temp`) | Alterações ainda não sincronizadas; indicado pelo `*`. |
| **Sincronizar** | Transformar rascunhos em versões oficiais. |
| **Frontmatter** | Bloco entre `---` no topo do arquivo com título, permissões e dados. |
| **Auto-link** | Criação automática de links para fichas citadas no texto. |
| **Changelog** | Registro de tudo o que foi feito no livro, com autor e data. |
| **Tool (ferramenta)** | Ação que a IA pode executar no livro, sempre respeitando as permissões. |


## Centrais

As **centrais** são janelas grandes com abas à esquerda. Abra-as pelo botão do rodapé do editor (Revisões) ou pela gaveta de **Configurações > Centrais**. **Esc** ou o **X** fecham. O **Esc** fecha, uma de cada vez, a camada aberta mais acima (configurações, janela, central ou gaveta do chat); janelas que exigem uma decisão (sem X) não fecham com Esc.

### Central de Revisões

O botão no rodapé mostra **Tudo certo** (verde) ou o número de **pendências** (amarelo: só sugestões e possíveis erros; vermelho: há erros confirmados). Dentro dela:

- **Resumo:** números, os erros mais graves, a **análise da IA**, o pedido para a **IA corrigir sozinha** (não recomendado; a IA pode errar), os **tipos dispensados** (dá para reativar) e o **dicionário do livro**.
- **Links, Ortografia e gramática, Linha do tempo, Contradições e Dicas de melhoria:** cada pendência é um cartão com a tag do tipo, o arquivo e a linha, o trecho, a solução recomendada e as ações **Ir para o trecho** (abre o arquivo com o cursor no ponto exato), **Corrigir** (vai para o rascunho; sincronize para salvar), **Dispensar**, **Adicionar ao dicionário** (erros de digitação) e **Dispensar todos desse tipo**.
- Ao passar o mouse sobre um arquivo no explorer aparecem as marcas de pendências (vermelha: erros; amarela: sugestões).

### Eventos e linha do tempo

Em **Mundo > Eventos** cada fato é um arquivo com **quando ocorreu**, **depois de** e **antes de**. Os campos "depois de" e "antes de" funcionam como as tags: vários eventos separados por vírgula, com uma lista que busca os eventos já cadastrados e aceita nomes novos. Um evento citado que ainda não tem ficha vira sugestão de nome ao criar o próximo evento.

O sistema (sem usar IA) liga os eventos, **atualiza sozinho o arquivo da linha do tempo** na ordem descrita, coloca numa seção "Sem data conhecida" os eventos sem momento nem ligação com outros, e avisa de ordem circular ou datas contraditórias (enquanto houver contradição, o arquivo não é alterado). A linha do tempo oficial **ninguém edita à mão**. Ela é também o **índice dos eventos**: lista o link de todos os eventos registrados (não existe um "Índice de Eventos" à parte), em ordem cronológica quando o sistema consegue deduzi-la.

### Arquivos novos e sincronização

Personagens, locais, anotações, eventos e capítulos novos nascem como **rascunho** e entram na lista de sincronização. Ao sincronizar eles viram oficiais e o app oferece a **análise da IA** (com estimativa de tokens), que cria um resumo de metadados de cada arquivo atualizado e confere contradições.

### Trocar de central e atalhos da barra do editor

Clique no **nome da central** (no topo da janela) para abrir a lista e ir direto para outra central. Na barra do editor, o botão com o ícone de corretor ortográfico abre a aba **Ortografia** da Central de Revisões.

### Citações e "Corrigir tudo"

- **Citado em X arquivos:** no cabeçalho "Dados do arquivo", na frente do número de campos, aparece **citado em X arquivos** quando outros arquivos têm link para ele. Clique para ver cada citação (o título do arquivo e o parágrafo onde está o link) e clique numa citação para ir direto ao ponto do texto.
- **Corrigir tudo com a IA:** na Central de Revisões há o botão em cada aba e na visão geral. A IA avalia cada pendência e escolhe a solução: aplica a correção segura, resolve contradições pelas fichas e pela Sinopse e deixa para você o que depende de decisão. As mudanças viram rascunho e ficam no changelog.
- **Aviso de resposta da IA:** com o chat fechado, uma bolinha aparece no cabeçalho do assistente e toca um som suave quando a IA responde (desligue em Central do Sistema → Geral).

### Importar e exportar livros

- **Importar:** no seletor de livros, **Importar livro (.zip)** cria um livro novo a partir de um zip exportado pelo app (o zip é validado, e o livro ganha um nome novo se o título já existir).
- **Importar de um arquivo:** no seletor de livros, **Importar de um arquivo (Word, PDF, texto)** lê um `.docx`, `.odt`, `.pdf`, `.txt` ou `.md`, separa os capítulos pelos títulos e mostra o que encontrou: você corrige o título do livro, renomeia, junta com o anterior ou remove o que foi identificado errado, e segue o assistente de criação de livro normalmente.
- **Exportar:** Central do Livro → **Exportar**: o livro em um único arquivo, os capítulos separados ou o projeto completo (zip), em Markdown, Word ou PDF.

### Modo autônomo da IA

Com o livro em modo **autônomo**, a IA grava direto os arquivos que escreve (sem a janela de revisão; tudo continua no changelog e dá para desfazer). Cada arquivo alterado ganha uma **bolinha azul** no explorer (e, nos capítulos, nas abas Manuscrito, Esboço e Análise). A bolinha some 3 segundos depois que você abre o arquivo.

### Central do Sistema

A **Central do Sistema** (Configurações → Centrais, ou **Ctrl+Shift+Y**) reúne as configurações do app, não do livro:

- **Geral e Atualização:** versão instalada e se é a mais recente, atualização automática, espaço ocupado (livros, histórico, dados do app) e **desinstalar** (com opção de exportar os livros antes; os livros ficam em Documentos/Astra Writer e continuam lá).
- **Aparência:** claro/escuro, temas de cores prontos (**Netuno**, **Terra**, **Saturno**, **Vênus** em tons pastel e **Pulsar**, synthwave rosa e azul) e **criar o seu** (cor por cor, para o modo claro e o escuro), e o **fundo do chat** (estrelas, nebulosa, órbitas ou cor sólida), cada um com suas cores.
- **Acessibilidade:** tamanho da fonte do app, **modo noturno** (filtro amarelado em horário agendado) e **narrador** (botão com o ícone de alto-falante na barra do editor, com **pausar** e **parar** durante a leitura; passe o mouse para ver a dica).
- **Editor:** tamanho da letra e fonte do texto e dos títulos, com uma **pré-visualização ao vivo** em destaque no topo.
- **Produtividade:** o **cronômetro** vem **desligado**; ative em **Mostrar o cronômetro** e ele aparece entre as abas e a busca do explorer, com play/pause, modo **Auto** (para quando a janela perde o foco ou você fica 2 minutos parado) e **zerar** (para o relógio e espera você dar play de novo). Com uma **meta de tempo** (ex.: 60 min), o relógio **conta de forma regressiva**: ao chegar a zero toca um som suave e a faixa fica verde com "meta cumprida"; o modo Auto continua pausando quando você se ausenta. Aqui ficam o gráfico de linha por dia e os registros, agrupados por dia (com média e seta para expandir), que dá para apagar.
- **Atalhos:** todos os atalhos do app. Dá para trocar os principais (clique em **Alterar** e aperte a nova combinação). Setas, Esc, Tab, Enter, Espaço e as teclas de edição do sistema são reservadas. A navegação do explorer pelo teclado (↑ ↓ → ← Enter Esc) é fixa.
- **Templates:** veja abaixo.
- **Backup:** pasta de backup (pode ser a de um serviço de nuvem instalado), backup automático ao abrir o app e quantas cópias manter por livro (padrão: 2). A pasta padrão é Documentos/Astra Writer/backups.

Ao abrir o app, uma **rotina de inicialização** confere se há versão nova e se o backup automático está vencido, sem travar nada; só aparece uma janela quando há decisão a tomar (atualização pronta para instalar).

### Templates

Todo arquivo novo nasce de um template (fichas de personagem, ambiente, conceito e evento; esboço e análise do capítulo). Há três **perfis de template**: **Assistente** (perguntas que estimulam a escrita), **Co-autor** (informações que a IA aproveita, como amostras de diálogo) e **Autônomo** (instruções claras para a IA). Só o **corpo** muda de perfil; os campos (variáveis) são sempre os mesmos. Ao criar um livro o perfil é escolhido pelo modo da IA, mas você pode trocar; depois, na Central do Livro. Em **Central do Sistema → Templates** você edita cada template numa janela com o editor, **duplica** um perfil para criar o seu e **restaura** o original (editar nunca altera os arquivos do app).

### Skills

**Skills** são pacotes de instruções que a IA executa usando as tools, compartilhados entre todos os livros. Na **Central de IA → Skills** há a biblioteca (**Minhas skills**) e o **Loja** (catálogo que já vem com o app). Cada skill tem página própria (autor, versão, descrição, texto completo, gatilhos, tools permitidas, estimativa de tokens e histórico de execuções).

- **Uso único:** roda quando você manda (**Executar agora**), sempre com uma janela de confirmação que mostra o que ela pode fazer e a **estimativa de tokens**.
- **Recorrente:** roda sozinha nos **gatilhos** escolhidos (ao sincronizar, ao abrir o livro ou um arquivo, ao criar/atualizar/excluir capítulos, personagens, ambientes, conceitos, eventos e anotações, etc.).
- **Permissão:** cada skill tem "pedir permissão antes de ativar" (ligado por padrão) e há a opção geral "todas as skills pedem permissão" (marcada sozinha nos perfis Mínimo e Econômico).
- **Gatilho de capítulo e economia:** há o gatilho **"Ao sincronizar o manuscrito de um capítulo"** (esboço e análise não disparam). Skills com gatilho de arquivo só rodam de novo quando o arquivo mudou (ou a Sinopse/a skill mudaram). Em cada skill há a opção **"Otimizar as instruções ao executar"**: desligue em skills com amostras de escrita.
- **Skills nativas:** algumas já vêm instaladas (criar fichas, eventos, corrigir pendências, remover um item da história…): têm o selo **nativa**, **não podem ser removidas** (o sistema depende delas) mas podem ser editadas, com aviso (dá para restaurar o original).
- **Perguntas antes de executar:** uma skill pode pedir informações (ex.: o nome de um autor e amostras de escrita); uma janela mostra um campo para cada pergunta.
- **Pesquisa na internet:** em cada skill há a opção **"Permitir pesquisa na internet"** (busca nativa do provedor; hoje Claude e Gemini). Ligada, a IA pesquisa durante a skill (por exemplo, quem é o autor e o estilo dele, ou se um fato combina com a época). Gasta mais tokens.
- **Criar com a IA:** peça à IA para criar uma skill; ela faz algumas perguntas e abre o formulário já preenchido para você revisar e criar.
- **Busca e cores:** há uma barra de busca na biblioteca e na loja. Cada skill tem uma **cor** (sugerida a partir do nome, e você pode trocar) que aparece no cartão, junto com o estado **ativa/inativa**. Na página da skill, as tools permitidas aparecem numa grade com caixas de seleção e um filtro.
- **Editar:** mudar o texto de uma skill do app ou da loja cria uma cópia marcada como "editado" (dá para restaurar o original). Gatilhos e tools permitidas podem ser ajustados sem criar cópia.

### A IA e o app

A IA conhece o app e pode abrir telas, mudar o tema ou a fonte, consultar o guia e executar skills. Ações que podem atrapalhar pedem a sua **permissão** numa janela; ações delicadas (modo da IA, permissões de arquivos, contas e chaves, excluir livro, desinstalar) a IA **não faz**: ela orienta e abre a tela para você.

### Central do Livro e Central de IA

- **Livro:** nome, modo da IA (assistente, co-autor ou autônomo), visão geral (total de arquivos e espaço em disco, sem o changelog e o chat), changelog (com o espaço que ele ocupa) e exclusão do livro. Também abre pela **caneta** que aparece ao lado de cada livro no seletor de livros.
- **IA:** várias contas com apelido e chave, fallback automático, uso por modelo, **perfil de uso** (Mínimo, Econômico, Equilibrado, Completo, Ultra ou Personalizado, com uma opção ligável por etapa; entre elas, **Otimizar instruções**, que envia à IA as instruções do app, as descrições das tools e as skills de forma mais enxuta e pede respostas curtas, e que já vem ligada nos perfis Mínimo e Econômico), depuração (os 10 últimos turnos com o texto completo enviado, tools e tokens; o alfinete fixa um turno no livro), log de erros e as skills (biblioteca compartilhada entre os livros). Abre também pelo botão **Central de IA** abaixo do campo de texto do chat. Nas **Configurações** ficam só o seletor de conta/modelo e os atalhos do dia a dia.
- **Provedores:** Claude, Gemini, ChatGPT (OpenAI), Groq, Puter, **Ollama** (modelos locais, sem chave) e qualquer **servidor compatível com a API da OpenAI** (LM Studio, llama.cpp, vLLM...). Modelos sem suporte a tools funcionam em **modo simulado**: o app ensina o formato no prompt, lê os pedidos de tool na resposta e executa o mesmo laço. No modo automático ele tenta o nativo e, se o modelo recusar, simula.
