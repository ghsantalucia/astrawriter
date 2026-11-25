/**
 * @file scripts/build-manual.js
 * @description Gera o livro padrão "Manual de Uso" (pt, em `templates/manual/`) e o "User Manual" (en, em `templates/en/manual/`).
 * Eles são instalados na pasta de livros do usuário na primeira abertura do app (ver `src/main/first-run.ts`). Cada livro parte
 * do modelo de livro do idioma (`templates/book` e `templates/en/book`) e ganha: uma anotação sobre anotações, um capítulo cujos
 * três arquivos explicam o propósito de cada um, uma ficha de exemplo em cada categoria do Mundo e, nas anotações, o manual
 * completo (copiado de `docs/guia-do-usuario.md` e `docs/user-guide.en.md`). Os NOMES de arquivo são iguais nos dois idiomas;
 * só o conteúdo muda.
 * Uso: node scripts/build-manual.js [pt|en]   (sem argumento gera os dois; roda sozinho no `npm run release`)
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/** Configuração de cada idioma: pastas de origem/destino e fontes do texto longo. */
const LANGS = {
  pt: {
    base: path.join(root, 'templates', 'book'),
    out: path.join(root, 'templates', 'manual'),
    welcome: path.join(__dirname, 'manual-src', 'comece-por-aqui.md'),
    guide: path.join(root, 'docs', 'guia-do-usuario.md'),
  },
  en: {
    base: path.join(root, 'templates', 'en', 'book'),
    out: path.join(root, 'templates', 'en', 'manual'),
    welcome: path.join(__dirname, 'manual-src', 'comece-por-aqui.en.md'),
    guide: path.join(root, 'docs', 'user-guide.en.md'),
  },
};

