/* =========================================================
   CHAT VIRTUAL — EDUARDO GABRIEL
   CLOUDFLARE WORKERS + GEMINI
========================================================= */

const MODEL = "gemini-3.8-flash";

const PRICE_PORTAL_URL =
  "https://suporte-on-line.web.app";

/* =========================================================
   CORS
========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders()
      }
    }
  );
}

/* =========================================================
   BASE DE CONHECIMENTO
========================================================= */

const KNOWLEDGE = {

  identity:
    "Eduardo Ngongoyove Gabriel oferece serviços de tecnologia/IT, criação de websites, marketing digital, design gráfico, tradução e interpretação, tradução juramentada, cursos de inglês e música, composição e arranjos, armazenamento musical DNAC e soluções relacionadas entre Angola e Namíbia.",

  website:
    "Criação de Websites: websites institucionais, portfólios, landing pages e plataformas personalizadas. O preço depende do projeto e dos dados necessários.",

  it:
    "Tecnologia & IT: soluções digitais, sistemas, organização de dados e apoio tecnológico. O preço depende do serviço solicitado.",

  translation:
    "Tradução & Interpretação: Português ↔ Inglês para documentos, negócios, reuniões e comunicação. A tabela inicial indica 10.000 Kz conforme o atendimento.",

  sworn:
    "Tradução Juramentada: tradução oficial para documentos e processos. É necessário analisar o documento para confirmar o atendimento e o preço.",

  marketing:
    "Marketing Digital: presença digital, conteúdos, identidade e estratégias para negócios. A informação disponível indica gestão de redes sociais por 35.000 Kz/mês.",

  design:
    "Design Gráfico: cartazes, flyers, apresentações, identidade visual e materiais digitais. O preço depende do material solicitado.",

  education:
    "Consultoria Educacional: orientação, materiais educativos e apoio a projetos de formação. Preço sob consulta.",

  english:
    "Curso de Inglês: British English 100% online. Horários de segunda a sexta às 10h, 14h ou 22h. Quarta-feira é dedicada à conversação. Inclui materiais e acompanhamento.",

  music:
    "Curso de Música: piano/teclado, solfejo, leitura de partituras e prática musical. Preço: 10.000 Kz por mês. Promoção inicial: 8.000 Kz.",

  dnac:
    "Armazenamento Musical DNAC: organização de partituras, coletâneas e músicas em Português e Umbundu, com visualização e exportação. Preço sob consulta.",

  composition:
    "Composição & Arranjos: criação, organização e preparação de partituras para corais, igrejas, grupos musicais e projetos educativos. Preço sob consulta conforme a obra ou arranjo.",

  angola_namibia:
    "Angola ↔ Namíbia: soluções e serviços transfronteiriços. O preço depende do serviço solicitado.",

  medical: {

    general:
      "Consultas médicas na Namíbia: o portal apresenta opções em Oshakati, Ongwediva e Ondangwa. Oshakati apresenta hospital público/estatal e clínica privada; Ongwediva apresenta MediPark como clínica privada; Ondangwa apresenta clínica privada.",

    public:
      "Fluxo de atendimento público indicado no portal: cartão de atendimento 150 NAD, aproximadamente 9.000 Kz, peso e triagem, atendimento de enfermagem, testes ou exames prioritários, encaminhamento ao doutor quando necessário, avaliação médica, exames quando indicados, retorno após resultados e prescrição ou orientação. Exames podem ter custos próprios.",

    private:
      "Atendimento privado: consulta paga. O valor depende da clínica, médico e especialidade. A informação disponível indica consultas a partir de 350 NAD, aproximadamente 22.000 a 23.000 Kz, com exames cobrados à parte.",

    oshakati:
      "Oshakati: Hospital Geral do Estado/hospital público e clínica privada de Oshakati.",

    ongwediva:
      "Ongwediva: MediPark, clínica privada.",

    ondangwa:
      "Ondangwa: clínica privada."
  },

  prices: {

    website:
      "Criação de website: pequena empresa 80.000 Kz; média 120.000 Kz; grande 200.000 Kz, conforme o projeto e porte.",

    software:
      "Software: pequena empresa 190.000 Kz; média 300.000 Kz; grande 600.000 Kz, conforme o sistema.",

    social:
      "Gestão de Redes Sociais: 35.000 Kz por mês.",

    promotion:
      "Promoção de Página: 2.500 Kz por dia e 12.000 Kz por semana.",

    music:
      "Curso de Música: 10.000 Kz por mês; promoção inicial de 8.000 Kz."
  }
};

/* =========================================================
   INSTRUÇÕES DO ASSISTENTE
========================================================= */

