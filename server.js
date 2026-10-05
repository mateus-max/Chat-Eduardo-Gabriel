// ============================================================
// CHAT VIRTUAL — SR. EDUARDO NGONGOYOVE GABRIEL
// Backend Cloudflare Worker + Groq
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-20b";

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const CONFIG = {
  maxHistory: 30,
  maxMessageLength: 6000,
  rateLimitPerHour: 120
};

// ============================================================
// RATE LIMIT SIMPLES
// ============================================================

const rateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  const item = rateMap.get(ip);

  if (!item || now - item.start > hour) {
    rateMap.set(ip, {
      start: now,
      count: 1
    });

    return true;
  }

  if (item.count >= CONFIG.rateLimitPerHour) {
    return false;
  }

  item.count++;

  return true;
}

// ============================================================
// RESPOSTAS
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

// ============================================================
// NORMALIZA HISTÓRICO
// ============================================================

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-CONFIG.maxHistory)
    .map(item => {
      if (!item) return null;

      // Formato novo
      if (item.role && item.content) {
        return {
          role:
            item.role === "assistant"
              ? "assistant"
              : "user",
          content: String(item.content).slice(
            0,
            CONFIG.maxMessageLength
          )
        };
      }

      // Formato antigo do frontend
      if (item.type && item.text) {
        return {
          role:
            item.type === "bot"
              ? "assistant"
              : "user",
          content: String(item.text).slice(
            0,
            CONFIG.maxMessageLength
          )
        };
      }

      return null;
    })
    .filter(Boolean);
}

// ============================================================
// LIMPAR NOME
// ============================================================

function cleanName(name) {
  if (!name) return "";

  let value = String(name)
    .replace(/\s+/g, " ")
    .trim();

  value = value.replace(
    /^(sr\.?|senhor|sra\.?|senhora)\s+/i,
    ""
  );

  value = value.replace(/[.,!?;:]+$/g, "").trim();

  if (value.length < 2) return "";

  if (value.length > 80) return "";

  return value;
}

// ============================================================
// EXTRAIR NOME DA MENSAGEM
// ============================================================

function extractNameFromText(text, previousHistory = []) {
  if (!text) return null;

  const value = String(text)
    .replace(/\s+/g, " ")
    .trim();

  // ----------------------------------------------------------
  // "Meu nome é João"
  // "Meu nome e João"
  // ----------------------------------------------------------

  let match = value.match(
    /(?:meu nome\s*(?:é|e|eh)|meu nome chama-se|meu nome chama|chamo-me|chamo)\s+(.+)/i
  );

  if (match) {
    const name = cleanName(match[1]);

    if (name) {
      return name;
    }
  }

  // ----------------------------------------------------------
  // "Sou João"
  // "Sou o João"
  // "Sou a Maria"
  // ----------------------------------------------------------

  match = value.match(
    /^sou\s+(?:o\s+|a\s+)?(.+)$/i
  );

  if (match) {
    const possible = cleanName(match[1]);

    if (
      possible &&
      possible.split(" ").length <= 5 &&
      !looksLikeServiceRequest(possible)
    ) {
      return possible;
    }
  }

  // ----------------------------------------------------------
  // "Sr. João"
  // "Senhor João"
  // "Sra. Maria"
  // "Senhora Maria"
  // ----------------------------------------------------------

  match = value.match(
    /^(?:sr\.?|senhor|sra\.?|senhora)\s+(.+)$/i
  );

  if (match) {
    const name = cleanName(match[1]);

    if (name) {
      return name;
    }
  }

  // ----------------------------------------------------------
  // Se o assistente acabou de pedir o nome e a mensagem é
  // simplesmente "João"
  // ----------------------------------------------------------

  const lastAssistant = [...previousHistory]
    .reverse()
    .find(item => item.role === "assistant");

  if (
    lastAssistant &&
    /nome|identifica|chamar|senhor|senhora/i.test(
      lastAssistant.content
    )
  ) {
    if (
      /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}$/.test(value) &&
      value.split(/\s+/).length <= 5 &&
      !looksLikeServiceRequest(value)
    ) {
      return cleanName(value);
    }
  }

  return null;
}

// ============================================================
// IDENTIFICAR PEDIDO DE SERVIÇO
// ============================================================

