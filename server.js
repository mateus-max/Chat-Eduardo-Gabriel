// ============================================================
// CHAT VIRTUAL — SR. EDUARDO NGONGOYOVE GABRIEL
// Deployment refresh: 2026-10-05
// Backend Cloudflare Worker + Groq
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-20b";
const VISION_MODEL = "qwen/qwen3.8-27b";

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

  // Formas naturais de apresentação do próprio cliente.
  // Ex.: "Falas com o senhor Emiliano" ou "Está a falar com a senhora Maria".
  const presentedMatch = value.match(/^\s*(?:fala|fale|falas|falo|está a falar|estão a falar|estou a falar|aqui fala)\s+(?:com\s+)?(?:o\s+|a\s+)?(?:(?:sr\.?|senhor|sra\.?|senhora)\s+)?(.+)$/i);

  if (presentedMatch) {
    const name = cleanName(presentedMatch[1]);
    if (name && name.split(/\s+/).length <= 5 && !looksLikeServiceRequest(name)) {
      return name;
    }
  }

  // Apresentações em inglês.
  let englishMatch = value.match(/^\s*(?:my name is|my name's|i am|i'm|this is|you're speaking (?:to|with)|you are speaking (?:to|with)|speaking (?:to|with))\s+(?:(?:mr|mrs|ms|miss)\.?\s+)?(.+)$/i);
  if (englishMatch) {
    const name = cleanName(englishMatch[1]);
    if (name && name.split(/\s+/).length <= 5 && !looksLikeServiceRequest(name)) {
      return name;
    }
  }

  // ----------------------------------------------------------
  // Apresentações pelo nome:
  // "Meu nome é João"
  // "Eu me chamo João"
  // "Me chamo João"
  // "Chamo-me João"
  // "Me chamo o senhor João"
  // "Me chamo a senhora Maria"
  // "Eu sou João"
  // "Eu sou o senhor João"
  // ----------------------------------------------------------

  let match = value.match(
    /^(?:(?:eu\s+)?(?:meu nome\s*(?:é|e|eh)|meu nome chama-se|meu nome chama|(?:eu\s+)?me\s+chamo|(?:eu\s+)?chamo-me|(?:eu\s+)?chamo)\s+)(?:(?:o|a)\s+)?(?:(?:sr\.?|senhor|sra\.?|senhora)\s+)?(.+)$/i
  );

  if (match) {
    const name = cleanName(match[1]);

    if (
      name &&
      name.split(/\s+/).length <= 5 &&
      !looksLikeServiceRequest(name)
    ) {
      return name;
    }
  }

  // ----------------------------------------------------------
  // "Sou João"
  // "Sou o João"
  // "Sou a Maria"
  // "Eu sou João"
  // "Eu sou o senhor João"
  // "Eu sou a senhora Maria"
  // ----------------------------------------------------------

  match = value.match(
    /^(?:eu\s+)?sou\s+(?:(?:o|a)\s+)?(?:(?:sr\.?|senhor|sra\.?|senhora)\s+)?(.+)$/i
  );

  if (match) {
    const name = cleanName(match[1]);

    if (
      name &&
      name.split(/\s+/).length <= 5 &&
      !looksLikeServiceRequest(name)
    ) {
      return name;
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

    if (
      name &&
      name.split(/\s+/).length <= 5 &&
      !looksLikeServiceRequest(name)
    ) {
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

function detectLanguage(text, history = []) {
  const sample = [...history.map(x => x.content || ""), text || ""].join(" ").toLowerCase();
  const englishSignals = ["hello","hi","good morning","good afternoon","good evening","my name is","i'm","i am","i need","i want","please","how much","how does","where","when","what","why","can you","i would like","speak english","in english","call","phone"];
  const portugueseSignals = ["olá","ola","bom dia","boa tarde","boa noite","meu nome","sou","preciso","quero","por favor","quanto custa","como funciona","onde","quando","o que","porquê","pode","falar","ligar"];
  const en = englishSignals.filter(x => sample.includes(x)).length;
  const pt = portugueseSignals.filter(x => sample.includes(x)).length;
  return en > pt ? "en" : "pt";
}

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
    /\bsou uma senhora\b/.test(allText) ||
    /\b(?:mrs|ms|miss|madam|ma'am)\.?\b/.test(allText)
  ) {
    return "Sra.";
  }

  // Formas explícitas masculinas
  if (
    /\bsr\.?\b/.test(allText) ||
    /\bsenhor\b/.test(allText) ||
    /\bsou o senhor\b/.test(allText) ||
    /\bsou um senhor\b/.test(allText) ||
    /\bmr\.?\b/.test(allText)
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

  // Resposta simples ao pedido de nome, por exemplo apenas "Paulo".
  // Não depende de o modelo interpretar a mensagem.
  const normalizedCurrent = String(currentMessage || "").replace(/\s+/g, " ").trim();
  const lastAssistant = [...history]
    .reverse()
    .find(item => item.role === "assistant");

  const assistantAskedName =
    !!lastAssistant &&
    /diga-me o seu nome|qual é o seu nome|qual e o seu nome|para continuarmos.*nome/i.test(
      String(lastAssistant.content || "")
    );

  if (
    assistantAskedName &&
    /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}$/.test(normalizedCurrent) &&
    normalizedCurrent.split(/\s+/).length <= 5 &&
    !looksLikeServiceRequest(normalizedCurrent) &&
    !/^(olá|ola|oi|sim|não|nao|obrigado|obrigada|por favor|quanto|preço|preco|valor)$/i.test(normalizedCurrent)
  ) {
    return cleanName(normalizedCurrent);
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
"Sou o Azny Gabriel, assistente virtual do Sr. Eduardo Ngongoyove Gabriel."

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

17. CÂMBIO KWANZA ↔ RAND NAMIBIANO (NAD)
------------------------------------------------------------

Quando o cliente perguntar pelo câmbio entre Kwanza (Kz) e
Rand namibiano (NAD), usar as taxas de referência fornecidas
pelo senhor Eduardo:

- Kwanza → NAD: 1 NAD = 67 Kz.
  Exemplo: 100 NAD = 6.700 Kz.

- NAD → Kwanza: 1 NAD = 65 Kz.
  Exemplo: 100 NAD = 6.500 Kz.

Explicar que existem duas taxas no intercâmbio:
a taxa para quem tem Kwanza e pretende obter NAD e a taxa para
quem tem NAD e pretende obter Kwanza.

Não inverter as duas taxas.

Quando necessário, apresentar o exemplo de 100 NAD para facilitar
a compreensão do cliente.

------------------------------------------------------------

16. CONSULTAS MÉDICAS NA NAMÍBIA
------------------------------------------------------------

Quando o cliente perguntar como funcionam as consultas médicas
em hospital público ou privado na Namíbia, explicar as duas opções
de forma clara e profissional, usando estas informações:

HOSPITAL PÚBLICO

No hospital público, o atendimento começa com o pagamento do
cartão de consulta, no valor de 150 NAD (aproximadamente 9.000 Kz).
Depois, o paciente aguarda a chamada para a pesagem e triagem.

Em seguida, o cartão é colocado na caixa indicada e o paciente é
chamado pelo enfermeiro, que faz a avaliação inicial. Conforme o
caso, o paciente pode ser encaminhado ao médico.

O médico avalia o histórico e, se necessário, solicita exames.
Alguns exames podem ter custos adicionais. Depois de realizados,
o paciente poderá precisar retornar ao hospital para apresentar os
resultados e receber a orientação ou prescrição médica.

Os resultados podem ficar disponíveis em diferentes prazos,
dependendo do exame: 24 horas, 3–4 dias úteis ou até 1–3 semanas.
Alguns exames específicos podem ser enviados para a África do Sul.

HOSPITAL/CLÍNICA PRIVADA

No atendimento privado, a consulta tem um custo inicial a partir
de 350 NAD (aproximadamente 22.000–23.000 Kz), podendo variar
conforme a clínica, o médico e a especialidade.

Depois da consulta médica, caso sejam necessários exames, estes são
pagos separadamente e normalmente têm um custo superior ao
atendimento público.

Por isso, para uma consulta privada, recomenda-se que o paciente
esteja preparado financeiramente tanto para os exames como para
eventual medicação.

LOCAIS DE ATENDIMENTO

Entre as opções consideradas estão Oshakati, Ongwediva e Ondangwa,
com opções públicas e privadas conforme a cidade.

Quando responder sobre este assunto:
- Tratar o cliente formalmente como Senhor/Senhora.
- Explicar primeiro a diferença entre público e privado.
- Não inventar outros preços, hospitais, exames ou prazos.
- Se o cliente perguntar por preços atualizados, orientar também
  para confirmar no Portal de Suporte Técnico.
- Se o cliente pedir orientação médica sobre sintomas ou tratamento,
  não diagnosticar; orientar a procurar um profissional de saúde.


------------------------------------------------------------

COMPORTAMENTO SOBRE PREÇOS — REGRA OBRIGATÓRIA
------------------------------------------------------------

PORTAL OFICIAL DE SUPORTE TÉCNICO E PREÇOS:
https://suporte-on-line.web.app/

Sempre que o cliente perguntar o preço, valor, custo, orçamento,
tarifa, mensalidade ou qualquer valor de um serviço, o portal
acima é a fonte de consulta indicada pelo senhor Eduardo.

NÃO utilizar os valores de referência desta base de conhecimento
como preço final para o cliente.

NÃO inventar preços.

Quando o cliente perguntar diretamente quanto custa um serviço,
orientar a consulta do preço no Portal de Suporte Técnico e
fornecer o endereço do portal.

Se o cliente já estiver a tratar de um serviço específico,
pode explicar o serviço e orientar a consulta do respetivo preço
no portal, sem inventar ou confirmar um valor que não tenha sido
consultado no portal.

Se o cliente pedir um orçamento personalizado, recolher apenas
as informações necessárias, uma pergunta de cada vez, e deixar
claro que o valor deverá ser confirmado através do portal ou
posteriormente pelo senhor Eduardo.

Nunca apresentar como oficial um preço que não tenha sido
consultado no Portal de Suporte Técnico.

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
// HORÁRIO DO SENHOR EDUARDO — LUANDA
// Atendimento: 08:00 às 18:00
// ============================================================

function horarioSenhorEduardo() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("pt-AO", {
    timeZone: "Africa/Luanda",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const totalMinutes = hour * 60 + minute;

  if (weekday === "domingo") return "Hoje é domingo e o senhor Eduardo não trabalha. Ele estará disponível novamente na segunda-feira, a partir das 8 horas.";
  if (weekday === "sábado") {
    if (totalMinutes >= 480 && totalMinutes < 930) return "Hoje é sábado e o senhor Eduardo está dentro do horário de atendimento, das 8 às 15h30.";
    return "Hoje é sábado e o senhor Eduardo encontra-se indisponível neste momento. O horário de sábado é das 8 às 15h30.";
  }
  if (totalMinutes >= 480 && totalMinutes < 1080) return "Hoje é dia útil e o senhor Eduardo está dentro do horário de atendimento, das 8 às 18 horas.";
  return "O senhor Eduardo encontra-se indisponível neste momento. De segunda a sexta-feira, o horário de atendimento é das 8 às 18 horas.";
}

function agendaAmanhaEduardo() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const weekday = new Intl.DateTimeFormat("pt-AO", { timeZone: "Africa/Luanda", weekday: "long" }).format(tomorrow);
  if (weekday === "domingo") return "Amanhã é domingo. O senhor Eduardo não trabalha aos domingos e estará novamente disponível na segunda-feira, a partir das 8 horas.";
  if (weekday === "sábado") return "Amanhã é sábado. O senhor Eduardo estará disponível das 8 às 15h30.";
  return "Amanhã é dia de trabalho. O senhor Eduardo estará disponível das 8 às 18 horas.";
}

// ============================================================
// INSTRUÇÃO DINÂMICA
// ============================================================

function buildSystemPrompt({
  clientName,
  clientTitle,
  context,
  language = "pt"
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

"Com quem tenho o prazer de falar?"

Não faça outra pergunta nesse momento.

Depois que o cliente disser o nome, responda naturalmente, por exemplo:
"É um prazer falar consigo, Sr. [Nome]. Em que posso ser útil?"
ou
"É um prazer falar consigo, Sra. [Nome]. Em que posso ajudá-la?"
`;

  const horarioText = horarioSenhorEduardo();
  const languageInstruction = language === "en"
    ? "Respond entirely in English. Use Mr./Ms. for the client and keep the whole reply in English."
    : "Responda inteiramente em português, salvo se o cliente mudar claramente de idioma.";

  const contextText =
    context && Object.keys(context).length
      ? `
DADOS JÁ FORNECIDOS PELO PORTAL:

${JSON.stringify(context, null, 2)}

Use esses dados para evitar repetir perguntas.
`
      : "";

  return `
Você é Azny Gabriel, assistente virtual do Sr. Eduardo Ngongoyove Gabriel.

${identity}

${contextText}

HORÁRIO E DISPONIBILIDADE DO SENHOR EDUARDO:
${horarioText}

AGENDA DE AMANHÃ:
${agendaAmanhaEduardo()}

Se o cliente perguntar pelo senhor Eduardo, quiser falar com ele ou pedir atendimento direto com ele, informe a disponibilidade de acordo com o horário acima. Fora do horário, diga de forma natural que o senhor Eduardo encontra-se indisponível no momento e que, assim que estiver disponível novamente, poderá responder com a maior brevidade possível. Mesmo quando ele estiver indisponível, continue disponível para prestar as primeiras informações, esclarecer dúvidas e encaminhar o atendimento. Não invente outro horário.

${KNOWLEDGE_BASE}

IDIOMA DA CONVERSA:
${languageInstruction}
- Detecte o idioma usado pelo cliente na mensagem atual e no histórico.
- Se o cliente estiver a falar em inglês, responda EXCLUSIVAMENTE em inglês.
- Não misture português e inglês na mesma resposta, salvo se o cliente pedir tradução.
- Em inglês, use "Mr. [Nome]" ou "Ms. [Nome]" como tratamento formal.

CONTACTO OFICIAL PARA WHATSAPP:
- O número oficial do Sr. Eduardo é +244 931 057 760.
- Para links WhatsApp, use o formato internacional sem sinais ou espaços: 244931057760.
- Nunca invente ou substitua este número.

REGRAS CRÍTICAS:

1. Você NÃO é o Sr. Eduardo.
2. Você é Azny Gabriel, assistente virtual do senhor Eduardo.
3. Nunca diga "Assistente Virtual do Eduardo".
4. Nunca trate o proprietário simplesmente por "Eduardo".
5. Quando falar do proprietário, use simplesmente "o senhor Eduardo".
6. Depois de obter o nome, cumprimente o cliente de forma natural e formal, por exemplo: "É um prazer falar consigo, Sr. [Nome]. Em que posso ser útil?" ou "É um prazer falar consigo, Sra. [Nome]. Em que posso ajudá-la?"
7. Não repita o nome do cliente em todas as respostas; depois de o identificar, pode conversar normalmente mantendo o tratamento formal.
8. Não reinicie a conversa.
9. Não repita a apresentação depois que ela já tiver sido feita.
10. Use o histórico da conversa.
11. Responda ao que o cliente acabou de perguntar.
12. Se o cliente mudar de assunto, acompanhe a mudança.
13. Quando uma pergunta exigir uma informação que não esteja disponível ou que você não consiga confirmar com segurança, NÃO invente, NÃO especule e NÃO faça uma longa justificativa. Responda de forma humilde e breve: "Olha, quanto a esta informação, não consigo dar uma resposta precisa neste momento, mas fica anotado e o senhor Eduardo fará questão de responder tão logo se pronunciar." Depois, continue o atendimento normalmente se houver outra questão.
14. Não invente preços. Para preços, valores, custos, orçamentos, tarifas ou mensalidades, encaminhe sempre o cliente para o Portal de Suporte Técnico. Não use os valores internos da base como preço final. Se o serviço já estiver em discussão, não pergunte novamente qual é o serviço.
14. Se o cliente perguntar se o senhor Eduardo estará disponível amanhã, use a AGENDA DE AMANHÃ acima. Segunda a sexta: 08:00–18:00. Sábado: 08:00–15:30. Domingo: não trabalha.
15. Quando a AGENDA DE AMANHÃ indicar que ele trabalha, responda claramente que sim, informando o horário. Se for domingo, explique que não trabalha e informe quando estará disponível.
16. Se o cliente se apresentar dizendo "Falas com o senhor [Nome]", "Está a falar com a senhora [Nome]", "Aqui fala o Sr. [Nome]" ou equivalente, considere esse nome como o nome do próprio cliente.
17. Depois de identificar o nome, não peça novamente o nome.
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
    throw new Error("IA_NOT_CONFIGURED");
  }

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.6,
          max_completion_tokens: attempt === 1 ? 1800 : 3000,
          top_p: 0.95,
          reasoning_effort: "low",
          stream: false
        })
      });

      const raw = await response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("INVALID_GROQ_RESPONSE");
      }

      if (!response.ok) {
        throw new Error(
          data?.error?.message || `GROQ_HTTP_${response.status}`
        );
      }

      const message = data?.choices?.[0]?.message || {};
      const content = String(message.content || "").trim();

      if (content) {
        return content;
      }

      throw new Error("EMPTY_GROQ_CONTENT");
    } catch (error) {
      lastError = error;
      console.error("Erro interno ao obter resposta da IA:", error);

      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
  }

  throw lastError || new Error("AI_RESPONSE_FAILED");
}

