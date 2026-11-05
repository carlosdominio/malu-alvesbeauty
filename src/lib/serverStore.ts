import fs from "fs";
import path from "path";
import {
  Agendamento,
  BarbeariaConfig,
  BloqueioAgenda,
  Cliente,
  ExpedienteDia,
  FormaPagamento,
  Servico,
  StatusAgendamento,
} from "@/types";
import {
  agendamentosIniciais,
  clientesIniciais,
  configInicial,
  expedienteInicial,
  servicosIniciais,
} from "./mockData";

interface DBData {
  config: BarbeariaConfig;
  servicos: Servico[];
  expediente: ExpedienteDia[];
  agendamentos: Agendamento[];
  clientes: Cliente[];
  bloqueios: BloqueioAgenda[];
}

const DB_PATH = path.join(process.cwd(), "data_storage.json");

function somarMinutosDataHora(dataHoraInicio: string, duracaoMinutos?: number): string {
  const [dataPart, horaPart] = dataHoraInicio.split("T");
  if (!horaPart) return dataHoraInicio;
  const [h, m] = horaPart.slice(0, 5).split(":").map(Number);
  const dur = Number(duracaoMinutos) || 30;
  const totalMin = h * 60 + m + dur;
  const fimH = Math.floor(totalMin / 60);
  const fimM = totalMin % 60;
  return `${dataPart}T${String(fimH).padStart(2, "0")}:${String(fimM).padStart(2, "0")}:00`;
}

function readDB(): DBData {
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Erro ao ler data_storage.json:", err);
  }

  const initialDB: DBData = {
    config: configInicial,
    servicos: servicosIniciais,
    expediente: expedienteInicial,
    agendamentos: agendamentosIniciais,
    clientes: clientesIniciais,
    bloqueios: [],
  };

  writeDB(initialDB);
  return initialDB;
}

function writeDB(data: DBData): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar data_storage.json:", err);
  }
}