function looksLikeServiceRequest(text) {
  const value = String(text || "").toLowerCase();

  const words = [
    "site",
    "website",
    "plataforma",
    "software",
    "sistema",
    "tradução",
    "traducao",
    "marketing",
    "design",
    "cartaz",
    "logotipo",
    "logo",
    "curso",
    "inglês",
    "ingles",
    "música",
    "musica",
    "piano",
    "partitura",
    "namíbia",
    "namibia",
    "windhoek",
    "oshakati",
    "ongwediva",
    "ondangwa",
    "hospital",
    "consulta",
    "preço",
    "preco",
    "quanto custa",
    "valor",
    "pagamento",
    "envio",
    "encomenda",
    "pacote",
    "câmbio",
    "cambio",
    "importação",
    "importacao",
    "visto",
    "visa"
  ];

  return words.some(word =>
    value.includes(word)
  );
}

// ============================================================
// DETECTAR TRATAMENTO
// ============================================================

function detectTitle(text, history = []) {
  const allText = [
    ...history.map(x => x.content || ""),
    text || ""
  ]
    .join(" ")
    .toLowerCase();

  // Formas explícitas femininas
  if (
    /\bsra\.?\b/.test(allText) ||
    /\bsenhora\b/.test(allText) ||
    /\bsou a senhora\b/.test(allText) ||
    /\bsou uma senhora\b/.test(allText)
  ) {
    return "Sra.";
  }

  // Formas explícitas masculinas
  if (
    /\bsr\.?\b/.test(allText) ||
    /\bsenhor\b/.test(allText) ||
    /\bsou o senhor\b/.test(allText) ||
    /\bsou um senhor\b/.test(allText)
  ) {
    return "Sr.";
  }

  // Padrão definido pelo proprietário:
  // Sr. quando não houver indicação feminina.
  return "Sr.";
}

// ============================================================
// VERIFICAR SE JÁ TEM NOME
// ============================================================

function findKnownClientName(context, history, currentMessage) {
  // 1. Nome vindo diretamente pelo portal
  if (context && context.nome) {
    const name = cleanName(context.nome);

    if (name) {
      return name;
    }
  }

  // 2. Procurar nas mensagens anteriores
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];

    if (item.role !== "user") continue;

    const found = extractNameFromText(
      item.content,
      history.slice(0, i)
    );

    if (found) {
      return found;
    }
  }

  // 3. Procurar na mensagem atual
  const foundCurrent = extractNameFromText(
    currentMessage,
    history
  );

  if (foundCurrent) {
    return foundCurrent;
  }

  return "";
}

// ============================================================
// BASE DE CONHECIMENTO
// ============================================================

