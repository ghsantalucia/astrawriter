# Checklist de Funcionalidades

## Modal

[ ] o modal abre corretamente com os dados
[ ] os botões de fechar funcionam
[ ] os botões personalizados funcionam
[ ] a pilha de modais funciona

## Sidebar

[ ] a lista de livros carrega corretamente ao inicializar
[ ] a lista de livros atualiza automaticamente os títulos
[ ] a lista de livros atualiza automaticamente exclusões e adições
[ ] a mudança de projeto pela lista de livros funciona

## Explorer

[ ] ao inicializar a árvore do último projeto aberto é renderizada
[ ] a árvore de arquivos foi renderizada corretamente
[ ] a navegação por tabs funciona corretamente
[ ] a árvore de arquivos atualiza corretamente ao mudar de livro/projeto
[ ] pastas abrem e fecham corretamente
[ ] ocultar e exibir arquivos e pastas avançados funciona
[ ] apenas arquivos permitidos são exibidos
[ ] o nome dos arquivos .temp tem prioridade sobre o .md
[ ] na inicialização arquivos .temp possuem um (asterisk) no título
[ ] novos arquivos .temp adicionam (asterisk) aos respectivos arquivos automaticamente
[ ] após sincronização de arquivos .temp remove (*) dos respectivos arquivos
[ ] adição de arquivos temp são atualizados em tempo real
[ ] remoção de arquivos temp são atualizados em tempo real
[ ] estilos de arquivo visível, avançado e somente leitura estão aplicadas
[ ] ao abrir um arquivo a árvore sempre altera de tab, abre as pastas e seleciona o arquivo respectivo automaticamente

## Chat

[ ] drawer do chat abre e fecha
[ ] animação de fundo estrelado parallax funciona
[ ] focus automático na textarea funciona
[ ] especificações de redimensionamento da textarea funciona
[ ] o usuário consegue postar mensagens
[ ] o usuário consegue receber mensagens
[ ] o histórico é salvo corretamente
[ ] o histórico é restaurado para cada projeto na inicialização
[ ] o histórico é restaurado na mudança de projeto
[ ] IA mockada responde com mensagens aleatórias que simulam uma conversa, mas salva nos logs

## Settings

[ ] a drawer de settings abre e fecha corretamente
[ ] o overlay é exibido e omitido juntamente com a drawer
[ ] o switch reflete o status do tema inicial (dark|light)
[ ] o switch alterna corretamente entre os temas

## Editor

[ ] o editor (toastui) é inicializado corretamente
[ ] o tema é aplicado ao editor na inicialização
[ ] o tema é aplicado na alteração de tema global
[ ] ao selecionar um arquivo ele abre no editor
[ ] o arquivo .temp tem prioridade sobre o .md
[ ] links com caminhos relativos redirecionam para os respectivos arquivos
[ ] após edição de um arquivo ele é automaticamente salvo em um arquivo .temp

## Editor Overlay

[ ] na inicialização ou em troca de projetos se um projeto estiver bloqueado pela IA bloqueia o editor e ativa o overlay
[ ] quando um projeto aberto é bloqueado, ativa o bloqueio em tempo real
[ ] quando um projeto aberto é desbloqueado, desativa o bloqueio em tempo real
[ ] quando não há arquivo selecionado, ativa o overlay
[ ] quando há mais de 1 overlay do editor, gerencia a pilha corretamente

## Toolbar

[ ] inicia com campo de status sempre oculto
[ ] oculta campo de status ao mudar entre arquivos
[ ] emite status pendente enquanto usuário digita
[ ] emite status salvando quando executa salvamento
[ ] emite status salvo quando arquivo .temp foi criado ou atualizado
[ ] ativa botão de sincronizar se houver ao menos 1 arquivo .temp a ser sincronizado no projeto atual
[ ] desativa botão de sincronizar quando não há arquivos .temp no projeto atual
[ ] botão de sincronizar possui animação funcionando

# Toast

[ ] exibe corretamente as mensagens e aparência desejada

## Pesquisa, tags e correção