const INSTRUCTIONS = `

Você é o Assistente Virtual do Eduardo Ngongoyove Gabriel.

Você atende clientes de forma natural, cordial, inteligente e contextual.

Você NÃO é o próprio Eduardo.
Você é o assistente virtual dele.

REGRAS:

1. Não repita a saudação em todas as mensagens.

2. Mantenha o contexto da conversa.

3. Se o cliente perguntar "quanto custa?", entenda a que serviço ele se refere pela conversa anterior.

4. Se perguntar "e no hospital público?", entenda o contexto das consultas médicas na Namíbia.

5. Se o cliente mudar de assunto, acompanhe naturalmente.

6. Não obrigue o cliente a utilizar botões.

7. O cliente pode escrever livremente.

8. Não peça novamente informações que o cliente já forneceu.

9. Não invente preços.

10. Não invente instituições.

11. Não invente serviços.

12. Quando o preço depender de informações adicionais, peça somente os dados necessários.

13. Quando uma informação não estiver disponível, diga que precisa ser confirmada.

14. Portal de consulta de preços:
${PRICE_PORTAL_URL}

15. Quando for útil, indique o portal.

16. Em assuntos médicos, forneça somente informações administrativas disponíveis na base.

17. Não faça diagnóstico.

18. Não faça prescrição médica.

19. Não diga que você é médico.

20. Quando for necessário atendimento humano, informe que Eduardo poderá assumir o atendimento.

21. Seja natural e evite respostas robotizadas.

22. Se a pergunta for clara, responda diretamente.

23. Nunca reinicie a conversa sem necessidade.

24. Se o cliente disser "Bom dia", responda naturalmente.

25. Se perguntar "e quanto custa?", "e o preço?", "quanto é?" ou "qual o valor?", use o assunto imediatamente anterior.

26. Não invente informações para preencher lacunas.

27. Quando apropriado, diga:
"Sou o Assistente Virtual do Eduardo Gabriel."

Use exclusivamente a base de conhecimento abaixo para serviços e preços.

BASE DE CONHECIMENTO:

${JSON.stringify(KNOWLEDGE, null, 2)}
`;

/* =========================================================
   RATE LIMIT
   Proteção básica contra abuso.
   10 mensagens por hora por visitante.
========================================================= */

const RATE_LIMIT = new Map();

function getClientId(request) {

  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown-client"
  );
}

function checkRateLimit(id) {

  const now = Date.now();
  const hour = 60 * 60 * 1000;

  const record = RATE_LIMIT.get(id);

  if (!record || now - record.start >= hour) {

    RATE_LIMIT.set(id, {
      start: now,
      count: 1
    });

    return {
      allowed: true,
      remaining: 9
    };
  }

  if (record.count >= 10) {

    return {
      allowed: false,
      remaining: 0
    };
  }

  record.count++;

  RATE_LIMIT.set(id, record);

  return {
    allowed: true,
    remaining: 10 - record.count
  };
}

/* =========================================================
   HISTÓRICO
========================================================= */

function buildContents(history, currentMessage) {

  const contents = [];

  if (Array.isArray(history)) {

    for (const item of history.slice(-20)) {

      if (!item || !item.text)
        continue;

      const role =
        item.type === "bot"
          ? "model"
          : "user";

      /*
        A API Gemini exige uma conversa válida.
        Ignoramos mensagens iniciais do modelo
        antes da primeira mensagem do cliente.
      */

      if (
        contents.length === 0 &&
        role === "model"
      ) {
        continue;
      }

      const last =
        contents[contents.length - 1];

      /*
        Se houver duas mensagens seguidas do
        mesmo papel, juntamos o texto.
      */

      if (last && last.role === role) {

        last.parts[0].text +=
          "\n" + String(item.text);

      } else {

        contents.push({

          role,

          parts: [
            {
              text: String(item.text)
            }
          ]

        });

      }
    }
  }

  /*
    Garante que a mensagem atual existe.
  */

  if (
    contents.length === 0 ||
    contents[contents.length - 1].role !== "user"
  ) {

    contents.push({

      role: "user",

      parts: [
        {
          text: String(currentMessage)
        }
      ]

    });
  }

  return contents;
}

/* =========================================================
   CHAMAR GEMINI
========================================================= */

async function askGemini(
  env,
  message,
  history,
  context
) {

  if (!env.GEMINI_API_KEY) {

    throw new Error(
      "GEMINI_API_KEY não configurada."
    );
  }

  const contents =
    buildContents(
      history,
      message
    );

  const contextText = context
    ? `

CONTEXTO DO ATENDIMENTO:

${JSON.stringify(context, null, 2)}
`
    : "";

  const response =
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "x-goog-api-key":
            env.GEMINI_API_KEY
        },

        body: JSON.stringify({

          system_instruction: {

            parts: [
              {
                text:
                  INSTRUCTIONS +
                  contextText
              }
            ]
          },

          contents,

          generationConfig: {

            thinkingConfig: {
              thinkingLevel: "low"
            },

            maxOutputTokens: 700
          }

        })

      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    const error =
      new Error(
        data?.error?.message ||
        "Erro na API Gemini."
      );

    error.status =
      response.status;

    throw error;
  }

  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!reply) {

    throw new Error(
      "O Gemini não retornou texto."
    );
  }

  return reply;
}

