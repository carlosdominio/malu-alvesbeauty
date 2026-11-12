const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 3001;
const authDir = path.join(ROOT_DIR, "auth_info_baileys");
const dbPath = path.join(ROOT_DIR, "data_storage.json");

// Carregar variáveis de .env.local e .env de forma nativa e segura
const envPaths = [path.join(ROOT_DIR, ".env.local"), path.join(ROOT_DIR, ".env")];
for (const envFile of envPaths) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...v] = trimmed.split("=");
        const key = k.trim();
        const val = v.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_CONNECTION_URI;
if (!DATABASE_URL) {
  console.error(">>> [AVISO DE SEGURANÇA] DATABASE_URL não definida no .env.local!");
}

const VERCEL_API_URL = (
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

const RENDER_HEALTH_URL =
  process.env.RENDER_EXTERNAL_URL || "https://malu-alvesbeauty.onrender.com";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

module.exports = {
  ROOT_DIR,
  PORT,
  authDir,
  dbPath,
  DATABASE_URL,
  VERCEL_API_URL,
  RENDER_HEALTH_URL,
  sleep,
  formatarMoeda,
};
