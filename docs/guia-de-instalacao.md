# Guia de Instalação e Release — Astra Writer

Como gerar o instalador (com assistente) e a versão portátil do Windows, auditar o pacote e publicar no GitHub.

## 1. Gerar o instalador e a versão portátil

Feche o app (dev ou instalado) e, na raiz do projeto:

```bash
npm run release
```

O comando (ver `scripts/release.js`):

1. regenera o livro padrão **Manual de Uso** a partir do `docs/guia-do-usuario.md` (`scripts/build-manual.js`);
2. empacota o app com o Electron Forge e gera a **versão portátil** (um `.zip`) e o pacote de atualização do instalador antigo
   da 1.0.0 (`.nupkg` e `RELEASES`);
3. **audita o pacote** (`scripts/audit-package.js`): procura chaves de API, livros, dados de teste e caminhos do seu computador.
   Se achar algo, o comando falha e nada é copiado;
4. gera, com o electron-builder, o **instalador com assistente** (NSIS): o usuário escolhe a **pasta de instalação** e se quer atalhos
   na **Área de Trabalho** e no **Menu Iniciar**; junto saem `latest.yml` e o `.blockmap` da atualização automática;
5. copia tudo para a pasta `release/`.

Arquivos gerados em `release/`:

| Arquivo | Para quê |
| --- | --- |
| `AstraWriter-Setup-<versão>.exe` | Instalador com assistente (pasta, atalhos; instala para o usuário atual, sem administrador; cria o desinstalador) |
| `AstraWriter-portable-<versão>-win-x64.zip` | Versão portátil: descompacte em qualquer pasta e execute `Astra Writer.exe` |
| `latest.yml` e `AstraWriter-Setup-<versão>.exe.blockmap` | Atualização automática do app instalado pelo assistente (precisam estar na release) |
| `AstraWriter-<versão>-full.nupkg` e `RELEASES` | Atualização automática de quem instalou a **1.0.0** pelo instalador antigo (Squirrel) |

> A versão portátil **não se atualiza sozinha** e, como a instalada, guarda os livros em `Documentos\Astra Writer\books` e as
> configurações em `%APPDATA%\Astra Writer`.

## 2. O que garante que nada seu vai junto

- O pacote leva só o resultado do build, as dependências de produção e a pasta `templates` (modelos de livro, perfis de template e o
  Manual de Uso). Nunca leva `books/`, `.system`, `debug.log` nem a sua pasta de configurações.
- Suas chaves de API ficam em `%APPDATA%\draftweaver-v2` (desenvolvimento). O app instalado usa **outra** pasta, `%APPDATA%\Astra Writer`,
  que nasce vazia em cada computador: ele nunca enxerga as suas chaves.
- Os livros do app instalado ficam em `Documentos\Astra Writer\books`; os de desenvolvimento, na pasta `books/` do projeto.
- `scripts/audit-package.js` confere isso a cada release.

## 3. Primeira abertura

Ao abrir pela primeira vez, o app instala o livro **Manual de Uso** (uma única vez por usuário; se for apagado, não volta).

## 4. Testar numa máquina limpa

1. Copie `AstraWriter-Setup-<versão>.exe` para outro computador (ou uma conta de usuário nova do Windows) e execute. O Windows pode
   mostrar o aviso do **SmartScreen** ("Windows protegeu o computador"): ele aparece em todo instalador **sem assinatura de código**
   baixado da internet (o arquivo carrega a marca "veio da internet"); não há como evitá-lo sem um certificado pago. Clique em
   **Mais informações → Executar assim mesmo**. (Para tirar a marca: botão direito no arquivo → Propriedades → **Desbloquear**.)
2. Confira: abre com o livro **Manual de Uso**, sem contas de IA, sem rascunhos, sem livros seus.
3. Teste também o `.zip` portátil.

## 5. Publicar no GitHub (releases)

Repositório: `https://github.com/ghsantalucia/draftweaver` (público).

**Pelo site (mais simples)**

1. Faça commit e `git push` do código.
2. Crie a tag da versão: `git tag v1.1.0` e `git push origin v1.1.0`.
3. No GitHub: **Releases → Draft a new release** → escolha a tag `v1.1.0` → título "Astra Writer 1.1.0" → descreva as novidades.
4. Arraste para a release **todos** os arquivos de `release/` (Setup, `latest.yml`, `.blockmap`, zip portátil, `.nupkg` e `RELEASES`).
5. **Publish release**. (O app só encontra atualizações em releases publicadas, não em rascunhos.)

**Pela linha de comando** (opcional): instale o GitHub CLI (`winget install GitHub.cli`), rode `gh auth login` e:

```bash
gh release create v1.1.0 release/* --title "Astra Writer 1.1.0" --notes "Novidades da versão"
```

**Próximas versões:** aumente o `version` no `package.json`, rode `npm run release` e repita. O app instalado verifica as
releases ao abrir e baixa a atualização sozinho (Central do Sistema → Atualização).


## 6. Como a atualização automática funciona

- **Instalado pelo assistente (1.1.0 em diante):** o app usa o `electron-updater`, que lê o `latest.yml` da última release publicada,
  baixa só o que mudou (`.blockmap`) e instala ao fechar o app (ou pelo botão da Central do Sistema).
- **Instalado pelo instalador antigo (1.0.0, Squirrel):** o app consulta o `update.electronjs.org`, que lê o `RELEASES` e o `.nupkg`
  da release. Esse app continua se atualizando por esse caminho.
- O app descobre sozinho qual é o seu caso. A **versão portátil** não se atualiza.
- Para testar: instale uma versão mais antiga, publique uma release com a versão maior e abra o app (a verificação roda ao abrir).