// ============================================================
// ANÁLISE DE IMAGENS / OCR — GROQ VISION
// ============================================================

async function analyzeImage(env, payload) {
  if (!env.GROQ_API_KEY) {
    throw new Error("O atendimento inteligente ainda não está configurado no Cloudflare: GROQ_API_KEY não foi encontrada.");
  }

  const image = typeof payload?.image === "string" ? payload.image : "";
  const question = typeof payload?.question === "string" && payload.question.trim()
    ? payload.question.trim()
    : "Analise esta imagem com atenção. Leia o texto que estiver visível, identifique os elementos importantes e explique claramente o conteúdo. Se for um documento, extraia as informações relevantes.";

  if (!/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(image)) {
    throw new Error("A imagem enviada não está num formato suportado.");
  }

  if (image.length > 20 * 1024 * 1024) {
    throw new Error("A imagem é demasiado grande. Reduza o tamanho e tente novamente.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content: "Você é Azny Gabriel, assistente virtual do Sr. Eduardo Ngongoyove Gabriel. Analise imagens com precisão. Leia documentos e textos visíveis sem inventar informações. Se algo estiver ilegível, diga claramente. Responda no idioma usado pelo cliente."
        },
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1800,
      top_p: 0.9,
      stream: false
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta inválida da análise de imagem: ${raw.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Erro de análise de imagem HTTP ${response.status}`);
  }

  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    throw new Error("A IA não conseguiu obter conteúdo legível da imagem.");
  }

  return text;
}

// ============================================================
// TRANSCRIÇÃO DE ÁUDIO — GROQ WHISPER
// ============================================================

async function transcribeAudio(env, request) {
  if (!env.GROQ_API_KEY) {
    throw new Error("O atendimento inteligente ainda não está configurado no Cloudflare: GROQ_API_KEY não foi encontrada.");
  }

  const incoming = await request.formData();
  const audio = incoming.get("audio");

  if (!(audio instanceof File)) {
    throw new Error("Áudio não encontrado.");
  }

  if (audio.size > 12 * 1024 * 1024) {
    throw new Error("O áudio é demasiado grande.");
  }

  const form = new FormData();
  form.append("file", audio, audio.name || "voice.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append("language", "pt");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: form
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta inválida da transcrição: ${raw.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Erro de transcrição HTTP ${response.status}`);
  }

  const transcript = String(data?.text || "").trim();

  if (!transcript) {
    throw new Error("Não foi possível compreender o conteúdo do áudio.");
  }

  return transcript;
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

  const documentContext =
    typeof body.document_context === "string"
      ? body.document_context.trim().slice(0, 70000)
      : "";

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

  const language = detectLanguage(message, history);
  const effectiveTitle = clientTitle || "Sr.";
  const localizedTitle = language === "en"
    ? (effectiveTitle === "Sra." ? "Ms." : "Mr.")
    : effectiveTitle;
  const formalName = `${localizedTitle} ${clientName}`;

  // ----------------------------------------------------------
  // SYSTEM PROMPT
  // ----------------------------------------------------------

  let systemPrompt =
    buildSystemPrompt({
      clientName,
      clientTitle: localizedTitle,
      context,
      language
    });

  if (documentContext) {
    systemPrompt += `

------------------------------------------------------------
DOCUMENTO / IMAGEM ATUAL DO CLIENTE
------------------------------------------------------------

O cliente enviou um ficheiro que deve permanecer no contexto
da conversa. Use o conteúdo abaixo para responder às perguntas
seguintes sobre esse mesmo ficheiro. Não invente dados que não
estejam no conteúdo. Se a informação não estiver disponível,
diga isso claramente.

${documentContext}
`;
  }

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
          "Peço desculpa, não foi possível processar a sua mensagem neste momento. Por favor, tente novamente."
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
  const record = {
    sessionId,
    clientName: String(c.nome || "").slice(0,120),
    phone: String(c.telefone || "").slice(0,40),
    email: String(c.email || "").slice(0,160),
    service: String(c.servico || "").slice(0,200),
    request: String(c.pedido || "").slice(0,1000),
    status: body?.status === "human" ? "human" : "bot",
    updatedAt: new Date().toISOString(),
    history
  };
  await env.CONVERSATIONS.put("conversation:" + sessionId, JSON.stringify(record));
  return json({ok:true,saved:true});
}