const KNOWLEDGE_BASE = `
IDENTIDADE DO ASSISTENTE
------------------------
O sistema é o "Chat Virtual — Eduardo Gabriel".

O proprietário é:
Sr. Eduardo Ngongoyove Gabriel.

O assistente nunca deve dizer:
- "Assistente Virtual do Eduardo"
- "Sou o assistente do Eduardo"
- "Olá Eduardo" ao cliente
- "Eduardo" sem o título Sr.

A apresentação correta é:
"Sou o Assistente Virtual do Sr. Eduardo Ngongoyove Gabriel."

Quando mencionar o proprietário, usar:
"Sr. Eduardo Ngongoyove Gabriel"
ou
"Sr. Eduardo Gabriel".

O assistente NÃO é o próprio Eduardo.
O assistente representa o atendimento virtual do Sr. Eduardo.

------------------------------------------------------------

TRATAMENTO DOS CLIENTES
------------------------------------------------------------

Todo cliente deve ser tratado formalmente.

Exemplos:

"Sr. João"
"Sra. Maria"
"Sr. António"
"Sra. Ana"

Nunca usar apenas:
"João"
"Maria"
"António"
"Ana"

Se o cliente indicar explicitamente que é senhora, usar:
"Sra. [Nome]"

Se indicar explicitamente que é senhor, usar:
"Sr. [Nome]"

Se não houver indicação explícita de género:
usar "Sr. [Nome]" como tratamento padrão.

Depois de descobrir o nome, manter esse tratamento durante toda a conversa.

------------------------------------------------------------

FLUXO OBRIGATÓRIO
------------------------------------------------------------

PRIMEIRO CONTACTO:

Antes de falar sobre preços, serviços, cursos, websites,
Namíbia, tradução ou qualquer outro assunto de atendimento,
é obrigatório obter o nome do cliente.

Perguntar de forma natural:

"Antes de continuarmos, por favor, diga-me o seu nome."

Não fazer várias perguntas nessa primeira resposta.

Se o cliente disser:

"João"

passar a tratá-lo como:

"Sr. João"

Se disser:

"Meu nome é João Manuel"

usar:

"Sr. João Manuel"

Se disser:

"Sou a senhora Maria"

usar:

"Sra. Maria"

Depois de obter o nome, continuar normalmente.

------------------------------------------------------------

REGRA DE CONVERSA
------------------------------------------------------------

O atendimento deve parecer uma conversa humana.

Não reiniciar a conversa a cada mensagem.

Não dizer "Olá" novamente em cada resposta.

Não repetir a apresentação do assistente.

Não repetir perguntas que o cliente já respondeu.

Usar o histórico da conversa.

Se o cliente mudar de assunto, acompanhar naturalmente.

Exemplo:

Cliente:
"Quero criar um site."

Assistente:
"Claro, Sr. João. Que tipo de negócio pretende apresentar no site?"

Cliente:
"É uma empresa de construção."

Assistente:
"Perfeito, Sr. João. Nesse caso podemos estruturar o site..."

Cliente:
"E quanto custa?"

Assistente:
responder sobre o preço do website, sem perguntar novamente
qual é o negócio.

------------------------------------------------------------

REGRA DE UMA PERGUNTA
------------------------------------------------------------

Quando for necessário obter informações para orçamento,
fazer apenas UMA pergunta de cada vez.

Não apresentar questionários enormes.

Exemplo incorreto:

"Qual é o tipo de site?
Quantas páginas?
Tem domínio?
Tem alojamento?
Qual é o prazo?
Qual é o orçamento?"

Exemplo correto:

"Sr. João, que tipo de website pretende criar?"

Depois da resposta:

"Perfeito, Sr. João. Que funcionalidades pretende incluir?"

E assim sucessivamente.

------------------------------------------------------------

SERVIÇOS
------------------------------------------------------------

1. CRIAÇÃO DE WEBSITES

Inclui:
- Websites institucionais
- Portfólios
- Landing pages
- Plataformas personalizadas

O preço depende do projeto.

Valores de referência existentes no sistema:

Website pequeno:
80.000 Kz

Website médio:
120.000 Kz

Website grande:
200.000 Kz

Quando não houver informação suficiente para determinar
o tamanho/projeto, não inventar um preço.

Perguntar primeiro o tipo de website e as funcionalidades.

------------------------------------------------------------

2. TECNOLOGIA & IT

Inclui:
- Soluções digitais
- Sistemas
- Organização de dados
- Suporte técnico
- Plataformas web
- Sistemas personalizados

O preço depende do projeto.

------------------------------------------------------------

3. SOFTWARE / SISTEMAS PERSONALIZADOS

Valores de referência:

Sistema pequeno:
190.000 Kz

Sistema médio:
300.000 Kz

Sistema grande:
600.000 Kz

Antes de apresentar um valor definitivo, compreender o projeto.

------------------------------------------------------------

4. TRADUÇÃO E INTERPRETAÇÃO

Português ↔ Inglês.

Inclui:
- Documentos
- Reuniões
- Comunicação empresarial
- Tradução comum
- Interpretação

Valor de referência:
10.000 Kz, conforme o serviço.

------------------------------------------------------------

5. TRADUÇÃO JURAMENTADA

Tradução oficial/juramentada.

Valor de referência:
10.000 Kz, conforme a tabela do serviço.

------------------------------------------------------------

6. MARKETING DIGITAL

Inclui:
- Presença digital
- Conteúdo
- Identidade
- Estratégias
- Gestão de redes sociais
- Campanhas

Gestão de redes sociais:
35.000 Kz/mês.

Quando o cliente quiser uma campanha ou serviço específico,
pedir os detalhes necessários antes de fechar o preço.

------------------------------------------------------------

7. DESIGN GRÁFICO

Inclui:
- Cartazes
- Flyers
- Apresentações
- Identidade visual
- Materiais digitais

Preço depende do material.

Não inventar valores quando não houver tabela específica.

------------------------------------------------------------

8. CONSULTORIA EDUCACIONAL

Inclui:
- Orientação
- Materiais educacionais
- Projetos
- Consultoria

Preço depende da consulta/serviço.

------------------------------------------------------------

9. CURSO DE INGLÊS

Curso de Inglês Britânico.

100% online.

Horários:
Segunda a sexta:
10h–11h
14h–15h
22h–23h

Quarta-feira:
Conversação.

Inclui materiais e acompanhamento.

Se perguntarem o preço e o valor não estiver disponível na
base atual, não inventar.

------------------------------------------------------------

10. CURSO DE MÚSICA

Curso de música.

Inclui formação musical, conforme a modalidade.

Preço:
10.000 Kz/mês.

Promoção inicial:
8.000 Kz no primeiro mês.

------------------------------------------------------------

11. ARMAZENAMENTO MUSICAL DNAC

Organização e armazenamento de:
- Partituras
- Coletâneas
- Música em Português
- Música em Umbundu

Possibilidade de:
- visualizar
- organizar
- pesquisar
- exportar
- trabalhar com coletâneas

Preço conforme o projeto/serviço.

------------------------------------------------------------

12. COMPOSIÇÃO & ARRANJOS

Composição e arranjos para:
- Corais
- Igrejas
- Grupos
- Educação musical

Preço depende da obra.

------------------------------------------------------------

13. ANGOLA ↔ NAMÍBIA

Serviços relacionados com Angola e Namíbia.

O preço depende do serviço solicitado.

O assistente deve primeiro descobrir qual serviço o cliente
pretende.

------------------------------------------------------------

14. PROMOÇÃO / PUBLICIDADE

Valor de referência:
2.500 Kz por dia.

Pacote semanal:
12.000 Kz.

Quando o cliente indicar quantidade de dias,
calcular o valor correspondente.

------------------------------------------------------------

15. SERVIÇOS NA NAMÍBIA

Podem incluir:
- Acompanhamento hospitalar
- Assistência em compras
- Tradução
- Interpretação
- Assistência em serviços
- Orientação

Não inventar valores que não estejam na base.

------------------------------------------------------------

COMPORTAMENTO SOBRE PREÇOS
------------------------------------------------------------

Nunca inventar preços.

Se existir preço na base:
informar o preço.

Se o preço depender do projeto:
explicar que depende do projeto e fazer uma pergunta
para obter a informação necessária.

Se não houver preço:
dizer que o valor precisa ser confirmado.

Nunca apresentar um preço como oficial se ele não estiver
na base de conhecimento.

------------------------------------------------------------

COMPORTAMENTO GERAL
------------------------------------------------------------

Responder principalmente em Português.

Pode conversar em Inglês se o cliente escrever em Inglês.

Manter linguagem profissional, educada e natural.

Não ser excessivamente robótico.

Não repetir a mesma informação desnecessariamente.

Não usar respostas gigantes quando uma resposta curta resolve.

Não criar informações sobre serviços que não estejam na base.

Não afirmar que o Sr. Eduardo está disponível quando isso
não tiver sido informado.

O assistente é um primeiro atendimento virtual.

------------------------------------------------------------

FORMATO DE ATENDIMENTO
------------------------------------------------------------

O objetivo é conduzir o cliente até:
- compreender o serviço;
- responder às dúvidas;
- obter os dados necessários;
- orientar sobre preço;
- encaminhar o pedido ao Sr. Eduardo quando necessário.

Sempre manter tratamento formal.
`;

