const fs = require("fs");
const { dbPath, VERCEL_API_URL, formatarMoeda } = require("./config");

let remoteConfigCache = null;

async function atualizarConfigRemoto() {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/config`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        remoteConfigCache = data;
        try {
          if (fs.existsSync(dbPath)) {
            const raw = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
            raw.config = { ...(raw.config || {}), ...data };
            fs.writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf-8");
          }
        } catch (_) {}
      }
    }
  } catch (err) {}
}

atualizarConfigRemoto();
setInterval(atualizarConfigRemoto, 30 * 1000);

function lerBancoCentral() {
  let data = { servicos: [], agendamentos: [], clientes: [], config: {} };
  try {
    if (fs.existsSync(dbPath)) {
      data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    }
  } catch (e) {
    console.error("Erro ao ler data_storage.json:", e);
  }

  if (remoteConfigCache) {
    data.config = {
      ...(data.config || {}),
      ...remoteConfigCache,
    };
  }

  if (
    data.config &&
    typeof data.config.mensagem_boas_vindas === "string" &&
    data.config.mensagem_boas_vindas.trim().startsWith("{")
  ) {
    try {
      const extra = JSON.parse(data.config.mensagem_boas_vindas);
      data.config = {
        ...data.config,
        ...extra,
        mensagem_boas_vindas: typeof extra.bio === "string" ? extra.bio : data.config.mensagem_boas_vindas,
      };
    } catch (e) {}
  }

  return data;
}

const servicosPadrao = [
  { id: "serv-1", titulo: "Design de Sobrancelhas Simples", preco: 30.0, duracao_minutos: 30 },
  { id: "serv-2", titulo: "Design com Henna", preco: 45.0, duracao_minutos: 45 },
  { id: "serv-3", titulo: "Brow Lamination", preco: 80.0, duracao_minutos: 50 },
  { id: "serv-4", titulo: "Epilação Facial / Buço", preco: 20.0, duracao_minutos: 15 },
];

function obterServicosAtivos() {
  const db = lerBancoCentral();
  if (db.servicos && db.servicos.length > 0) {
    return db.servicos.filter((s) => s.ativo !== false);
  }
  return servicosPadrao;
}

function obterCumprimentoHorario() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function formatarMensagemZap(template, vars) {
  let resultado = template;
  const varsCompletas = {
    cumprimento: obterCumprimentoHorario(),
    ...vars,
  };
  for (const chave in varsCompletas) {
    const val =
      varsCompletas[chave] !== undefined && varsCompletas[chave] !== null
        ? String(varsCompletas[chave])
        : "";
    resultado = resultado.split(`{${chave}}`).join(val);
  }
  return resultado;
}

function formatarListaServicosZap(servicos) {
  return servicos
    .map((s, idx) => {
      const precoOriginal = formatarMoeda(s.preco);
      if (s.em_promocao && s.preco_promocional && s.preco_promocional < s.preco) {
        const precoPromo = formatarMoeda(s.preco_promocional);
        return `*${idx + 1}* - ${s.titulo} (~${precoOriginal}~ 🔥 *${precoPromo}* PROMOÇÃO! - ${s.duracao_minutos}min)`;
      }
      return `*${idx + 1}* - ${s.titulo} (${precoOriginal} - ${s.duracao_minutos}min)`;
    })
    .join("\n");
}

function verificarRespostaCustomizada(textoLimpo, config) {
  const customizadas = config?.mensagens_zap?.respostas_personalizadas;
  if (!customizadas || !Array.isArray(customizadas)) return null;

  for (const resp of customizadas) {
    if (resp.ativo === false) continue;

    if (resp.opcao_numero && textoLimpo === resp.opcao_numero.trim().toLowerCase()) {
      return resp;
    }

    if (resp.palavras_chave) {
      const palavras = resp.palavras_chave
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

      if (palavras.some((p) => textoLimpo.includes(p))) {
        return resp;
      }
    }

    if (resp.titulo && textoLimpo.includes(resp.titulo.toLowerCase())) {
      return resp;
    }
  }

  return null;
}

function buscarClientePorTelefone(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.clientes?.find((c) => {
    const cTel = c.telefone.replace(/\D/g, "");
    return cTel === tel || cTel === tel.slice(2) || `55${cTel}` === tel;
  });
}

function buscarAgendamentoAtivo(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

  return db.agendamentos?.find((ag) => {
    if (ag.status !== "CONFIRMADO" && ag.status !== "AGUARDANDO_SINAL") return false;
    const agTel = (ag.cliente_telefone || "").replace(/\D/g, "");
    const mesmoTel = agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
    if (!mesmoTel) return false;
    const agData = ag.horario_inicio.split("T")[0];
    return agData >= hojeStr;
  });
}

function buscarAgendamentoAguardandoSinal(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.agendamentos?.find((ag) => {
    if (ag.status !== "AGUARDANDO_SINAL") return false;
    const agTel = (ag.cliente_telefone || "").replace(/\D/g, "");
    return agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
  });
}

function gerarDiasDisponiveis() {
  const dias = [];
  const hoje = new Date();

  for (let i = 0; i < 4; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);

    const diaSemanaNum = d.getDay();
    if (diaSemanaNum === 0 && i > 0) {
      continue;
    }

    const isoData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nomeFormatado = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    const rotulo = i === 0 ? `Hoje (${nomeFormatado})` : i === 1 ? `Amanhã (${nomeFormatado})` : nomeFormatado;

    dias.push({ isoData, rotulo, diaSemanaNum });
  }

  return dias;
}

function calcularHorariosParaData(dataIso) {
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const ehHoje = dataIso === hojeStr;

  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();
  const minutoAtualTotal = horaAtual * 60 + minutoAtual;

  const db = lerBancoCentral();
  const agendamentosDoDia = (db.agendamentos || []).filter(
    (a) => a.status !== "CANCELADO" && a.horario_inicio.startsWith(dataIso)
  );

  const horariosOcupados = agendamentosDoDia.map((a) => {
    return a.horario_inicio.split("T")[1]?.slice(0, 5) || "00:00";
  });

  const horariosDisponiveis = [];
  const inicioExpediente = 9 * 60;
  const fimExpediente = 20 * 60;

  for (let min = inicioExpediente; min + 30 <= fimExpediente; min += 30) {
    if (min >= 12 * 60 && min < 13 * 60) continue;
    if (ehHoje && min <= minutoAtualTotal + 15) continue;

    const h = Math.floor(min / 60);
    const m = min % 60;
    const horaFormatada = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    if (!horariosOcupados.includes(horaFormatada)) {
      horariosDisponiveis.push(horaFormatada);
    }
  }

  if (horariosDisponiveis.length === 0) {
    if (ehHoje) return [];
    return ["09:00", "09:45", "10:30", "11:15", "14:00", "15:00", "16:30", "17:15"];
  }

  return horariosDisponiveis.slice(0, 8);
}

async function salvarAgendamentoNoPainel(dados) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    console.log(`>>> [Sync Painel Admin] Status da gravação: ${res.status}`);
  } catch (err) {
    console.error("Erro ao sincronizar agendamento:", err.message);
  }
}

async function cancelarAgendamentoNoPainel(id) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELADO" }),
    });
    console.log(`>>> [Cancelamento via Zap] Status: ${res.status}`);
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err.message);
  }
}

async function aprovarComprovanteCliente(telefoneLimpo) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`);
    if (res.ok) {
      const ags = await res.json();
      const tel = String(telefoneLimpo || "").replace(/\D/g, "");
      const pendente = (ags || []).find((a) => {
        if (a.status !== "AGUARDANDO_SINAL") return false;
        const aTel = String(a.cliente_telefone || "").replace(/\D/g, "");
        return aTel === tel || aTel === tel.slice(2) || `55${aTel}` === tel;
      });
      if (pendente) {
        await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pendente.id,
            status: "CONFIRMADO",
            comprovante_recebido: true,
            forma_pagamento: "PIX",
          }),
        });
        console.log(`>>> [Comprovante] Agendamento ${pendente.id} aprovado com sucesso via WhatsApp!`);
        return pendente;
      }
    }
  } catch (e) {
    console.error("Erro ao aprovar comprovante via API:", e.message);
  }
  return null;
}

