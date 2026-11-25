/**
 * @file scripts/test-puter.js
 * @description Teste de diagnóstico do Puter (nada é gravado e o token não sai do seu computador): tenta uma pergunta curta
 * pelos dois caminhos, o que o Astra usa hoje (API compatível com a OpenAI) e a biblioteca oficial `puter.js`, e mostra o
 * resultado de cada um.
 *
 * Uso (PowerShell), na raiz do projeto:
 *   npm i --no-save @heyputer/puter.js
 *   $env:PUTER_TOKEN="cole-o-token-aqui"; node scripts/test-puter.js
 * Modelo opcional: $env:PUTER_MODEL="gpt-5-nano"
 */

const token = process.env.PUTER_TOKEN;
const model = process.env.PUTER_MODEL || 'gpt-5-nano';
if (!token) {
  console.error('Defina o token antes: $env:PUTER_TOKEN="..." ; node scripts/test-puter.js');
  process.exit(1);
}

async function viaRest() {
  console.log(`\n1) API compatível com a OpenAI (o que o Astra usa hoje), modelo ${model}`);
  const res = await fetch('https://api.puter.com/puterai/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responda só: ok' }] }),
  });
  const text = await res.text();
  console.log(`   HTTP ${res.status}: ${text.slice(0, 300)}`);
}

async function viaLib() {
  console.log(`\n2) Biblioteca oficial puter.js (Node), modelo ${model}`);
  let init;
  try {
    ({ init } = require('@heyputer/puter.js/src/init.cjs'));
  } catch (error) {
    console.log(`   Biblioteca não instalada (${error.message.split('\n')[0]}). Rode: npm i --no-save @heyputer/puter.js`);
    return;
  }
  const puter = init(token);
  try {
    const answer = await puter.ai.chat('Responda só: ok', { model });
    console.log('   Resposta:', JSON.stringify(answer).slice(0, 300));
  } catch (error) {
    console.log('   Erro:', JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 400));
  }
  try {
    const answer = await puter.ai.chat('Responda só: ok');
    console.log('   Sem escolher modelo:', JSON.stringify(answer).slice(0, 300));
  } catch (error) {
    console.log('   Sem escolher modelo, erro:', JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 400));
  }
}

(async () => {
  await viaRest().catch((e) => console.log('   Falha de rede:', e.message));
  await viaLib().catch((e) => console.log('   Falha:', e.message));
})();