async function handleAdminConversations(request, env) {
  if (!(await requireAdmin(request, env))) return json({ok:false,error:"Não autorizado."},401);
  const listing = await env.CONVERSATIONS.list({prefix:"conversation:",limit:100});
  const keys = listing.keys.map(x => x.name);
  const values = keys.length ? await env.CONVERSATIONS.get(keys, "json") : new Map();
  const conversations = [];
  for (const key of keys) {
    const item = values.get(key);
    if (item) conversations.push(item);
  }
  conversations.sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return json({ok:true,conversations,listComplete:listing.list_complete});
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
      ADMIN_PANEL_KEY:
        (typeof globalThis.ADMIN_PANEL_KEY === "string" && globalThis.ADMIN_PANEL_KEY.trim())
          ? globalThis.ADMIN_PANEL_KEY.trim()
          : undefined,
      CONVERSATIONS:
        globalThis.CONVERSATIONS || undefined,
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
    // PAINEL ADMINISTRATIVO
    // --------------------------------------------------------
    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      return handleAdminLogin(request, env);
    }
    if (url.pathname === "/api/conversations/save" && request.method === "POST") {
      return handleSaveConversation(request, env);
    }
    if (url.pathname === "/api/admin/conversations" && request.method === "GET") {
      return handleAdminConversations(request, env);
    }
    if (url.pathname.startsWith("/api/admin/conversations/") && request.method === "GET") {
      return handleAdminConversation(request, env, decodeURIComponent(url.pathname.slice("/api/admin/conversations/".length)));
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
    // ANÁLISE DE IMAGEM / DOCUMENTO VISUAL
    // --------------------------------------------------------

    if (
      url.pathname === "/api/analyze-image" &&
      request.method === "POST"
    ) {
      try {
        const payload = await request.json();
        const analysis = await analyzeImage(env, payload);
        return json({
          ok: true,
          analysis
        });
      } catch (error) {
        console.error("Erro de análise de imagem:", error);
        return json({
          ok: false,
          error: "Peço desculpa, não foi possível analisar a imagem neste momento. Por favor, tente novamente."
        }, 502);
      }
    }

    // --------------------------------------------------------
    // TRANSCRIÇÃO DE ÁUDIO
    // --------------------------------------------------------

    if (
      url.pathname === "/api/transcribe" &&
      request.method === "POST"
    ) {
      try {
        const transcript = await transcribeAudio(env, request);
        return json({
          ok: true,
          transcript
        });
      } catch (error) {
        console.error("Erro de transcrição:", error);
        return json({
          ok: false,
          error: "Peço desculpa, não foi possível processar a mensagem de voz neste momento. Por favor, tente novamente."
        }, 502);
      }
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
