// ============================================================
// CHAT VIRTUAL — SR. EDUARDO NGONGOYOVE GABRIEL
// Backend Cloudflare Worker + Groq
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-20b";



// ============================================================
// WEB PUSH — NOTIFICAÇÕES DO PAINEL ADMINISTRATIVO
// ============================================================

const VAPID_SUBJECT =
  "mailto:admin@eduardongabriel354.workers.dev";

function bytesToBase64Url(bytes) {
  let binary = "";
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createVapidConfig(env) {
  if (!env.CONVERSATIONS) return null;

  const existing = await env.CONVERSATIONS.get("system:vapid", "json");
  if (
    existing &&
    typeof existing.publicKey === "string" &&
    typeof existing.privateKey === "string" &&
    existing.publicKey.trim() &&
    existing.privateKey.trim()
  ) {
    return {
      publicKey: existing.publicKey.trim(),
      privateKey: existing.privateKey.trim(),
      subject: VAPID_SUBJECT
    };
  }

  const pair = await crypto.subtle.generateKey(
    {name: "ECDSA", namedCurve: "P-256"},
    true,
    ["sign", "verify"]
  );

  const publicRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  if (!privateJwk.d) {
    throw new Error("Não foi possível gerar a chave privada VAPID.");
  }

  const config = {
    publicKey: bytesToBase64Url(publicRaw),
    privateKey: String(privateJwk.d),
    subject: VAPID_SUBJECT
  };

  await env.CONVERSATIONS.put(
    "system:vapid",
    JSON.stringify(config)
  );

  return config;
}

async function pushConfig(env) {
  const secretPublic = String(env.VAPID_PUBLIC_KEY || "").trim();
  const secretPrivate = String(env.VAPID_PRIVATE_KEY || "").trim();

  if (secretPublic && secretPrivate) {
    return {
      publicKey: secretPublic,
      privateKey: secretPrivate,
      subject: VAPID_SUBJECT
    };
  }

  return createVapidConfig(env);
}

function allowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase();

    return (
      host === "fcm.googleapis.com" ||
      host.endsWith(".fcm.googleapis.com") ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".push.apple.com")
    );
  } catch {
    return false;
  }
}

async function pushSubscriptionId(endpoint) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint)
  );

  return bytesToBase64Url(digest);
}

async function handlePushConfig(request, env) {
  if (!(await requireAdmin(request, env))) {
    return json({ok:false,error:"Não autorizado."},401);
  }

  try {
    const config = await pushConfig(env);

    if (!config) {
      return json({
        ok:false,
        error:"Armazenamento de notificações ainda não está disponível."
      },503);
    }

    return json({
      ok:true,
      publicKey:config.publicKey
    });
  } catch (error) {
    console.error("Erro VAPID:", error);
    return json({
      ok:false,
      error:"Não foi possível preparar as notificações.",
      details:String(error?.message || error)
    },503);
  }
}

async function handlePushSubscribe(request, env) {
  if (!(await requireAdmin(request, env))) {
    return json({ok:false,error:"Não autorizado."},401);
  }

  if (!env.CONVERSATIONS) {
    return json({ok:false,error:"Armazenamento ainda não configurado."},503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ok:false,error:"Assinatura inválida."},400);
  }

  const subscription = body?.subscription;
  const endpoint = String(subscription?.endpoint || "").trim();

  if (
    !endpoint ||
    !allowedPushEndpoint(endpoint) ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    return json({
      ok:false,
      error:"Assinatura de notificações inválida."
    },400);
  }

  const id = await pushSubscriptionId(endpoint);

  await env.CONVERSATIONS.put(
    "push:admin:" + id,
    JSON.stringify({
      endpoint,
      keys:{
        p256dh:String(subscription.keys.p256dh),
        auth:String(subscription.keys.auth)
      },
      updatedAt:new Date().toISOString()
    })
  );

  return json({ok:true,saved:true});
}

