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

// Permite comunicação entre o frontend e o backend
app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
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

// Servir os arquivos do frontend
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

const MODEL =
  process.env.OPENAI_MODEL || "gpt-6-astra";

const PRICE_PORTAL_URL =
  process.env.PRICE_PORTAL_URL ||
  "https://suporte-on-line.web.app";

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY não está definida. O chat inteligente não funcionará até configurar a chave."
  );
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;


// =====================================================
// SESSÕES
// =====================================================

const sessions = new Map();


// =====================================================
// BASE DE CONHECIMENTO DO EDUARDO
// =====================================================

const KNOWLEDGE = {

  identity:
    "Eduardo Ngongoyove Gabriel oferece serviços de tecnologia/IT, websites, marketing digital, design, tradução/interpretação, cursos de inglês e música, composição/arranjos, armazenamento musical DNAC e soluções Angola ↔ Namíbia.",

  website:
    "Criação de Websites: websites institucionais, portfólios, landing pages e plataformas personalizadas. A base do projeto indica cotação conforme o projeto e, no portal de preços, valores dependentes do porte da empresa. Não inventar uma cotação se os dados necessários não forem informados.",

  it:
    "Tecnologia & IT: soluções digitais, sistemas, organização de dados e apoio tecnológico. Cotação conforme o serviço/configuração.",

  translation:
    "Tradução & Interpretação: Português ↔ Inglês para documentos, negócios, reuniões e comunicação. O índice inicial indica 10.000 Kz conforme a tabela de serviços disponível no atendimento.",

  sworn:
    "Tradução Juramentada: tradução oficial para documentos e processos. Confirmar o documento e a cotação aplicável.",

  marketing:
    "Marketing Digital: presença digital, conteúdos, identidade e estratégias. O portal indica gestão de redes sociais por 35.000 Kz/mês.",

  design:
    "Design Gráfico: cartazes, flyers, apresentações, identidade visual e materiais digitais. Preço conforme o material.",

  education:
    "Consultoria Educacional: orientação, materiais educativos e apoio a projetos de formação. Sob consulta.",

  english:
    "Curso de Inglês: British English 100% online. Segunda a sexta às 10h, 14h ou 22h; quarta-feira dedicada à conversação; inclui materiais e acompanhamento. O índice consultado não define preço nesta página.",

  music:
    "Curso de Música: piano/teclado, solfejo, leitura de partituras e prática musical. 10.000 Kz/mês; promoção inicial 8.000 Kz.",

  dnac:
    "Armazenamento Musical DNAC: organização de partituras, coletâneas e músicas em Português e Umbundu, com visualização e exportação. Sob consulta.",

  composition:
    "Composição & Arranjos: criação, organização e preparação de partituras para corais, igrejas, grupos musicais e projetos educativos. Sob consulta conforme a obra/arranjo.",

  angola_namibia:
    "Angola ↔ Namíbia: soluções e serviços transfronteiriços. O preço depende do serviço.",


  // ===================================================
  // CONSULTAS MÉDICAS NA NAMÍBIA
  // ===================================================

  medical: {

    general:
      "Consultas médicas na Namíbia: o portal apresenta opções em Oshakati, Ongwediva e Ondangwa. Oshakati apresenta hospital público/estatal e clínica privada; Ongwediva apresenta MediPark como clínica privada; Ondangwa apresenta clínica privada.",

    public:
      "Fluxo de atendimento público
