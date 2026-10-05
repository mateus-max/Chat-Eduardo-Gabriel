import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "1mb" }));

/* =====================================================
   CORS
===================================================== */

app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


/* =====================================================
   FRONTEND
===================================================== */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const PORT =
  process.env.PORT || 3000;

const MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-6-astra";

const PRICE_PORTAL_URL =
  process.env.PRICE_PORTAL_URL ||
  "https://suporte-on-line.web.app";


/* =====================================================
   OPENAI
===================================================== */

let openai = null;

if (process.env.OPENAI_API_KEY) {

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

} else {

  console.warn(
    "AVISO: OPENAI_API_KEY não está configurada."
  );

}


/* =====================================================
   SESSÕES
===================================================== */

const sessions = new Map();


/* =====================================================
   BASE DE CONHECIMENTO
===================================================== */

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


  /* ===================================================
     CONSULTAS MÉDICAS NA NAMÍBIA
  =================================================== */

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


  /* ===================================================
     PREÇOS
  =================================================== */

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


/* =====================================================
   INSTRUÇÕES DO ASSISTENTE
===================================================== */

const INSTRUCTIONS = `

Você é o Assistente Virtual do Eduardo Ngongoyove Gabriel.

Você atende clientes de forma natural, cordial, inteligente e contextual.

Você NÃO é o próprio Eduardo. Você é o assistente virtual dele.


COMPORTAMENTO:

1. Não repita a saudação em todas as mensagens.

2. Mantenha o contexto da conversa.

3. Se o cliente perguntar "quanto custa?", entenda a que serviço ele está se referindo com base na conversa anterior.

4. Se o cliente perguntar "e no hospital público?", entenda que ele está falando das consultas médicas na Namíbia quando esse for o assunto anterior.

5. Se o cliente mudar de assunto, acompanhe naturalmente.

6. Não obrigue o cliente a utilizar botões.

7. O cliente pode escrever livremente.

8. Não peça novamente informações que o cliente já forneceu.

9. Não invente preços.

10. Não invente instituições.

11. Não invente serviços.

12. Quando o preço depender de informações adicionais, peça somente os dados necessários.

13. Quando uma informação não estiver disponível, diga que precisa ser confirmada.

14. O portal de consulta de preços é:

${PRICE_PORTAL_URL}

15. Quando for útil, indique ao cliente o portal de consulta de preços.

16. Em assuntos médicos, forneça somente informações administrativas e de atendimento disponíveis na base. Não faça diagnóstico.

17. Não faça prescrição médica.

18. Não diga que você é médico.

19. Quando for necessário atendimento humano, informe que Eduardo poderá assumir o atendimento.

20. Seja natural. Evite respostas robotizadas.

21. Não repita "Pode explicar um pouco mais" quando a pergunta do cliente já for clara.

22. Se o cliente disser "Bom dia", responda naturalmente, por exemplo:
"Bom dia! 👋 Como posso ajudar?"

23. Se o cliente perguntar algo específico, responda diretamente.

24. Se o cliente disser:
"Quero saber como funcionam as consultas médicas na Namíbia",
explique o processo e pergunte somente o que for necessário.

25. Se o cliente perguntar:
"Quanto custa a consulta?",
use o contexto da conversa para identificar se está falando de consulta médica, website, música ou outro serviço.

26. Nunca reinicie a conversa sem necessidade.


IDENTIDADE:

Nome:
Eduardo Ngongoyove Gabriel

Nome do atendimento:
Assistente Virtual — Eduardo Gabriel

O assistente pode dizer:

"Sou o Assistente Virtual do Eduardo Gabriel."


BASE DE INFORMAÇÕES:

Use exclusivamente as informações fornecidas na base abaixo para os serviços e preços de Eduardo.

`;


/* =====================================================
   CRIAR PROMPT
===================================================== */

function makePrompt(context) {

  return (
    INSTRUCTIONS +
    "\n\n" +
    "BASE DE CONHECIMENTO:\n" +
    JSON.stringify(
      KNOWLEDGE,
      null,
      2
    ) +
    "\n\n" +
    "CONTEXTO DO CLIENTE:\n" +
    JSON.stringify(
      context || {},
      null,
      2
    )
  );

}


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      model: MODEL,

      openai_configured:
        Boolean(openai)

    });

  }
);


