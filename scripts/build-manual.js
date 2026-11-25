/**
 * @file scripts/build-manual.js
 * @description Gera o livro padrão "Manual de Uso" em `templates/manual/`. Ele é instalado na pasta de livros do usuário
 * na primeira abertura do app (ver `src/main/first-run.ts`). O livro parte do modelo de livro (`templates/book`) e ganha:
 * uma anotação sobre anotações, um capítulo cujos três arquivos explicam o propósito de cada um, uma ficha de exemplo em cada
 * categoria do Mundo e, nas anotações, o manual completo (copiado de `docs/guia-do-usuario.md`).
 * Uso: node scripts/build-manual.js   (roda sozinho no `npm run release`)
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const base = path.join(root, 'templates', 'book');
const out = path.join(root, 'templates', 'manual');

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

function write(rel, text) {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}

// 1. Parte do modelo de livro
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(base, out, { recursive: true });
fs.rmSync(path.join(out, '.system'), { recursive: true, force: true });

write(
  'config.json',
  `${JSON.stringify({ book_title: 'Manual de Uso', explorer_state: { open_file: 'notes/comece-por-aqui.md', open_folders: [], advanced_mode: false }, ai_mode: 'assistant' }, null, 2)}\n`,
);

// 2. Sinopse
write(
  'content/plot.md',
  `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: Sinopse

data:
  book_title:
    placeholder: "Título do Livro"
    required: true
    content: "Manual de Uso"
  ai_mode:
    placeholder: "Modo da IA"
    required: true
    type: select
    options:
      - { value: assistant, label: "Assistente de escrita: você escreve e a IA ajuda quando pedida" }
      - { value: coauthor, label: "Co-autor: a IA propõe e escreve junto com você, passo a passo" }
      - { value: autonomous, label: "Autônomo: a IA escreve a partir de um briefing seu" }
    content: "assistant"
  genres:
    placeholder: "Gêneros literários"
    required: false
    content: "Manual"
---

# SINOPSE

## Resumo da ideia central

Este livro é o **Manual de Uso** do Astra Writer: cada arquivo dele explica o que aquele tipo de arquivo é e para que serve. Explore o explorer (a barra da esquerda) abrindo os arquivos em qualquer ordem.

> A **Sinopse** é a "alma" do livro. Ela é o primeiro arquivo que a IA lê: é aqui que você resume a ideia central, o objetivo final e o tom de escrita da sua história. Quanto melhor a sinopse, mais a IA (e a Central de Revisões) entendem o que o seu livro quer ser.

## Objetivo final

> Aqui você descreve para onde a história caminha. A IA compara os capítulos com este objetivo para avisar se algo está fugindo do rumo.

## Tom de escrita

> Narrador, tempo verbal, clima da história. A IA usa isto para escrever e revisar no seu estilo.

Os campos que aparecem acima do texto (clique em **Dados do arquivo**) são o título do livro, o **modo da IA** (assistente, co-autor ou autônomo; dá para mudar também na [Central do Livro](app:central/book/data)) e os gêneros. Quando terminar de explorar, crie o seu livro em **Novo livro** (no seletor de livros, no topo da barra lateral) e apague este, se quiser.
`,
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
title: "Índice de Capítulos"
---

# INDEX.MD

- [Capítulo 01](content/chapter_001/2_draft.md)
`,
);
write(
  'content/chapter_001/1_outline.md',
  `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: "Esboço"
---

# ESBOÇO - CAPÍTULO

O **Esboço** é o plano do capítulo, escrito *antes* do texto. Use-o para organizar o que vai acontecer: a lista de cenas, o objetivo do capítulo, quem aparece e o que muda para os personagens.

- A IA lê o esboço para escrever o capítulo (se você pedir) e para conferir se o texto seguiu o plano. Para conectar uma IA, vá para a [Central de IA](app:central/ai/model).
- Ao criar um capítulo você pode já deixar um planejamento inicial (um brainstorm, a lista de cenas).
- Pode ser tão detalhado ou tão solto quanto você quiser: é só para você e para a IA.
`,
);
write(
  'content/chapter_001/2_draft.md',
  `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: "Manuscrito"
---

# CAPÍTULO

O **Manuscrito** é o texto do capítulo: a história propriamente dita. É o que sai no livro quando você exporta (Markdown, Word ou PDF).

- Tudo o que você escreve aqui vira **rascunho** (o asterisco ao lado do nome) até você apertar **Sincronizar**, que confirma o texto e guarda uma versão no histórico.
- Dá para ligar o texto às fichas do mundo (personagens, lugares...) com o botão de **link** da barra do editor, e o botão **Auto-link** cria os links sozinho.
- O **Histórico** do arquivo (botão na barra de cima) guarda as versões anteriores, para você voltar atrás quando quiser; o registro de tudo o que mudou no livro fica no [changelog](app:central/book/changelog).
- Erros de digitação e de gramática aparecem sublinhados; a [Central de Revisões](app:central/issues/spelling) lista todos.
- Quando a IA escreve aqui, o que ela faz também vira rascunho: você compara lado a lado e decide o que fica.
`,
);
write(
  'content/chapter_001/3_analysis.md',
  `---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: "Análise"
---

# ANÁLISE DO CAPÍTULO

A **Análise** vem *depois* que o capítulo está escrito. Ela guarda o que se aprendeu com o texto: se o capítulo avançou o enredo, como os personagens evoluíram, como o capítulo termina (os ganchos para o próximo) e o planejamento dos capítulos seguintes.

- Também guarda as **pistas e o foreshadowing**: o que foi plantado e ainda precisa ser colhido mais adiante.
- A IA pode preencher e atualizar este arquivo para você, comparando o capítulo com a [Sinopse](/content/plot.md). Quanto ela pode analisar sozinha depende do [perfil de uso da IA](app:central/ai/analysis).
- É uma ferramenta de planejamento: não entra no livro exportado.
`,
);

// 4. Mundo: uma ficha de exemplo em cada categoria
const examples = {
  characters: {
    file: 'sobre-personagens.md',
    title: 'Sobre personagens',
    heading: 'PERSONAGENS',
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
    heading: 'AMBIENTES',
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
    heading: 'CONCEITOS',
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
    heading: 'EVENTOS',
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
};

for (const [category, ex] of Object.entries(examples)) {
  write(
    `assets/${category}/${ex.file}`,
    `${front(ex.title, data(ex.fields))}${ex.body}`.replace('---\n\n# ', '---\n\n# '),
  );
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
title: "Linha do Tempo"
---

# LINHA DO TEMPO

> Gerada a partir das fichas de eventos. Não é editável pelo autor: quem a preenche é o sistema ou a IA.

## Sem data conhecida

> Eventos sem momento e sem relação de ordem com outros eventos. Informe o momento ou ligue-os a outros eventos ("antes" e "depois") para que entrem na ordem.

1. [Sobre eventos](/assets/events/sobre-eventos.md)
`,
);
const indexTitles = { characters: ['Índice de Personagens', 'PERSONAGENS', 'Sobre personagens'], places: ['Índice de Ambientes', 'AMBIENTES', 'Sobre ambientes'], elements: ['Índice de Conceitos', 'CONCEITOS', 'Sobre conceitos'] };
for (const [category, [title, heading, link]] of Object.entries(indexTitles)) {
  write(
    `assets/${category}/index.md`,
    `---\nhumanRead: true\nhumanWrite: false\naiRead: true\naiWrite: false\nuserDelete: false\nadvanced: true\ntitle: ${JSON.stringify(title)}\n---\n\n# ${heading}\n\n- [${link}](assets/${category}/${examples[category].file})\n`,
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
title: "O que são anotações"
---

# O que são anotações

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
);

// Boas-vindas (fonte em scripts/manual-src/comece-por-aqui.md)
write('notes/comece-por-aqui.md', fs.readFileSync(path.join(__dirname, 'manual-src', 'comece-por-aqui.md'), 'utf8'));

// Manual completo (copiado de docs/guia-do-usuario.md)
let guide = fs.readFileSync(path.join(root, 'docs', 'guia-do-usuario.md'), 'utf8').replace(/\r\n/g, '\n').trim();
// Links para outros documentos do repositório (ai-tools.md, project.md...) não existem no livro: ficam só o texto
guide = guide.replace(/\[([^\]]+)\]\((?!app:|#|https?:)[^)\s]*\.md[^)]*\)/g, '$1');
write(
  'notes/manual-completo.md',
  `---
humanRead: true
humanWrite: true
aiRead: true
advanced: false
title: "Manual completo do usuário"
---

${guide}
`,
);

console.log(`✅ Manual de Uso gerado em ${path.relative(root, out)}`);