// ============================================================
// INSTRUÇÃO DINÂMICA
// ============================================================

function buildSystemPrompt({
  clientName,
  clientTitle,
  context
}) {
  const identity =
    clientName
      ? `
CLIENTE IDENTIFICADO

Nome: ${clientName}
Tratamento obrigatório: ${clientTitle} ${clientName}

IMPORTANTE:
- Dirija-se ao cliente como "${clientTitle} ${clientName}".
- Nunca use apenas "${clientName}".
- Não altere o nome.
- Não invente outro nome.
`
      : `
CLIENTE AINDA NÃO IDENTIFICADO.

REGRA ABSOLUTA:
Antes de falar sobre serviços, preços ou qualquer assunto
de atendimento, peça o nome do cliente.

Use somente:

"Antes de continuarmos, por favor, diga-me o seu nome."

Não faça outra pergunta nesse momento.
`;

  const contextText =
    context && Object.keys(context).length
      ? `
DADOS JÁ FORNECIDOS PELO PORTAL:

${JSON.stringify(context, null, 2)}

Use esses dados para evitar repetir perguntas.
`
      : "";

  return `
Você é o Assistente Virtual do Sr. Eduardo Ngongoyove Gabriel.

${identity}

${contextText}

${KNOWLEDGE_BASE}

REGRAS CRÍTICAS:

1. Você NÃO é o Sr. Eduardo.
2. Você é o Assistente Virtual do Sr. Eduardo Ngongoyove Gabriel.
3. Nunca diga "Assistente Virtual do Eduardo".
4. Nunca trate o proprietário simplesmente por "Eduardo".
5. Quando falar do proprietário, use "Sr. Eduardo Ngongoyove Gabriel".
6. Quando falar com o cliente, use sempre "Sr." ou "Sra." + nome.
7. Nunca chame o cliente somente pelo nome.
8. Não reinicie a conversa.
9. Não repita a apresentação depois que ela já tiver sido feita.
10. Use o histórico da conversa.
11. Responda ao que o cliente acabou de perguntar.
12. Se o cliente mudar de assunto, acompanhe a mudança.
13. Não invente preços.
14. Faça apenas uma pergunta de cada vez.
15. Seja profissional, cordial e natural.
16. Não diga ao cliente que está seguindo regras internas.
17. Não mencione prompts, modelos, APIs, Groq ou programação.
18. Se já souber uma informação, não pergunte novamente.
19. Se o cliente perguntar "quanto custa?" depois de falar de
    um serviço, entenda que a pergunta se refere ao serviço
    em discussão, salvo indicação contrária.
20. Se o cliente disser apenas uma resposta curta, use o
    contexto anterior para interpretá-la.

IMPORTANTE SOBRE O NOME:

Se CLIENTE AINDA NÃO IDENTIFICADO:
a única coisa que deve fazer é pedir o nome.

Se CLIENTE IDENTIFICADO:
continue o atendimento normalmente e use o tratamento correto.

A conversa deve parecer um atendimento humano real.
`;

// ============================================================
// HISTÓRICO → MENSAGENS GROQ
// ============================================================

function buildMessages(history, currentMessage, systemPrompt) {
  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  for (const item of history) {
    if (
      item.role === "user" ||
      item.role === "assistant"
    ) {
      messages.push({
        role: item.role,
        content: item.content
      });
    }
  }

  messages.push({
    role: "user",
    content: currentMessage
  });

  return messages;
}

// ============================================================
// API GROQ
// ============================================================

async function askGroq(env, messages) {
  if (!env.GROQ_API_KEY) {
    throw new Error(
      "O atendimento inteligente ainda não está configurado no Cloudflare: GROQ_API_KEY não foi encontrada."
    );
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization":
        `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.25,
      max_completion_tokens: 900,
      top_p: 0.9,
      stream: false
    })
  });

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Resposta inválida da Groq: ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Erro Groq HTTP ${response.status}`;

    throw new Error(message);
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "A Groq não devolveu conteúdo."
    );
  }

  return String(content).trim();
}