/** Textos embutidos de cada idioma. */
const TEXTS = {
  pt: {
    bookTitle: 'Manual de Uso',
    done: 'Manual de Uso gerado em',
    plot: {
      title: 'Sinopse',
      bookTitlePh: 'Título do Livro',
      aiModePh: 'Modo da IA',
      options: [
        'Assistente de escrita: você escreve e a IA ajuda quando pedida',
        'Co-autor: a IA propõe e escreve junto com você, passo a passo',
        'Autônomo: a IA escreve a partir de um briefing seu',
      ],
      genresPh: 'Gêneros literários',
      genre: 'Manual',
      body: `# SINOPSE

## Resumo da ideia central

Este livro é o **Manual de Uso** do Astra Writer: cada arquivo dele explica o que aquele tipo de arquivo é e para que serve. Explore o explorer (a barra da esquerda) abrindo os arquivos em qualquer ordem.

> A **Sinopse** é a "alma" do livro. Ela é o primeiro arquivo que a IA lê: é aqui que você resume a ideia central, o objetivo final e o tom de escrita da sua história. Quanto melhor a sinopse, mais a IA (e a Central de Revisões) entendem o que o seu livro quer ser.

## Objetivo final

> Aqui você descreve para onde a história caminha. A IA compara os capítulos com este objetivo para avisar se algo está fugindo do rumo.

## Tom de escrita

> Narrador, tempo verbal, clima da história. A IA usa isto para escrever e revisar no seu estilo.

Os campos que aparecem acima do texto (clique em **Dados do arquivo**) são o título do livro, o **modo da IA** (assistente, co-autor ou autônomo; dá para mudar também na [Central do Livro](app:central/book/data)) e os gêneros. Quando terminar de explorar, crie o seu livro em **Novo livro** (no seletor de livros, no topo da barra lateral) e apague este, se quiser.
`,
    },
    indexTitle: 'Índice de Capítulos',
    chapterLink: 'Capítulo 01',
    outline: {
      title: 'Esboço',
      body: `# ESBOÇO - CAPÍTULO

O **Esboço** é o plano do capítulo, escrito *antes* do texto. Use-o para organizar o que vai acontecer: a lista de cenas, o objetivo do capítulo, quem aparece e o que muda para os personagens.

- A IA lê o esboço para escrever o capítulo (se você pedir) e para conferir se o texto seguiu o plano. Para conectar uma IA, vá para a [Central de IA](app:central/ai/model).
- Ao criar um capítulo você pode já deixar um planejamento inicial (um brainstorm, a lista de cenas).
- Pode ser tão detalhado ou tão solto quanto você quiser: é só para você e para a IA.
`,
    },
    draft: {
      title: 'Manuscrito',
      body: `# CAPÍTULO

O **Manuscrito** é o texto do capítulo: a história propriamente dita. É o que sai no livro quando você exporta (Markdown, Word ou PDF).

- Tudo o que você escreve aqui vira **rascunho** (o asterisco ao lado do nome) até você apertar **Sincronizar**, que confirma o texto e guarda uma versão no histórico.
- Dá para ligar o texto às fichas do mundo (personagens, lugares...) com o botão de **link** da barra do editor, e o botão **Auto-link** cria os links sozinho.
- O **Histórico** do arquivo (botão na barra de cima) guarda as versões anteriores, para você voltar atrás quando quiser; o registro de tudo o que mudou no livro fica no [changelog](app:central/book/changelog).
- Erros de digitação e de gramática aparecem sublinhados; a [Central de Revisões](app:central/issues/spelling) lista todos.
- Quando a IA escreve aqui, o que ela faz também vira rascunho: você compara lado a lado e decide o que fica.
`,
    },
    analysis: {
      title: 'Análise',
      body: `# ANÁLISE DO CAPÍTULO

A **Análise** vem *depois* que o capítulo está escrito. Ela guarda o que se aprendeu com o texto: se o capítulo avançou o enredo, como os personagens evoluíram, como o capítulo termina (os ganchos para o próximo) e o planejamento dos capítulos seguintes.

- Também guarda as **pistas e o foreshadowing**: o que foi plantado e ainda precisa ser colhido mais adiante.
- A IA pode preencher e atualizar este arquivo para você, comparando o capítulo com a [Sinopse](/content/plot.md). Quanto ela pode analisar sozinha depende do [perfil de uso da IA](app:central/ai/analysis).
- É uma ferramenta de planejamento: não entra no livro exportado.
`,
    },
    examples: {
      characters: {
        file: 'sobre-personagens.md',
        title: 'Sobre personagens',
        fields: {
          title: { placeholder: 'Nome do personagem', required: true, content: 'Sobre personagens' },
          aliases: { placeholder: 'Apelidos (separados por vírgula)' },
          age: { placeholder: 'Idade' },
          role: { placeholder: 'Papel na história (protagonista, antagonista, apoio...)' },
        },
        body: `# FICHA DE PERSONAGEM

Em **Personagens** ficam as pessoas (ou criaturas) da sua história: uma ficha para cada uma. Aqui você guarda o que não pode ser esquecido nem contradito: aparência, personalidade, história, o jeito de falar.

- Os campos de cima (**Dados do arquivo**) são o nome, os **apelidos** e outras informações. Quando alguém escreve um apelido no texto, o **Auto-link** sabe de quem se trata.
- A IA usa as fichas para manter o personagem consistente nos capítulos, e a [Central de Revisões](app:central/issues/contradictions) compara o que você escreve com o que está aqui (se a idade, o parentesco ou um traço não baterem, ela avisa).
- Para criar uma ficha, passe o mouse sobre **Personagens** e clique no **+**.
`,
      },
      places: {
        file: 'sobre-ambientes.md',
        title: 'Sobre ambientes',
        fields: {
          title: { placeholder: 'Nome do ambiente', required: true, content: 'Sobre ambientes' },
          aliases: { placeholder: 'Nomes alternativos (separados por vírgula)' },
        },
        body: `# FICHA DE AMBIENTE

Em **Ambientes** ficam os lugares da história: cidades, reinos, casas, florestas, planetas. Cada lugar tem a sua ficha, com clima, aparência, história e quem vive ali.

- Servem para o mundo ser coerente: o castelo tem sempre as mesmas torres, o rio corre sempre na mesma direção.
- A IA consulta as fichas antes de descrever um lugar, e as [revisões](app:central/issues/contradictions) avisam se um capítulo contradiz o que está registrado aqui.
`,
      },
      elements: {
        file: 'sobre-conceitos.md',
        title: 'Sobre conceitos',
        fields: {
          title: { placeholder: 'Nome do conceito', required: true, content: 'Sobre conceitos' },
          aliases: { placeholder: 'Nomes alternativos (separados por vírgula)' },
        },
        body: `# FICHA DE CONCEITO

Em **Conceitos** ficam as regras do seu universo que não são pessoas nem lugares: o sistema de magia, a tecnologia, uma religião, uma lei, uma língua, uma instituição.

- Guarde aqui como a coisa funciona e quais são os limites. É o que impede, por exemplo, um feitiço de ganhar um poder novo no meio do livro.
- A IA e a [Central de Revisões](app:central/issues/contradictions) usam estas fichas para achar contradições nas regras do mundo.
`,
      },
      events: {
        file: 'sobre-eventos.md',
        title: 'Sobre eventos',
        fields: {
          title: { placeholder: 'Nome do evento', required: true, content: 'Sobre eventos' },
          when: { placeholder: 'Quando ocorreu (ex.: ano 312, inverno do ano 5, durante a guerra)' },
          after: { placeholder: 'Aconteceu depois de (nomes de outros eventos, separados por vírgula)', type: 'events' },
          before: { placeholder: 'Aconteceu antes de (nomes de outros eventos, separados por vírgula)', type: 'events' },
          aliases: { placeholder: 'Nomes alternativos (separados por vírgula)' },
        },
        body: `# FICHA DE EVENTO

Em **Eventos** ficam os fatos da história, um por arquivo: a batalha, a coroação, a traição. O que importa é **quando** cada um aconteceu.

- Os campos **depois de** e **antes de** ligam este evento a outros (vários, separados por vírgula). A partir dessas ligações o sistema monta a [Linha do Tempo](/assets/events/timeline.md), sem usar IA.
- A **Linha do Tempo** é o índice desta categoria: lista o link de todos os eventos, em ordem cronológica quando o sistema consegue deduzi-la (os sem data conhecida ficam numa seção à parte). Você não a edita: ela se atualiza sozinha.
- Se houver uma ordem impossível (A antes de B e B antes de A), a [Central de Revisões](app:central/issues/timeline) avisa.
`,
      },
    },
    timeline: {
      title: 'Linha do Tempo',
      body: `# LINHA DO TEMPO

> Gerada a partir das fichas de eventos. Não é editável pelo autor: quem a preenche é o sistema ou a IA.

## Sem data conhecida

> Eventos sem momento e sem relação de ordem com outros eventos. Informe o momento ou ligue-os a outros eventos ("antes" e "depois") para que entrem na ordem.

1. [Sobre eventos](/assets/events/sobre-eventos.md)
`,
    },
    indexTitles: {
      characters: ['Índice de Personagens', 'PERSONAGENS', 'Sobre personagens'],
      places: ['Índice de Ambientes', 'AMBIENTES', 'Sobre ambientes'],
      elements: ['Índice de Conceitos', 'CONCEITOS', 'Sobre conceitos'],
    },
    notes: {
      title: 'O que são anotações',
      body: `# O que são anotações

**Anotações** são o seu caderno dentro do livro: ideias soltas, pesquisas, listas, pedaços de cenas, lembretes. Diferente do resto do livro, as anotações **não têm um formato**: você escreve o que quiser, como quiser, e pode criar **pastas** para organizá-las.

## Para que servem

- Guardar o que ainda não tem lugar: uma ideia para o capítulo 20, uma frase boa, a referência de um livro.
- Reunir pesquisa (links, trechos, datas) sem misturar com as fichas do mundo.
- Conversar com a IA sobre o seu material de apoio, se você permitir.

## O cadeado

Cada anotação (e cada pasta) tem um **cadeado**, que decide o que a IA pode fazer ali:

- **Cadeado aberto:** a IA pode **ler** a anotação e também **escrever** nela (suas alterações viram rascunho para você aprovar).
- **Cadeado fechado:** a IA **não pode alterar** a anotação. Ela ainda pode ler, a menos que você bloqueie a leitura também.

Na aba **Anotações** existe um cadeado geral, que libera ou bloqueia a escrita da IA em **todas** as anotações de uma vez. Pastas passam a regra para o que estiver dentro delas.

## Boas práticas

- Deixe fechado o cadeado do que é só seu (rascunhos pessoais, ideias que você não quer que a IA mexa).
- Deixe aberto o que você quer que a IA ajude a organizar.
- Anotações não entram no livro exportado.

Para um passeio pelo app, volte ao [Comece por aqui](/notes/comece-por-aqui.md); o guia inteiro está no [Manual completo do usuário](/notes/manual-completo.md).
`,
    },
    fullTitle: 'Manual completo do usuário',
  },

  en: {
    bookTitle: 'User Manual',
    done: 'User Manual generated in',
    plot: {
      title: 'Synopsis',
      bookTitlePh: 'Book title',
      aiModePh: 'AI mode',
      options: [
        'Writing assistant: you write and the AI helps when asked',
        'Co-author: the AI proposes and writes together with you, step by step',
        'Autonomous: the AI writes from a briefing you provide',
      ],
      genresPh: 'Literary genres',
      genre: 'Manual',
      body: `# SYNOPSIS

## Summary of the core idea

This book is the Astra Writer **User Manual**: each file in it explains what that kind of file is and what it is for. Explore the explorer (the left bar) by opening the files in any order.

> The **Synopsis** is the "soul" of the book. It is the first file the AI reads: this is where you sum up the core idea, the final goal and the writing tone of your story. The better the synopsis, the better the AI (and the Review Center) understand what your book wants to be.

## Final goal

> Here you describe where the story is heading. The AI compares the chapters with this goal to warn you if something is drifting off course.

## Writing tone

> Narrator, verb tense, mood of the story. The AI uses this to write and review in your style.

The fields shown above the text (click **File data**) are the book title, the **AI mode** (assistant, co-author or autonomous; you can also change it in the [Book Center](app:central/book/data)) and the genres. When you are done exploring, create your book with **New book** (in the book selector, at the top of the sidebar) and delete this one if you like.
`,
    },
    indexTitle: 'Chapter Index',
    chapterLink: 'Chapter 01',
    outline: {
      title: 'Outline',
      body: `# OUTLINE - CHAPTER

The **Outline** is the chapter plan, written *before* the text. Use it to organize what is going to happen: the list of scenes, the goal of the chapter, who appears and what changes for the characters.

- The AI reads the outline to write the chapter (if you ask) and to check whether the text followed the plan. To connect an AI, go to the [AI Center](app:central/ai/model).
- When you create a chapter you can already leave an initial plan (a brainstorm, the list of scenes).
- It can be as detailed or as loose as you like: it is only for you and the AI.
`,
    },
    draft: {
      title: 'Manuscript',
      body: `# CHAPTER

The **Manuscript** is the chapter text: the story itself. It is what goes into the book when you export (Markdown, Word or PDF).

- Everything you write here becomes a **draft** (the asterisk next to the name) until you press **Sync**, which confirms the text and saves a version in the history.
- You can link the text to the world sheets (characters, places...) with the **link** button on the editor toolbar, and the **Auto-link** button creates the links for you.
- The file's **History** (button on the top bar) keeps earlier versions, so you can go back whenever you want; the record of everything that changed in the book is in the [changelog](app:central/book/changelog).
- Typos and grammar mistakes appear underlined; the [Review Center](app:central/issues/spelling) lists them all.
- When the AI writes here, what it does also becomes a draft: you compare side by side and decide what stays.
`,
    },
    analysis: {
      title: 'Analysis',
      body: `# CHAPTER ANALYSIS

The **Analysis** comes *after* the chapter is written. It keeps what was learned from the text: whether the chapter moved the plot forward, how the characters evolved, how the chapter ends (the hooks for the next one) and the plan for the following chapters.

- It also keeps the **clues and foreshadowing**: what was planted and still needs to be paid off later.
- The AI can fill in and update this file for you, comparing the chapter with the [Synopsis](/content/plot.md). How much it can analyze on its own depends on the [AI usage profile](app:central/ai/analysis).
- It is a planning tool: it does not go into the exported book.
`,
    },
    examples: {
      characters: {
        file: 'sobre-personagens.md',
        title: 'About characters',
        fields: {
          title: { placeholder: 'Character name', required: true, content: 'About characters' },
          aliases: { placeholder: 'Nicknames (comma-separated)' },
          age: { placeholder: 'Age' },
          role: { placeholder: 'Role in the story (protagonist, antagonist, supporting...)' },
        },
        body: `# CHARACTER SHEET

**Characters** holds the people (or creatures) of your story: one sheet for each. Here you keep what must not be forgotten or contradicted: appearance, personality, history, the way they speak.

- The fields at the top (**File data**) are the name, the **nicknames** and other information. When someone writes a nickname in the text, **Auto-link** knows who it refers to.
- The AI uses the sheets to keep the character consistent across chapters, and the [Review Center](app:central/issues/contradictions) compares what you write with what is here (if the age, a family relation or a trait does not match, it warns you).
- To create a sheet, hover over **Characters** and click the **+**.
`,
      },
      places: {
        file: 'sobre-ambientes.md',
        title: 'About places',
        fields: {
          title: { placeholder: 'Place name', required: true, content: 'About places' },
          aliases: { placeholder: 'Alternative names (comma-separated)' },
        },
        body: `# PLACE SHEET

**Places** holds the locations of the story: cities, kingdoms, houses, forests, planets. Each place has its own sheet, with climate, appearance, history and who lives there.

- They keep the world coherent: the castle always has the same towers, the river always flows in the same direction.
- The AI consults the sheets before describing a place, and the [reviews](app:central/issues/contradictions) warn you if a chapter contradicts what is recorded here.
`,
      },
      elements: {
        file: 'sobre-conceitos.md',
        title: 'About concepts',
        fields: {
          title: { placeholder: 'Concept name', required: true, content: 'About concepts' },
          aliases: { placeholder: 'Alternative names (comma-separated)' },
        },
        body: `# CONCEPT SHEET

**Concepts** holds the rules of your universe that are neither people nor places: the magic system, technology, a religion, a law, a language, an institution.

- Keep here how the thing works and what its limits are. It is what prevents, for example, a spell from gaining a new power in the middle of the book.
- The AI and the [Review Center](app:central/issues/contradictions) use these sheets to find contradictions in the rules of the world.
`,
      },
      events: {
        file: 'sobre-eventos.md',
        title: 'About events',
        fields: {
          title: { placeholder: 'Event name', required: true, content: 'About events' },
          when: { placeholder: 'When it happened (e.g. year 312, winter of year 5, during the war)' },
          after: { placeholder: 'Happened after (names of other events, comma-separated)', type: 'events' },
          before: { placeholder: 'Happened before (names of other events, comma-separated)', type: 'events' },
          aliases: { placeholder: 'Alternative names (comma-separated)' },
        },
        body: `# EVENT SHEET

**Events** holds the facts of the story, one per file: the battle, the coronation, the betrayal. What matters is **when** each one happened.

- The **happened after** and **happened before** fields link this event to others (several, comma-separated). From these links the system builds the [Timeline](/assets/events/timeline.md), without using AI.
- The **Timeline** is the index of this category: it lists the link to every event, in chronological order when the system can work it out (those with no known date go in a separate section). You do not edit it: it updates itself.
- If there is an impossible order (A before B and B before A), the [Review Center](app:central/issues/timeline) warns you.
`,
      },
    },
    timeline: {
      title: 'Timeline',
      body: `# TIMELINE

> Generated from the event sheets. The author cannot edit it: the system or the AI fills it in.

## No known date

> Events with no moment and no ordering relation to other events. Give the moment or link them to other events ("before" and "after") so they fall into order.

1. [About events](/assets/events/sobre-eventos.md)
`,
    },
    indexTitles: {
      characters: ['Characters Index', 'CHARACTERS', 'About characters'],
      places: ['Places Index', 'PLACES', 'About places'],
      elements: ['Concepts Index', 'CONCEPTS', 'About concepts'],
    },
    notes: {
      title: 'What notes are',
      body: `# What notes are

**Notes** are your notebook inside the book: loose ideas, research, lists, pieces of scenes, reminders. Unlike the rest of the book, notes **have no format**: you write whatever you want, however you want, and you can create **folders** to organize them.

## What they are for

- Keeping what has no place yet: an idea for chapter 20, a good line, a book reference.
- Gathering research (links, excerpts, dates) without mixing it with the world sheets.
- Talking to the AI about your supporting material, if you allow it.

## The padlock

Each note (and each folder) has a **padlock**, which decides what the AI can do there:

- **Open padlock:** the AI can **read** the note and also **write** to it (its changes become a draft for you to approve).
- **Closed padlock:** the AI **cannot change** the note. It can still read it, unless you block reading too.

In the **Notes** tab there is a general padlock, which allows or blocks AI writing on **all** notes at once. Folders pass the rule on to whatever is inside them.

## Good practices

- Keep the padlock closed on what is only yours (personal drafts, ideas you do not want the AI to touch).
- Keep it open on what you want the AI to help organize.
- Notes do not go into the exported book.

For a tour of the app, go back to [Start here](/notes/comece-por-aqui.md); the whole guide is in the [Complete user manual](/notes/manual-completo.md).
`,
    },
    fullTitle: 'Complete user manual',
  },
};