/* =====================================================
   CHAT
===================================================== */

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      const {
        session_id,
        message,
        context = {}
      } = req.body || {};


      /* -----------------------------------------------
         VALIDAR MENSAGEM
      ------------------------------------------------ */

      if (
        !message ||
        typeof message !== "string"
      ) {

        return res.status(400).json({

          error:
            "Mensagem inválida."

        });

      }


      /* -----------------------------------------------
         VERIFICAR OPENAI
      ------------------------------------------------ */

      if (!openai) {

        return res.status(503).json({

          error:
            "OPENAI_API_KEY não configurada no servidor."

        });

      }


      /* -----------------------------------------------
         SESSÃO
      ------------------------------------------------ */

      const sessionId =
        String(
          session_id ||
          crypto.randomUUID()
        );


      const previousResponse =
        sessions.get(
          sessionId
        );


      /* -----------------------------------------------
         PEDIDO À OPENAI
      ------------------------------------------------ */

      const request = {

        model: MODEL,

        instructions:
          makePrompt(context),

        input: message,

        store: true

      };


      if (previousResponse) {

        request.previous_response_id =
          previousResponse;

      }


      const response =
        await openai.responses.create(
          request
        );


      /* -----------------------------------------------
         GUARDAR CONTEXTO
      ------------------------------------------------ */

      sessions.set(
        sessionId,
        response.id
      );


      /* -----------------------------------------------
         RESPOSTA
      ------------------------------------------------ */

      const reply =
        response.output_text ||
        "Desculpe, não consegui preparar a resposta neste momento.";


      /* -----------------------------------------------
         BOTÕES INTELIGENTES
      ------------------------------------------------ */

      const lower =
        reply.toLowerCase();


      let quickReplies = [];


      if (
        lower.includes("namíbia") ||
        lower.includes("oshakati") ||
        lower.includes("ongwediva") ||
        lower.includes("ondangwa") ||
        lower.includes("hospital") ||
        lower.includes("clínica")
      ) {

        quickReplies = [

          "🏥 Hospital público",

          "🏨 Clínica privada",

          "📍 Oshakati",

          "📍 Ongwediva",

          "📍 Ondangwa",

          "💰 Quanto custa?"

        ];

      }

      else if (
        lower.includes("website") ||
        lower.includes("site")
      ) {

        quickReplies = [

          "💰 Quanto custa?",

          "🌐 Quero criar um website",

          "📋 Consultar preços",

          "👤 Falar com Eduardo"

        ];

      }

      else if (
        lower.includes("música") ||
        lower.includes("piano") ||
        lower.includes("solfejo")
      ) {

        quickReplies = [

          "🎵 Curso de Música",

          "💰 Quanto custa?",

          "🎼 Composição e Arranjos",

          "👤 Falar com Eduardo"

        ];

      }

      else if (
        lower.includes("preço") ||
        lower.includes("valor") ||
        lower.includes("kz") ||
        lower.includes("custa")
      ) {

        quickReplies = [

          "💻 Website",

          "💻 Software",

          "📱 Redes sociais",

          "🎵 Curso de Música",

          "🏥 Consultas na Namíbia"

        ];

      }

      else {

        quickReplies = [

          "🏥 Consultas na Namíbia",

          "💰 Consultar preços",

          "💻 Websites",

          "📱 Redes sociais",

          "🎵 Música",

          "👤 Falar com Eduardo"

        ];

      }


      /* -----------------------------------------------
         CONTEXTO VISUAL
      ------------------------------------------------ */

      const contextLabel =
        context.servico
          ? `Atendimento: ${context.servico}`
          : "Conversa com Assistente Virtual";


      /* -----------------------------------------------
         ENVIAR AO FRONTEND
      ------------------------------------------------ */

      return res.json({

        reply,

        quick_replies:
          quickReplies,

        context_label:
          contextLabel,

        session_id:
          sessionId

      });

    }


    catch (error) {

      console.error(
        "ERRO OPENAI:",
        error
      );


      const status =
        Number(error?.status) || 500;


      let message =
        "Não foi possível processar a mensagem neste momento.";


      if (status === 401) {

        message =
          "A chave da OpenAI não é válida ou não foi configurada corretamente.";

      }


      else if (status === 403) {

        message =
          "O projeto da OpenAI não tem autorização para utilizar este recurso.";

      }


      else if (status === 404) {

        message =
          `O modelo ${MODEL} não está disponível para este projeto.`;

      }


      else if (status === 429) {

        message =
          "A OpenAI informou que o limite de utilização foi atingido.";

      }


      console.error(
        "Mensagem:",
        message
      );


      return res.status(
        status >= 400 &&
        status < 600
          ? status
          : 500
      ).json({

        error:
          message

      });

    }

  }
);


/* =====================================================
   FALLBACK DO FRONTEND
===================================================== */

app.use(
  (req, res, next) => {

    if (
      req.method !== "GET"
    ) {

      return next();

    }


    res.sendFile(

      path.join(
        __dirname,
        "public",
        "index.html"
      )

    );

  }
);


/* =====================================================
   INICIAR SERVIDOR
===================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `Eduardo Chat ativo na porta ${PORT}`
    );

  }
);