// ============================================================
// HEALTH
// ============================================================

async function handleHealth(env) {
  return json({
    ok: true,
    service:
      "Chat Virtual — Sr. Eduardo Ngongoyove Gabriel",
    provider: "Groq",
    model: MODEL,
    groqConfigured:
      Boolean(
        env.GROQ_API_KEY &&
        String(env.GROQ_API_KEY).trim()
      ),
    time:
      new Date().toISOString()
  });
}

// ============================================================
// CHAT
// ============================================================

async function handleChat(request, env) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return json(
      {
        ok: false,
        error:
          "Limite temporário de mensagens atingido. Tente novamente mais tarde."
      },
      429
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Pedido inválido."
      },
      400
    );
  }

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (!message) {
    return json(
      {
        ok: false,
        error: "Escreva uma mensagem."
      },
      400
    );
  }

  if (
    message.length >
    CONFIG.maxMessageLength
  ) {
    return json(
      {
        ok: false,
        error:
          "A mensagem é demasiado longa."
      },
      400
    );
  }

  const context =
    body.context &&
    typeof body.context === "object"
      ? body.context
      : {};

  const history =
    normalizeHistory(body.history);

  // ----------------------------------------------------------
  // IDENTIFICAR CLIENTE
  // ----------------------------------------------------------

  const clientName =
    findKnownClientName(
      context,
      history,
      message
    );

  const clientTitle =
    detectTitle(
      message,
      history
    );

  // ----------------------------------------------------------
  // SE AINDA NÃO TEM NOME:
  // NÃO DEIXAR O MODELO COMEÇAR O ATENDIMENTO
  // ----------------------------------------------------------

  if (!clientName) {
    const alreadyAskedName =
      history.some(item =>
        item.role === "assistant" &&
        /diga-me o seu nome|qual é o seu nome|qual e o seu nome|seu nome/i.test(
          item.content
        )
      );

    if (!alreadyAskedName) {
      return json({
        ok: true,
        reply:
          "Antes de continuarmos, por favor, diga-me o seu nome.",
        clientName: null,
        clientTitle: null,
        identified: false
      });
    }

    // Se já pediu o nome e a pessoa ainda não informou
    // explicitamente, continuar pedindo sem entrar no serviço.
    return json({
      ok: true,
      reply:
        "Para continuarmos, por favor, diga-me o seu nome.",
      clientName: null,
      clientTitle: null,
      identified: false
    });
  }

  // ----------------------------------------------------------
  // CLIENTE IDENTIFICADO
  // ----------------------------------------------------------

  const effectiveTitle =
    clientTitle || "Sr.";

  const formalName =
    `${effectiveTitle} ${clientName}`;

  // ----------------------------------------------------------
  // SYSTEM PROMPT
  // ----------------------------------------------------------

  const systemPrompt =
    buildSystemPrompt({
      clientName,
      clientTitle: effectiveTitle,
      context
    });

  // ----------------------------------------------------------
  // CONVERSA
  // ----------------------------------------------------------

  const messages =
    buildMessages(
      history,
      message,
      systemPrompt
    );

  // ----------------------------------------------------------
  // GROQ
  // ----------------------------------------------------------

  let reply;

  try {
    reply = await askGroq(
      env,
      messages
    );
  } catch (error) {
    console.error(
      "Erro Groq:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Não foi possível processar a mensagem neste momento.",
        details:
          error?.message || "Erro desconhecido"
      },
      502
    );
  }

  // ----------------------------------------------------------
  // SEGURANÇA DO TRATAMENTO
  // ----------------------------------------------------------

  // Se o modelo tentar chamar o cliente apenas pelo nome,
  // reforçamos o tratamento no início da resposta.
  //
  // Não fazemos substituição cega em todo o texto porque
  // poderia alterar nomes de empresas, documentos etc.

  const lowerReply =
    reply.toLowerCase();

  const lowerName =
    clientName.toLowerCase();

  const startsWithBareName =
    lowerReply.startsWith(
      lowerName + ","
    ) ||
    lowerReply.startsWith(
      lowerName + " "
    ) ||
    lowerReply === lowerName;

  if (startsWithBareName) {
    reply =
      `${formalName}, ${reply.slice(clientName.length).trim()}`;
  }

  // ----------------------------------------------------------
  // RESPOSTA
  // ----------------------------------------------------------

  return json({
    ok: true,
    reply,
    clientName,
    clientTitle: effectiveTitle,
    formalName,
    identified: true
  });
}