/** Frontmatter de um arquivo editável. */
function front(title, extra = '') {
  return `---\nhumanRead: true\nhumanWrite: true\naiRead: true\naiWrite: true\nuserDelete: true\nadvanced: false\ntitle: ${JSON.stringify(title)}\n${extra}---\n\n`;
}

/** Bloco `data` de uma ficha (título e demais campos vazios). */
function data(fields) {
  const lines = ['data:'];
  for (const [id, f] of Object.entries(fields)) {
    lines.push(`  ${id}:`, `    placeholder: ${JSON.stringify(f.placeholder)}`);
    if (f.type) lines.push(`    type: ${f.type}`);
    lines.push(`    required: ${f.required ? 'true' : 'false'}`, `    content: ${JSON.stringify(f.content || '')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Gera o manual de um idioma. */
function build(lang) {
  const cfg = LANGS[lang];
  const T = TEXTS[lang];
  const out = cfg.out;

  const write = (rel, text) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
  };

  // 1. Parte do modelo de livro
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(cfg.base, out, { recursive: true });
  fs.rmSync(path.join(out, '.system'), { recursive: true, force: true });

  write(
    'config.json',
    `${JSON.stringify({ book_title: T.bookTitle, explorer_state: { open_file: 'notes/comece-por-aqui.md', open_folders: [], advanced_mode: false }, ai_mode: 'assistant' }, null, 2)}\n`,
  );

  // 2. Sinopse
  const p = T.plot;
  write(
    'content/plot.md',
    `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: ${p.title}

data:
  book_title:
    placeholder: ${JSON.stringify(p.bookTitlePh)}
    required: true
    content: ${JSON.stringify(T.bookTitle)}
  ai_mode:
    placeholder: ${JSON.stringify(p.aiModePh)}
    required: true
    type: select
    options:
      - { value: assistant, label: ${JSON.stringify(p.options[0])} }
      - { value: coauthor, label: ${JSON.stringify(p.options[1])} }
      - { value: autonomous, label: ${JSON.stringify(p.options[2])} }
    content: "assistant"
  genres:
    placeholder: ${JSON.stringify(p.genresPh)}
    required: false
    content: ${JSON.stringify(p.genre)}
---

${p.body}`,
  );

  // 3. Capítulo
  write(
    'content/index.md',
    `---
humanRead: true
humanWrite: false
aiRead: true
aiWrite: false
userDelete: false
advanced: true
title: ${JSON.stringify(T.indexTitle)}
---

# INDEX.MD

- [${T.chapterLink}](content/chapter_001/2_draft.md)
`,
  );
  for (const [file, key] of [['1_outline.md', 'outline'], ['2_draft.md', 'draft'], ['3_analysis.md', 'analysis']]) {
    write(
      `content/chapter_001/${file}`,
      `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: ${JSON.stringify(T[key].title)}
---

${T[key].body}`,
    );
  }

  // 4. Mundo: uma ficha de exemplo em cada categoria
  for (const [category, ex] of Object.entries(T.examples)) {
    write(`assets/${category}/${ex.file}`, `${front(ex.title, data(ex.fields))}${ex.body}`);
  }

  // Linha do tempo (índice dos eventos) e índices das outras categorias
  write(
    'assets/events/timeline.md',
    `---
humanRead: true
humanWrite: false
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: ${JSON.stringify(T.timeline.title)}
---

${T.timeline.body}`,
  );
  for (const [category, [title, heading, link]] of Object.entries(T.indexTitles)) {
    write(
      `assets/${category}/index.md`,
      `---\nhumanRead: true\nhumanWrite: false\naiRead: true\naiWrite: false\nuserDelete: false\nadvanced: true\ntitle: ${JSON.stringify(title)}\n---\n\n# ${heading}\n\n- [${link}](assets/${category}/${T.examples[category].file})\n`,
    );
  }

  // 5. Anotações
  write(
    'notes/o-que-sao-anotacoes.md',
    `---
humanRead: true
humanWrite: true
aiRead: true
advanced: false
title: ${JSON.stringify(T.notes.title)}
---

${T.notes.body}`,
  );

  // Boas-vindas (fonte em scripts/manual-src)
  write('notes/comece-por-aqui.md', fs.readFileSync(cfg.welcome, 'utf8'));

  // Manual completo (copiado do guia do usuário do idioma)
  let guide = fs.readFileSync(cfg.guide, 'utf8').replace(/\r\n/g, '\n').trim();
  // Links para outros documentos do repositório (ai-tools.md, project.md...) não existem no livro: ficam só o texto
  guide = guide.replace(/\[([^\]]+)\]\((?!app:|#|https?:)[^)\s]*\.md[^)]*\)/g, '$1');
  write(
    'notes/manual-completo.md',
    `---
humanRead: true
humanWrite: true
aiRead: true
advanced: false
title: ${JSON.stringify(T.fullTitle)}
---

${guide}
`,
  );

  console.log(`✅ ${T.done} ${path.relative(root, out)}`);
}

const arg = process.argv[2];
if (arg && !LANGS[arg]) {
  console.error(`Idioma inválido: ${arg} (use pt ou en)`);
  process.exit(1);
}
for (const lang of arg ? [arg] : Object.keys(LANGS)) build(lang);