[ ] a pesquisa ignora maiúsculas, acentos, pontuação e artigos/conjunções ("vira lata" acha "vira-lata")
[ ] a mensagem "Sem resultados" aparece logo abaixo da barra de pesquisa
[ ] `#tag` pesquisa por tags e mostra a tag no lugar do trecho
[ ] vírgula/Enter transformam o texto em tag; "#" digitado é removido; letras viram minúsculas
[ ] as sugestões de tags aparecem sobre a caixa (sem rolagem), com setas e Enter
[ ] a mesma tag tem sempre a mesma cor, nos temas claro e escuro
[ ] alterar o nome nas variáveis atualiza explorer e guia
[ ] a guia do arquivo mostra o (asterisk) quando há rascunho e o caminho real no tooltip
[ ] o switch de correção liga/desliga sublinhado e contador do rodapé
[ ] clicar em "problemas de escrita" percorre palavras desconhecidas e repetidas em ordem
[ ] o botão "Salvar dados" é legível nos dois temas
[ ] o sublinhado de ortografia é o próprio (o do Windows não aparece) e o menu oferece sugestões, ignorar e adicionar ao dicionário
[ ] nomes e apelidos das fichas do livro nunca são marcados como erro; textos linkados também não
[ ] toda dica (title) aparece estilizada após um pequeno atraso
[ ] pastas do usuário têm "Novo item"/"Nova anotação" e o arquivo nasce dentro da pasta
[ ] criar um livro abre a Sinopse no editor
[ ] o plano de fundo do chat muda por tema (estrelas, nebulosa, órbitas, cor sólida) e guarda a cor escolhida
[ ] as setas destacam itens do explorer como o hover, sem selecionar; ← → escolhem as opções; Enter abre/fecha pasta, abre arquivo ou aciona a opção
[ ] ↓ no último item destaca o Assistente e Enter o abre com o foco no campo de texto
[ ] a gaveta do chat fechada acende em azul ao passar o mouse (tema escuro)
[ ] o botão Exportar só fica ativo com um arquivo aberto e o menu oferece Markdown, Word e PDF
[ ] a exportação pergunta onde salvar e gera .md, .docx e .pdf com o texto atual do editor
[ ] clicar numa tag do cabeçalho da caixa de dados pesquisa por ela e não abre/fecha a caixa
[ ] vírgula separa termos na pesquisa e o resultado traz arquivos que casam com qualquer um
[ ] na pesquisa com vírgulas, os resultados ficam por quantidade de termos, depois pela ordem dos termos e por último em ordem alfabética
[ ] o botão de pastas da mini toolbar abre todas as pastas da aba e, se já estiverem abertas, fecha todas
[ ] "Limpar log" do log de erros da IA pede confirmação antes de apagar
[ ] nenhum overlay (modais e gaveta de configurações) cobre a barra de título da janela
[ ] o app compila e inicia (`npm start`) com todo o código em TypeScript e `npm run typecheck` passa
[ ] permissões não definidas no arquivo vêm da pasta-mãe, avó... até a raiz; o cadeado de Anotações muda todas as anotações
[ ] a gaveta de configurações cobre a barra de título, tem a largura da sidebar e o cabeçalho fixo
[ ] botões coloridos têm texto branco no tema claro e escuro-profundo no escuro (inclusive na revisão da IA)
[ ] a caneta da guia foca o campo do nome; Esc no chat devolve as setas ao explorer
[ ] a Central de Revisões abre pelo rodapé e pelas Configurações; o botão fica verde, amarelo ou vermelho conforme as pendências
[ ] corrigir, dispensar, dispensar tipo, adicionar ao dicionário e "ir para o trecho" funcionam; tipos dispensados voltam pela página inicial
[ ] criar ficha/anotação/evento/capítulo gera `.md.temp`; sincronizar converte em oficial; descartar remove o arquivo e o link do índice
[ ] a linha do tempo sugere a ordem, detecta ciclo e só é escrita pela central (aprovação) ou pela IA
[ ] a análise da IA mostra estimativa, cria digests em `.system/digests/` e registra contradições
[ ] várias contas de IA com apelido; seletor das Configurações sincronizado com a Central de IA; chave só na central
[ ] Central do Livro: renomear, modo da IA, changelog e exclusão; Central de IA: fallback, uso, depuração, log de erros e skills