export const ServerStore = {
  getConfig(): BarbeariaConfig {
    const db = readDB();
    return db.config;
  },

  updateConfig(config: Partial<BarbeariaConfig>): BarbeariaConfig {
    const db = readDB();
    db.config = { ...db.config, ...config };
    writeDB(db);
    return db.config;
  },

  getServicos(): Servico[] {
    const db = readDB();
    return db.servicos;
  },

  getExpediente(): ExpedienteDia[] {
    const db = readDB();
    return db.expediente;
  },

  getBloqueios(): BloqueioAgenda[] {
    const db = readDB();
    return db.bloqueios;
  },

  addBloqueio(bloqueio: Omit<BloqueioAgenda, "id">): BloqueioAgenda {
    const db = readDB();
    const novo: BloqueioAgenda = {
      ...bloqueio,
      id: `blq-${Date.now()}`,
    };
    db.bloqueios.push(novo);
    writeDB(db);
    return novo;
  },

  getClientes(): Cliente[] {
    const db = readDB();
    return db.clientes.sort((a, b) => (b.total_visitas || 0) - (a.total_visitas || 0));
  },

  executarAutoLimpeza(dbParam?: DBData): boolean {
    const dados = dbParam || readDB();
    const diasLimite = dados.config.auto_limpeza_cancelados_dias ?? 7; // Padrão: 7 dias

    if (diasLimite <= 0) return false;

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasLimite);
    const dataLimiteIso = `${dataLimite.getFullYear()}-${String(dataLimite.getMonth() + 1).padStart(2, "0")}-${String(dataLimite.getDate()).padStart(2, "0")}`;

    const totalAntes = dados.agendamentos.length;
    dados.agendamentos = dados.agendamentos.filter((ag) => {
      const ehCanceladoOuFalta = ag.status === "CANCELADO" || ag.status === "FALTOU";
      if (!ehCanceladoOuFalta) return true;
      const dataAg = ag.horario_inicio.split("T")[0];
      return dataAg >= dataLimiteIso;
    });

    if (dados.agendamentos.length !== totalAntes) {
      writeDB(dados);
      console.log(`>>> [Auto-Limpeza] ${totalAntes - dados.agendamentos.length} cancelamentos/faltas antigos foram limpos automaticamente.`);
      return true;
    }
    return false;
  },

  getAgendamentos(dataFiltro?: string): Agendamento[] {
    this.executarAutoLimpeza();
    const db = readDB();
    let lista = db.agendamentos;
    if (dataFiltro) {
      lista = lista.filter((ag) => ag.horario_inicio.startsWith(dataFiltro));
    }
    return lista.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  },

  createAgendamento(params: {
    cliente_nome: string;
    cliente_telefone: string;
    servico: Servico;
    horario_inicio: string;
    origem?: "WEB" | "WHATSAPP" | "MANUAL";
    observacoes?: string;
  }): Agendamento {
    const db = readDB();
    const { cliente_nome, cliente_telefone, servico, horario_inicio, origem = "WHATSAPP", observacoes } = params;

    const horarioFim = somarMinutosDataHora(horario_inicio, servico.duracao_minutos);
    const telLimpo = cliente_telefone.replace(/\D/g, "");

    // Atualizar ou criar cliente no cadastro permanente
    const clienteIdx = db.clientes.findIndex((c) => c.telefone.replace(/\D/g, "") === telLimpo);
    let clienteId = `cli-${Date.now()}`;

    if (clienteIdx >= 0) {
      db.clientes[clienteIdx].nome = cliente_nome || db.clientes[clienteIdx].nome;
      db.clientes[clienteIdx].ultima_visita = horario_inicio;
      db.clientes[clienteIdx].ultimo_servico_id = servico.id;
      db.clientes[clienteIdx].ultimo_servico_nome = servico.titulo;
      clienteId = db.clientes[clienteIdx].id;
    } else {
      db.clientes.push({
        id: clienteId,
        nome: cliente_nome,
        telefone: telLimpo,
        ultimo_servico_id: servico.id,
        ultimo_servico_nome: servico.titulo,
        ultima_visita: horario_inicio,
        total_visitas: 0,
        total_gasto: 0,
        historico_visitas: [],
        created_at: new Date().toISOString(),
      });
    }

    const novoAgendamento: Agendamento = {
      id: `ag-${Date.now()}`,
      cliente_id: clienteId,
      cliente_nome,
      cliente_telefone: telLimpo,
      servico_id: servico.id,
      servico_titulo: servico.titulo,
      horario_inicio,
      horario_fim: horarioFim,
      duracao_minutos: servico.duracao_minutos,
      status: "CONFIRMADO",
      origem,
      valor_cobrado: servico.preco,
      observacoes,
      created_at: new Date().toISOString(),
    };

    db.agendamentos.push(novoAgendamento);
    writeDB(db);
    console.log(">>> [ServerStore] Agendamento salvo:", novoAgendamento.cliente_nome, novoAgendamento.horario_inicio);

    return novoAgendamento;
  },

  updateStatusAgendamento(id: string, status: StatusAgendamento, formaPagamento?: FormaPagamento): void {
    const db = readDB();
    const idx = db.agendamentos.findIndex((a) => a.id === id);
    if (idx >= 0) {
      const ag = db.agendamentos[idx];
      const statusAnterior = ag.status;
      ag.status = status;
      if (formaPagamento) {
        ag.forma_pagamento = formaPagamento;
      }

      // Se concluiu o atendimento, atualiza histórico permanente e fidelidade do cliente!
      if (status === "CONCLUIDO" && statusAnterior !== "CONCLUIDO") {
        const telLimpo = ag.cliente_telefone.replace(/\D/g, "");
        const clienteIdx = db.clientes.findIndex((c) => c.telefone.replace(/\D/g, "") === telLimpo);

        if (clienteIdx >= 0) {
          const cli = db.clientes[clienteIdx];
          cli.total_visitas = (cli.total_visitas || 0) + 1;
          cli.total_gasto = (cli.total_gasto || 0) + ag.valor_cobrado;
          cli.ultima_visita = ag.horario_inicio;

          if (!cli.historico_visitas) cli.historico_visitas = [];
          cli.historico_visitas.push({
            agendamento_id: ag.id,
            data_hora: ag.horario_inicio,
            servico_titulo: ag.servico_titulo,
            valor: ag.valor_cobrado,
            forma_pagamento: formaPagamento || "PIX",
          });
          console.log(`>>> [Fidelidade] Cliente ${cli.nome} atingiu ${cli.total_visitas} atendimentos concluídos!`);
        }
      }

      writeDB(db);
    }
  },

  limparAgendamentos(modo: "TODOS" | "CANCELADOS" | "TESTES" = "TODOS"): number {
    const db = readDB();
    const totalAnterior = db.agendamentos.length;

    if (modo === "CANCELADOS") {
      db.agendamentos = db.agendamentos.filter((a) => a.status !== "CANCELADO" && a.status !== "FALTOU");
    } else {
      // Limpar todos os agendamentos mantendo a estrutura
      db.agendamentos = [];
    }

    writeDB(db);
    const removidos = totalAnterior - db.agendamentos.length;
    console.log(`>>> [ServerStore] Limpeza de agendamentos (${modo}): ${removidos} agendamentos removidos.`);
    return removidos;
  },
};