async function handlePushUnsubscribe(request, env) {
  if (!(await requireAdmin(request, env))) {
    return json({ok:false,error:"Não autorizado."},401);
  }

  if (!env.CONVERSATIONS) {
    return json({ok:false,error:"Armazenamento ainda não configurado."},503);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const endpoint = String(body?.endpoint || "").trim();

  if (!endpoint) {
    return json({ok:false,error:"Endpoint não informado."},400);
  }

  const id = await pushSubscriptionId(endpoint);

  await env.CONVERSATIONS.delete("push:admin:" + id);

  return json({ok:true,deleted:true});
}

async function notifyAdminNewConversation(env, record) {
  const config = await pushConfig(env);

  if (!config || !env.CONVERSATIONS) {
    return {configured:false,delivered:0,gone:0,failed:0};
  }

  const listing = await env.CONVERSATIONS.list({
    prefix:"push:admin:",
    limit:100
  });

  if (!listing.keys.length) {
    return {configured:true,delivered:0,gone:0,failed:0};
  }

  const {sendPushNotification} =
    await import("@mmmike/web-push/send");

  let delivered = 0;
  let gone = 0;
  let failed = 0;

  for (const key of listing.keys) {
    const subscription =
      await env.CONVERSATIONS.get(key.name,"json");

    if (!subscription) continue;

    try {
      const result = await sendPushNotification(
        subscription,
        {
          title:
            "🔔 Novo cliente — " +
            (record.clientName || "Novo cliente"),
          body:
            "Um novo atendimento foi iniciado no Chat Eduardo Gabriel.",
          url:"/admin",
          tag:"nova-conversa-" + record.sessionId
        },
        {
          subject:config.subject,
          publicKey:config.publicKey,
          privateKey:config.privateKey
        },
        {
          ttl:120,
          urgency:"high"
        }
      );

      if (!result) {
        await env.CONVERSATIONS.delete(key.name);
        gone++;
      } else {
        delivered++;
      }
    } catch (error) {
      const status = Number(error?.statusCode || 0);

      if (status === 404 || status === 410) {
        await env.CONVERSATIONS.delete(key.name);
        gone++;
      } else {
        console.error("Falha ao enviar push:", error);
        failed++;
      }
    }
  }

  return {configured:true,delivered,gone,failed};
}


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
// DETECÇÃO DO IDIOMA DA CONVERSA
// ============================================================

function detectLanguage(text, history = [], context = {}) {
  const explicit = String(context?.idioma || context?.language || "").trim().toLowerCase();
  if (/^(en|en-us|en-gb|english|ingl[eê]s)$/.test(explicit)) return "en";
  if (/^(pt|pt-ao|pt-br|portugu[eê]s|portuguese)$/.test(explicit)) return "pt";

  const firstUser = [...history].reverse().find(item => item && item.role === "user");
  const sample = String(firstUser?.content || text || "").toLowerCase();
  const ptWords = ["olá","ola","oi","bom dia","boa tarde","boa noite","preciso","gostaria","quero","tenho","sou","me chamo","meu nome","senhor","senhora","preço","preco","quanto","serviço","servico","ajuda","número","numero","whatsapp","por favor","obrigado","obrigada","pode","podem"];
  const enWords = ["hello","hi","good morning","good afternoon","good evening","i need","i would like","i want","i have","i am","i'm","my name","mr","mrs","ms","sir","madam","price","how much","service","help","number","whatsapp","please","thank you","can you","could you","where","what","when"];
  let pt = 0, en = 0;
  for (const word of ptWords) if (sample.includes(word)) pt++;
  for (const word of enWords) if (sample.includes(word)) en++;
  if (en > pt) return "en";
  if (pt > en) return "pt";
  if (/\b(the|this|that|with|for|from|about|please|can)\b/i.test(sample)) return "en";
  if (/\b(o|a|os|as|com|para|por|sobre|pode|preciso)\b/i.test(sample)) return "pt";
  return "pt";
}

// ============================================================
// LIMPAR NOME
// ============================================================

function normalizePhoneNumber(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("244")) return digits;
  if (/^9\d{8}$/.test(digits)) return "244" + digits;
  return "";
}
function extractPhoneFromText(text, previousHistory = []) {
  if (!text) return "";
  const value = String(text).replace(/\s+/g, " ").trim();
  const explicit = value.match(/(?:whatsapp|telefone|n[uú]mero|contacto|contato|tel(?:efone)?|phone|number|mobile|cell)\s*(?:é|e|is|:|-)?\s*(\+?\d[\d\s().-]{7,18}\d)/i);
  if (explicit) {
    const normalized = normalizePhoneNumber(explicit[1]);
    if (normalized) return normalized;
  }
  const lastAssistant = [...previousHistory].reverse().find(item => item.role === "assistant");
  if (lastAssistant && /(?:n[uú]mero|telefone|whatsapp|contacto|contato|phone|number|mobile|cell)/i.test(String(lastAssistant.content || ""))) {
    const standalone = value.match(/(?:\+?244[\s.-]?)?9(?:[\s.-]?\d){8}/);
    if (standalone) return normalizePhoneNumber(standalone[0]);
  }
  return "";
}
function stripContactTail(value) {
  return String(value || "").replace(
    /\s*(?:,|;|\s+e\s+|\s+and\s+)?\s*(?:(?:o\s+meu|meu|minha|o)\s*(?:n[uú]mero|telefone|whatsapp|contacto|contato)|(?:my|the)\s+(?:number|phone|whatsapp|contact|mobile))\s*(?:é|e|is|:|-)?\s*.*$/i,
    ""
  ).trim();
}

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
  // "Meu nome é João", "Chamo-me João", "Eu sou o senhor João"
  // ----------------------------------------------------------

  let match = value.match(
    /(?:meu nome\s*(?:é|e|eh)|meu nome chama-se|meu nome chama|me chamo|chamo-me|chamo|eu sou|my name\s*(?:is|:)|i am|i'm|this is)\s+(?:o\s+|a\s+|the\s+)?(?:sr\.?\s+|senhor\s+|sra\.?\s+|senhora\s+|mr\.?\s+|mrs\.?\s+|ms\.?\s+|sir\s+|madam\s+)?(.+)/i
  );

  if (match) {
    const name = cleanName(stripContactTail(match[1]));

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
    /^(?:sr\.?|senhor|sra\.?|senhora|mr\.?|mrs\.?|ms\.?|sir|madam)\s+(.+)$/i
  );

  if (match) {
    const name = cleanName(stripContactTail(match[1]));

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
    /nome|name|identifica|identify|chamar|senhor|senhora|sir|mr\.?|mrs\.?|ms\.?|madam/i.test(
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

function detectTitle(text, history = [], language = "pt") {
  const allText = [
    ...history.map(x => x.content || ""),
    text || ""
  ]
    .join(" ")
    .toLowerCase();

  const femaleTitle = language === "en" ? "Ms." : "Sra.";
  const maleTitle = language === "en" ? "Mr." : "Sr.";

  // Formas explícitas femininas
  if (
    /\bsra\.?\b/.test(allText) ||
    /\bsenhora\b/.test(allText) ||
    /\bsou a senhora\b/.test(allText) ||
    /\bsou uma senhora\b/.test(allText) ||
    /\bmrs\.?\b/.test(allText) ||
    /\bms\.?\b/.test(allText) ||
    /\bmadam\b/.test(allText)
  ) {
    return femaleTitle;
  }

  // Formas explícitas masculinas
  if (
    /\bsr\.?\b/.test(allText) ||
    /\bsenhor\b/.test(allText) ||
    /\bsou o senhor\b/.test(allText) ||
    /\bsou um senhor\b/.test(allText) ||
    /\bmr\.?\b/.test(allText) ||
    /\bsir\b/.test(allText)
  ) {
    return maleTitle;
  }

  // Padrão definido pelo proprietário:
  // Sr. quando não houver indicação feminina.
  return maleTitle;
}

// ============================================================
// VERIFICAR SE JÁ TEM NOME
// ============================================================

function findKnownClientName(context, history, currentMessage) {
  // 1. Nome vindo diretamente pelo portal
  let contextName = "";
  if (context && context.nome) {
    const name = cleanName(context.nome);
    if (name) {
      contextName = name;
      if (name.split(/\s+/).filter(Boolean).length >= 2) return name;
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

  if (contextName) return contextName;

  return "";
}

function findKnownClientPhone(context, history, currentMessage) {
  if (context && context.telefone) {
    const phone = normalizePhoneNumber(context.telefone);
    if (phone) return phone;
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.role !== "user") continue;
    const found = extractPhoneFromText(item.content, history.slice(0, i));
    if (found) return found;
  }
  return extractPhoneFromText(currentMessage, history);
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

HORÁRIO DE ATENDIMENTO DO SR. EDUARDO
------------------------------------------------------------

Horário oficial, no fuso de Angola (Africa/Luanda):
- Domingo: fechado para atendimento normal. Apenas questões de emergência.
- Segunda-feira: 08:00–18:00.
- Terça-feira: 08:00–18:00.
- Quarta-feira: 08:00–18:00.
- Quinta-feira: 08:00–18:00.
- Sexta-feira: 08:00–18:00.
- Sábado: 08:00–12:30.

Fora do horário acima, o Sr. Eduardo não está disponível para atendimento normal.
Não afirmar, insinuar ou prometer que ele está presente fora do expediente.
Quando o atendimento estiver fora do horário, orientar o cliente a solicitar/agendar um atendimento urgente quando realmente precisar de atendimento fora do expediente.
No domingo, deixar claro que somente situações de emergência devem ser encaminhadas; situações normais ficam para o próximo horário de expediente.
Quando um atendimento urgente for solicitado fora do expediente, recolher apenas as informações necessárias para o encaminhamento, sem prometer um horário de resposta que não esteja confirmado.

------------------------------------------------------------

COMPORTAMENTO GERAL
------------------------------------------------------------

IDIOMA DA CONVERSA
------------------------------------------------------------

A primeira mensagem do cliente define o idioma principal da conversa.

Se a primeira mensagem for em Inglês, toda a conversa, incluindo a apresentação e os pedidos de nome/WhatsApp, deve ser em Inglês.
Se a primeira mensagem for em Português, toda a conversa, incluindo a apresentação e os pedidos de nome/WhatsApp, deve ser em Português.
Se houver mistura, use o idioma predominante da primeira mensagem.
Se o cliente pedir explicitamente para mudar de idioma, acompanhe o pedido.

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
  context,
  language
}) {
  const identity =
    clientName
      ? `
CLIENT IDENTIFIED

Full name: ${clientName}
Mandatory form of address: ${clientTitle} ${clientName}

IMPORTANT:
- Address the client as "${clientTitle} ${clientName}".
- Never use only "${clientName}".
- Do not change the name.
- Do not invent another name.
`
      : `
CLIENT NOT YET IDENTIFIED.

ABSOLUTE RULE:
The client must provide their full name and WhatsApp number.
If one of these details has already been provided, ask only for the missing detail.
Never repeat a question that has already been answered.
`;

  const languageInstruction =
    language === "en"
      ? "MANDATORY LANGUAGE: ENGLISH. Respond exclusively in English throughout this conversation. The introduction, identification requests, questions, service explanations and all subsequent replies must remain in English unless the client explicitly asks to change language. For female clients use Ms. [Full Name]; for male clients use Mr. [Full Name]."
      : "IDIOMA OBRIGATÓRIO: PORTUGUÊS. Responda exclusivamente em Português durante esta conversa. A apresentação, pedidos de identificação, perguntas, explicações de serviços e todas as respostas seguintes devem permanecer em Português, salvo pedido explícito de mudança de idioma. Para clientes do sexo feminino use Sra. [Nome completo]; para clientes do sexo masculino use Sr. [Nome completo].";

  const contextText =
    context && Object.keys(context).length
      ? `
DADOS JÁ FORNECIDOS PELO PORTAL:

${JSON.stringify(context, null, 2)}

Use esses dados para evitar repetir perguntas.
`
      : "";

  const ownerName =
    language === "en"
      ? "Mr. Eduardo Ngongoyove Gabriel"
      : "Sr. Eduardo Ngongoyove Gabriel";

  return `
Você é o Assistente Virtual do ${ownerName}.

${languageInstruction}

${identity}

${contextText}

${KNOWLEDGE_BASE}

REGRAS CRÍTICAS:

1. Você NÃO é o proprietário.
2. Você é o Assistente Virtual do proprietário.
3. Nunca diga "Assistente Virtual do Eduardo".
4. Nunca trate o proprietário simplesmente por "Eduardo".
5. Quando falar do proprietário, use "Sr. Eduardo Ngongoyove Gabriel" em Português e "Mr. Eduardo Ngongoyove Gabriel" em Inglês.
6. Quando falar com o cliente, use sempre "Sr."/"Sra." em Português ou "Mr."/"Ms." em Inglês + nome completo.
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

IMPORTANTE SOBRE IDENTIFICAÇÃO:

O cliente precisa fornecer nome completo e número de WhatsApp.
Nunca peça novamente um dado que já foi fornecido.
Depois de obter os dois dados, continue o atendimento normalmente e use o tratamento correto.

A conversa deve parecer um atendimento humano real.

REGRAS FINAIS DE IDIOMA E TRATAMENTO — PRIORIDADE MÁXIMA:
- Se o idioma for Inglês, toda a conversa deve permanecer em Inglês.
- Em Inglês, homem = "Mr. [Full Name]" e mulher = "Ms. [Full Name]".
- Em Inglês, nunca use "Sr." ou "Sra." para tratar o cliente.
- Se o primeiro contacto for apenas uma saudação ou uma pergunta sem identificação, apresente-se em Inglês e peça o nome completo e o número de WhatsApp.
- Se o cliente já tiver fornecido o nome completo na própria primeira mensagem, reconheça-o imediatamente e peça somente o número de WhatsApp que ainda faltar.
- Se o cliente já tiver fornecido o número de WhatsApp, não o peça novamente.
- Se o cliente já tiver fornecido nome e WhatsApp, não peça nenhum dos dois novamente; continue diretamente com o assunto.
- Se o idioma for Português, use "Sr." para homem e "Sra." para mulher.
- Nunca reinicie a conversa nem repita uma pergunta já respondida.
`;
}

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
// HORÁRIO DE ATENDIMENTO — AFRICA/LUANDA
// ============================================================

function getEduardoScheduleStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Luanda",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
  const minutes = hour * 60 + minute;
  const dayMap = {Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6};
  const day = dayMap[weekday];

  if (day === 0) return {open:false, sunday:true, day, hour, minute};
  if (day >= 1 && day <= 5) return {open:minutes >= 480 && minutes < 1080, sunday:false, day, hour, minute};
  return {open:minutes >= 480 && minutes < 750, sunday:false, day, hour, minute};
}

function outOfHoursReply(language, isSunday = false) {
  if (language === "en") {
    if (isSunday) return "Mr. Eduardo Ngongoyove Gabriel is not available for normal service today. Sunday is reserved only for emergencies. If this is an emergency, please tell me that it is urgent and briefly explain the situation so it can be forwarded for appropriate attention. For normal matters, Mr. Eduardo will continue the assistance on the next business day during working hours.";
    return "Mr. Eduardo Ngongoyove Gabriel is currently outside his working hours and is not available for normal service. If you need an urgent service outside the normal schedule, please tell me that the request is urgent and briefly explain what you need so it can be forwarded for appropriate handling. Otherwise, Mr. Eduardo will continue your assistance on the next business day during working hours.";
  }
  if (isSunday) return "O Sr. Eduardo Ngongoyove Gabriel não está disponível para atendimento normal hoje. O domingo é reservado apenas para situações de emergência. Se for uma emergência, por favor, informe que se trata de um caso urgente e explique brevemente a situação para que seja encaminhada para o devido tratamento. Para assuntos normais, o Sr. Eduardo dará continuidade ao atendimento no próximo dia útil, durante o horário de expediente.";
  return "O Sr. Eduardo Ngongoyove Gabriel encontra-se neste momento fora do horário de expediente e não está disponível para atendimento normal. Se precisar de um serviço urgente fora do horário normal, por favor, informe que se trata de um pedido urgente e explique brevemente o que necessita para que seja encaminhado para o devido tratamento. Caso contrário, o Sr. Eduardo dará continuidade ao seu atendimento no próximo dia útil, durante o horário de expediente.";
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

  const language =
    detectLanguage(
      message,
      history,
      context
    );

  context.idioma = language;

  const clientName =
    findKnownClientName(
      context,
      history,
      message
    );

  const clientTitle =
    detectTitle(
      message,
      history,
      language
    );

  const clientPhone =
    findKnownClientPhone(
      context,
      history,
      message
    );

  // ----------------------------------------------------------
  // SE AINDA NÃO TEM NOME:
  // NÃO DEIXAR O MODELO COMEÇAR O ATENDIMENTO
  // ----------------------------------------------------------

  if (!clientName) {
    return json({
      ok: true,
      reply:
        language === "en"
          ? "Hello! I am Azny Gabriel, virtual assistant to Mr. Eduardo Ngongoyove Gabriel. To continue, please send your full name and your WhatsApp number."
          : "Olá! Sou a Azny Gabriel, assistente virtual do Sr. Eduardo Ngongoyove Gabriel. Para continuarmos, por favor, envie o seu nome completo e o seu número de WhatsApp.",
      clientName: null,
      clientPhone: clientPhone || null,
      clientTitle: null,
      language,
      identified: false,
      needsFullName: true,
      needsPhone: !clientPhone
    });
  }

  // ----------------------------------------------------------
  // NOME COMPLETO OBRIGATÓRIO
  // ----------------------------------------------------------
  if (clientName.split(/\s+/).filter(Boolean).length < 2) {
    return json({
      ok: true,
      reply:
        language === "en"
          ? "Thank you. Please send your full name (first and last name) so I can register your assistance correctly."
          : "Obrigado. Para registarmos corretamente o seu atendimento, por favor, envie o seu nome completo (nome e apelido).",
      clientName,
      clientPhone: clientPhone || null,
      clientTitle,
      language,
      formalName: null,
      identified: false,
      needsFullName: true,
      needsPhone: !clientPhone
    });
  }

  // ----------------------------------------------------------
  // NÚMERO DE WHATSAPP OBRIGATÓRIO
  // ----------------------------------------------------------
  if (!clientPhone) {
    const formal = (clientTitle === "Sra." ? "Sra. " : "Sr. ") + clientName;
    return json({
      ok: true,
      reply:
        language === "en"
          ? `Thank you, ${formal}. So that Mr. Eduardo can resume your assistance on WhatsApp when he is available, please send your WhatsApp number.`
          : `Obrigado, ${formal}. Para que o Sr. Eduardo possa retomar o atendimento consigo pelo WhatsApp quando estiver disponível, por favor, envie o seu número de WhatsApp.`,
      clientName,
      clientPhone: null,
      clientTitle,
      language,
      formalName: null,
      identified: true,
      needsPhone: true
    });
  }

  // ----------------------------------------------------------
  // HORÁRIO DO PROPRIETÁRIO
  // ----------------------------------------------------------

  const scheduleStatus = getEduardoScheduleStatus();

  if (!scheduleStatus.open) {
    return json({
      ok: true,
      reply: outOfHoursReply(language, scheduleStatus.sunday),
      clientName,
      clientPhone,
      clientTitle,
      formalName: clientTitle + " " + clientName,
      language,
      identified: true,
      outsideHours: true,
      sundayEmergencyOnly: scheduleStatus.sunday
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
      context,
      language
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
    clientPhone,
    clientTitle: effectiveTitle,
    formalName,
    language,
    identified: true
  });
}

// ============================================================
// PAINEL ADMINISTRATIVO — CONVERSAS
// ============================================================

function getAdminToken(request) {
  return (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function requireAdmin(request, env) {
  if (!env.CONVERSATIONS || !env.ADMIN_PANEL_KEY) return false;
  const token = getAdminToken(request);
  if (!token) return false;
  return (await env.CONVERSATIONS.get("admin:session:" + token)) === "1";
}

async function handleAdminLogin(request, env) {
  if (!env.CONVERSATIONS || !env.ADMIN_PANEL_KEY) {
    return json({ok:false,error:"O painel ainda não foi configurado no Cloudflare."},503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ok:false,error:"Pedido inválido."},400); }
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key || key !== env.ADMIN_PANEL_KEY) return json({ok:false,error:"Código administrativo incorreto."},401);
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  await env.CONVERSATIONS.put("admin:session:" + token, "1", {expirationTtl:604800});
  return json({ok:true,token});
}

async function handleSaveConversation(request, env) {
  if (!env.CONVERSATIONS) return json({ok:false,error:"Armazenamento ainda não configurado."},503);
  let body;
  try { body = await request.json(); } catch { return json({ok:false,error:"Pedido inválido."},400); }
  const sessionId = String(body?.session_id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(sessionId)) return json({ok:false,error:"Sessão inválida."},400);

  const history = (Array.isArray(body?.history) ? body.history : []).slice(-100).map(item => ({
    type: item?.type === "bot" ? "bot" : "user",
    text: String(item?.text || "").slice(0,10000)
  }));
  const c = body?.context && typeof body.context === "object" ? body.context : {};

  // Reconstituir identidade a partir da própria conversa quando o frontend
  // ainda não tiver atualizado o contexto. Isto garante que o atendimento
  // apareça no painel assim que o cliente informar os dados.
  const detectionHistory = history.map(item => ({
    role: item.type === "bot" ? "assistant" : "user",
    content: item.text
  }));
  const detectedName = findKnownClientName(c, detectionHistory, "");
  const detectedPhone = findKnownClientPhone(c, detectionHistory, "");
  const suppliedName = String(body?.clientName || c.nome || "").trim();
  const suppliedPhone = String(body?.clientPhone || c.telefone || "").trim();

  const existing = await env.CONVERSATIONS.get(
    "conversation:" + sessionId,
    "json"
  );

  const hadClientMessage = Boolean(
    existing &&
    Array.isArray(existing.history) &&
    existing.history.some(item => item && item.type === "user")
  );

  const hasClientMessageNow = history.some(
    item => item && item.type === "user"
  );

  const firstClientMessage =
    hasClientMessageNow && !hadClientMessage;

  const record = {
    sessionId,
    clientName: String(
      detectedName || suppliedName
    ).slice(0,120),
    phone: String(
      detectedPhone || suppliedPhone
    ).slice(0,40),
    language: String(c.idioma || c.language || "").slice(0,10),
    email: String(c.email || "").slice(0,160),
    service: String(c.servico || "").slice(0,200),
    request: String(c.pedido || "").slice(0,1000),
    status: body?.status === "human" ? "human" : "bot",
    updatedAt: new Date().toISOString(),
    history,
    pushNotifiedAt: existing?.pushNotifiedAt || null
  };

  await env.CONVERSATIONS.put(
    "conversation:" + sessionId,
    JSON.stringify(record)
  );

  if (firstClientMessage && !record.pushNotifiedAt) {
    const pushResult =
      await notifyAdminNewConversation(env,record);

    if (pushResult.delivered > 0) {
      record.pushNotifiedAt =
        new Date().toISOString();

      await env.CONVERSATIONS.put(
        "conversation:" + sessionId,
        JSON.stringify(record)
      );
    }
  }

  return json({ok:true,saved:true});
}

async function handleAdminConversations(request, env) {
  if (!(await requireAdmin(request, env))) return json({ok:false,error:"Não autorizado."},401);
  const conversations = [];
  let cursor = undefined;
  let listComplete = true;

  do {
    const options = {prefix:"conversation:",limit:100};
    if (cursor) options.cursor = cursor;
    const listing = await env.CONVERSATIONS.list(options);
    const keys = listing.keys.map(x => x.name);

    for (let start = 0; start < keys.length; start += 100) {
      const batch = keys.slice(start, start + 100);
      if (!batch.length) continue;
      const values = await env.CONVERSATIONS.get(batch, "json");
      for (const key of batch) {
        const item = values.get(key);
        if (item) conversations.push(item);
      }
    }

    listComplete = listing.list_complete;
    cursor = listComplete ? undefined : listing.cursor;
  } while (!listComplete && cursor);

  conversations.sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return json({ok:true,conversations,listComplete});
}

async function handleAdminDeleteConversation(request, env, sessionId) {
  if (!(await requireAdmin(request, env))) return json({ok:false,error:"Não autorizado."},401);
  const id = String(sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) {
    return json({ok:false,error:"Sessão inválida."},400);
  }
  const deleted = await env.CONVERSATIONS.delete("conversation:" + id);
  if (!deleted) return json({ok:false,error:"Conversa não encontrada."},404);
  return json({ok:true,deleted:true,sessionId:id});
}

async function handleAdminConversation(request, env, sessionId) {
  if (!(await requireAdmin(request, env))) return json({ok:false,error:"Não autorizado."},401);
  const item = await env.CONVERSATIONS.get("conversation:" + sessionId, "json");
  if (!item) return json({ok:false,error:"Conversa não encontrada."},404);
  return json({ok:true,conversation:item});
}


// ============================================================
// WORKER
// ============================================================

async function fetchHandler(request) {
    // Service Worker format: Cloudflare exposes bindings on globalThis.
    // Keep a process.env fallback for compatible runtimes, without ever
    // placing secrets in the source code.
    const readBinding = (name) => {
      try {
        const direct = globalThis[name];
        if (typeof direct === "string" && direct.trim()) {
          return direct.trim();
        }
        if (direct && typeof direct !== "string") {
          return direct;
        }
      } catch (_) {}

      try {
        if (
          typeof process !== "undefined" &&
          process.env &&
          typeof process.env[name] === "string" &&
          process.env[name].trim()
        ) {
          return process.env[name].trim();
        }
      } catch (_) {}

      return undefined;
    };

    const env = {
      GROQ_API_KEY: readBinding("GROQ_API_KEY"),
      ADMIN_PANEL_KEY: readBinding("ADMIN_PANEL_KEY"),
      CONVERSATIONS: readBinding("CONVERSATIONS"),
      VAPID_PUBLIC_KEY: readBinding("VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: readBinding("VAPID_PRIVATE_KEY"),
      ASSETS: readBinding("ASSETS")
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
    // PAINEL ADMINISTRATIVO
    // --------------------------------------------------------
    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      return handleAdminLogin(request, env);
    }
    if (url.pathname === "/api/conversations/save" && request.method === "POST") {
      return handleSaveConversation(request, env);
    }
    if (url.pathname === "/api/push/config" && request.method === "GET") {
      return handlePushConfig(request, env);
    }
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      return handlePushSubscribe(request, env);
    }
    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
      return handlePushUnsubscribe(request, env);
    }
    if (url.pathname === "/api/admin/conversations" && request.method === "GET") {
      return handleAdminConversations(request, env);
    }
    if (url.pathname.startsWith("/api/admin/conversations/") && request.method === "GET") {
      return handleAdminConversation(request, env, decodeURIComponent(url.pathname.slice("/api/admin/conversations/".length)));
    }
    if (url.pathname.startsWith("/api/admin/conversations/") && request.method === "DELETE") {
      return handleAdminDeleteConversation(request, env, decodeURIComponent(url.pathname.slice("/api/admin/conversations/".length)));
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
    // PAINEL WEB NO CLOUDFLARE
    // --------------------------------------------------------
    if ((url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html") && env.ASSETS) {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = "/admin.html";
      const response = await env.ASSETS.fetch(new Request(adminUrl.toString(), request));
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("Pragma", "no-cache");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
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