async function verificarSeHorarioLivre(dataHoraIso) {
  if (!dataHoraIso) return false;
  try {
    let ags = [];
    try {
      const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`);
      if (res.ok) {
        ags = await res.json();
      }
    } catch (e) {}

    if (!ags || ags.length === 0) {
      const db = lerBancoCentral();
      ags = db.agendamentos || [];
    }

    const agora = new Date();
    const dataHoraAlvo = new Date(dataHoraIso);
    if (dataHoraAlvo.getTime() <= agora.getTime()) {
      return false;
    }

    const ocupado = ags.some((a) => {
      if (a.status === "CANCELADO") return false;
      return a.horario_inicio === dataHoraIso || a.horario_inicio.startsWith(dataHoraIso.slice(0, 16));
    });

    return !ocupado;
  } catch (err) {
    console.error("Erro ao verificar disponibilidade do horário:", err);
    return false;
  }
}

module.exports = {
  atualizarConfigRemoto,
  lerBancoCentral,
  obterServicosAtivos,
  obterCumprimentoHorario,
  formatarMensagemZap,
  formatarListaServicosZap,
  verificarRespostaCustomizada,
  buscarClientePorTelefone,
  buscarAgendamentoAtivo,
  buscarAgendamentoAguardandoSinal,
  gerarDiasDisponiveis,
  calcularHorariosParaData,
  salvarAgendamentoNoPainel,
  cancelarAgendamentoNoPainel,
  aprovarComprovanteCliente,
  verificarSeHorarioLivre,
};
