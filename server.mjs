import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =====================================================
   CONFIGURAÇÃO GERAL
===================================================== */

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
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const PRICE_PORTAL_URL =
  process.env.PRICE_PORTAL_URL ||
  "https://suporte-on-line.web.app";

/* =====================================================
   GEMINI API
===================================================== */

let gemini = null;

if (process.env.GEMINI_API_KEY) {

  gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  console.log(
    "Gemini API configurada."
  );

} else {

  console.warn(
    "AVISO: GEMINI_API_KEY não está configurada."
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

Você NÃO é o próprio Eduardo.
Você é o assistente virtual dele.


=====================================================
COMPORTAMENTO
=====================================================

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

16. Em assuntos médicos, forneça somente informações administrativas e de atendimento disponíveis na base.

17. Não faça diagnóstico.

18. Não faça prescrição médica.

19. Não diga que você é médico.

20. Quando for necessário atendimento humano, informe que Eduardo poderá assumir o atendimento.

21. Seja natural.

22. Evite respostas robotizadas.

23. Não repita "Pode explicar um pouco mais" quando a pergunta do cliente já for clara.

24. Se o cliente disser "Bom dia", responda naturalmente.

Exemplo:

"Bom dia! 👋 Como posso ajudar?"

25. Se o cliente perguntar algo específico, responda diretamente.

26. Se o cliente perguntar como funcionam as consultas médicas na Namíbia, explique o processo e pergunte somente o que for necessário.

27. Se o cliente perguntar "Quanto custa a consulta?", use o contexto da conversa para identificar se está falando de consulta médica, website, música ou outro serviço.

28. Nunca reinicie a conversa sem necessidade.

29. Não diga ao cliente que precisa repetir a pergunta se o contexto já estiver disponível.

30. Se o cliente perguntar "e quanto custa?", "e o preço?", "quanto é?", "qual o valor?", interprete a pergunta de acordo com o assunto imediatamente anterior.

31. Se o cliente perguntar sobre um serviço que não está na base, diga que a informação precisa ser confirmada.

32. Não invente informações para preencher lacunas.


=====================================================
IDENTIDADE
=====================================================

Nome:

Eduardo Ngongoyove Gabriel

Nome do atendimento:

Assistente Virtual — Eduardo Gabriel


O assistente pode dizer:

"Sou o Assistente Virtual do Eduardo Gabriel."


=====================================================
BASE DE INFORMAÇÕES
=====================================================

Use exclusivamente as informações fornecidas na base abaixo para os serviços e preços de Eduardo.

`;


/* =====================================================
   CRIAR INSTRUÇÃO COMPLETA
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

      gemini_configured:
        Boolean(gemini)

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
         VERIFICAR GEMINI
      ------------------------------------------------ */

      if (!gemini) {

        return res.status(503).json({

          error:
            "GEMINI_API_KEY não configurada no servidor."

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


      const previousInteraction =
        sessions.get(
          sessionId
        );


      /* -----------------------------------------------
         PEDIDO AO GEMINI
      ------------------------------------------------ */

      const request = {

        model: MODEL,

        system_instruction:
          makePrompt(context),

        input: message

      };


      /* -----------------------------------------------
         CONTINUAR CONVERSA
      ------------------------------------------------ */

      if (previousInteraction) {

        request.previous_interaction_id =
          previousInteraction;

      }


      /* -----------------------------------------------
         GERAR RESPOSTA
      ------------------------------------------------ */

      const interaction =
        await gemini.interactions.create(
          request
        );


      /* -----------------------------------------------
         GUARDAR SESSÃO
      ------------------------------------------------ */

      sessions.set(

        sessionId,

        interaction.id

      );


      /* -----------------------------------------------
         TEXTO DA RESPOSTA
      ------------------------------------------------ */

      const reply =

        interaction.output_text ||

        "Desculpe, não consegui preparar a resposta neste momento.";


      /* =================================================
         BOTÕES INTELIGENTES
      ================================================= */

      const lower =
        reply.toLowerCase();


      let quickReplies = [];


      /* -----------------------------------------------
         NAMÍBIA / HOSPITAL
      ------------------------------------------------ */

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


      /* -----------------------------------------------
         WEBSITE
      ------------------------------------------------ */

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


      /* -----------------------------------------------
         MÚSICA
      ------------------------------------------------ */

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


      /* -----------------------------------------------
         PREÇOS
      ------------------------------------------------ */

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


      /* -----------------------------------------------
         PADRÃO
      ------------------------------------------------ */

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


      /* =================================================
         CONTEXTO VISUAL
      ================================================= */

      const contextLabel =

        context.servico

          ? `Atendimento: ${context.servico}`

          : "Conversa com Assistente Virtual";


      /* =================================================
         RESPOSTA PARA O FRONTEND
      ================================================= */

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


    /* ===================================================
       ERROS
    =================================================== */

    catch (error) {

      console.error(
        "ERRO GEMINI:",
        error
      );


      const status =

        Number(error?.status) ||

        Number(error?.statusCode) ||

        Number(
          error?.response?.status
        ) ||

        500;


      let message =

        "Não foi possível processar a mensagem neste momento.";


      /* -----------------------------------------------
         ERRO 400
      ------------------------------------------------ */

      if (status === 400) {

        message =
          "A solicitação enviada ao Gemini é inválida.";

      }


      /* -----------------------------------------------
         ERRO 401 / 403
      ------------------------------------------------ */

      else if (

        status === 401 ||

        status === 403

      ) {

        message =
          "A chave do Gemini não é válida ou não tem acesso a este recurso.";

      }


      /* -----------------------------------------------
         ERRO 404
      ------------------------------------------------ */

      else if (status === 404) {

        message =
          `O modelo ${MODEL} não está disponível para este projeto.`;

      }


      /* -----------------------------------------------
         ERRO 429
      ------------------------------------------------ */

      else if (status === 429) {

        message =
          "O limite de utilização do Gemini foi atingido temporariamente. Tente novamente mais tarde.";

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

      `Eduardo Chat com Gemini ativo na porta ${PORT}`

    );

  }

);