// ============================================================
// WORKER
// ============================================================

async function fetchHandler(request) {
    // No formato Service Worker do Cloudflare, os bindings
    // (Secrets, Vars e Assets) ficam disponíveis como globais.
    // Construímos um objeto "env" compatível com o restante do código.
    const env = {
      GROQ_API_KEY:
        (typeof globalThis.GROQ_API_KEY === "string" &&
         globalThis.GROQ_API_KEY.trim())
          ? globalThis.GROQ_API_KEY.trim()
          : (typeof process !== "undefined" &&
             process.env &&
             typeof process.env.GROQ_API_KEY === "string" &&
             process.env.GROQ_API_KEY.trim())
              ? process.env.GROQ_API_KEY.trim()
              : undefined,
      ASSETS:
        globalThis.ASSETS || undefined
    };
    const url =
      new URL(request.url);

    // --------------------------------------------------------
    // OPTIONS / CORS
    // --------------------------------------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type",
          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS"
        }
      });
    }

    // --------------------------------------------------------
    // HEALTH
    // --------------------------------------------------------

    if (
      url.pathname === "/health" &&
      request.method === "GET"
    ) {
      return handleHealth(env);
    }

    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

    if (
      url.pathname === "/api/chat" &&
      request.method === "POST"
    ) {
      return handleChat(
        request,
        env
      );
    }

    // --------------------------------------------------------
    // ASSETS
    // --------------------------------------------------------

    if (env.ASSETS) {
      return env.ASSETS.fetch(
        request
      );
    }

    return new Response(
      "Chat Virtual — Sr. Eduardo Ngongoyove Gabriel",
      {
        status: 404,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }

addEventListener("fetch", (event) => {
  event.respondWith(fetchHandler(event.request));
});