/* =========================================================
   BOTÕES INTELIGENTES
========================================================= */

function makeQuickReplies(reply) {

  const lower =
    reply.toLowerCase();

  if (
    lower.includes("namíbia") ||
    lower.includes("oshakati") ||
    lower.includes("ongwediva") ||
    lower.includes("ondangwa") ||
    lower.includes("hospital") ||
    lower.includes("clínica")
  ) {

    return [

      "🏥 Hospital público",
      "🏨 Clínica privada",
      "📍 Oshakati",
      "📍 Ongwediva",
      "📍 Ondangwa",
      "💰 Quanto custa?"

    ];
  }

  if (
    lower.includes("website") ||
    lower.includes("site")
  ) {

    return [

      "💰 Quanto custa?",
      "🌐 Quero criar um website",
      "📋 Consultar preços",
      "👤 Falar com Eduardo"

    ];
  }

  if (
    lower.includes("música") ||
    lower.includes("piano") ||
    lower.includes("solfejo")
  ) {

    return [

      "🎵 Curso de Música",
      "💰 Quanto custa?",
      "🎼 Composição e Arranjos",
      "👤 Falar com Eduardo"

    ];
  }

  if (
    lower.includes("preço") ||
    lower.includes("valor") ||
    lower.includes("kz") ||
    lower.includes("custa")
  ) {

    return [

      "💻 Website",
      "💻 Software",
      "📱 Redes sociais",
      "🎵 Curso de Música",
      "🏥 Consultas na Namíbia"

    ];
  }

  return [

    "🏥 Consultas na Namíbia",
    "💰 Consultar preços",
    "💻 Websites",
    "📱 Redes sociais",
    "🎵 Música",
    "👤 Falar com Eduardo"

  ];
}

/* =========================================================
   WORKER
========================================================= */

export default {

  async fetch(request, env) {

    /* -----------------------------------------------
       OPTIONS / CORS
    ------------------------------------------------ */

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders()
        }
      );
    }

    const url =
      new URL(request.url);

    /* -----------------------------------------------
       HEALTH
    ------------------------------------------------ */

    if (
      url.pathname === "/health" &&
      request.method === "GET"
    ) {

      return json({

        ok: true,

        service:
          "Chat Virtual — Eduardo Gabriel",

        model:
          MODEL,

        gemini_configured:
          Boolean(env.GEMINI_API_KEY)

      });
    }

    /* -----------------------------------------------
       CHAT
    ------------------------------------------------ */

    if (
      url.pathname === "/api/chat" &&
      request.method === "POST"
    ) {

      const clientId =
        getClientId(request);

      const limit =
        checkRateLimit(clientId);

      if (!limit.allowed) {

        return json(

          {
            error:
              "Atingiste temporariamente o limite de mensagens. Aguarda algum tempo antes de continuar."
          },

          429

        );
      }

      try {

        const body =
          await request.json();

        const message =
          typeof body?.message === "string"
            ? body.message.trim()
            : "";

        if (!message) {

          return json(

            {
              error:
                "Mensagem inválida."
            },

            400

          );
        }

        const history =
          Array.isArray(body?.history)
            ? body.history
            : [];

        const context =
          body?.context || {};

        const reply =
          await askGemini(

            env,

            message,

            history,

            context

          );

        const quickReplies =
          makeQuickReplies(reply);

        const contextLabel =
          context?.servico
            ? `Atendimento: ${context.servico}`
            : "Conversa com Assistente Virtual";

        return json({

          reply,

          quick_replies:
            quickReplies,

          context_label:
            contextLabel,

          remaining:
            limit.remaining

        });

      }

      catch (error) {

        console.error(
          "ERRO GEMINI:",
          error
        );

        const status =
          Number(error?.status) || 500;

        let message =
          "Não foi possível processar a mensagem neste momento.";

        if (status === 400) {

          message =
            "A solicitação enviada ao Gemini é inválida.";

        }

        else if (
          status === 401 ||
          status === 403
        ) {

          message =
            "A chave do Gemini não é válida ou não tem acesso a este recurso.";

        }

        else if (status === 404) {

          message =
            `O modelo ${MODEL} não está disponível para este projeto.`;

        }

        else if (status === 429) {

          message =
            "O limite de utilização do Gemini foi atingido temporariamente. Tente novamente mais tarde.";

        }

        return json(
          {
            error: message
          },
          status >= 400 && status < 600
            ? status
            : 500
        );
      }
    }

    /* -----------------------------------------------
       FRONTEND
    ------------------------------------------------ */

    if (
      request.method === "GET"
    ) {

      return env.ASSETS.fetch(
        request
      );
    }

    return json(
      {
        error:
          "Rota não encontrada."
      },
      404
    );
  }
};
