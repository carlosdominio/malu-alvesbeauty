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
import { EvolutionService } from "./evolutionService";
import { formatarMensagem, MENSAGENS_PADRAO } from "./whatsappTemplates";

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

let memoryDB: DBData | null = null;

function readDB(): DBData {
  if (memoryDB) {
    return memoryDB;
  }

  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, "utf-8");
      memoryDB = JSON.parse(content);
      return memoryDB!;
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

  memoryDB = initialDB;
  writeDB(initialDB);
  return initialDB;
}

function writeDB(data: DBData): void {
  memoryDB = data;

  // Na Vercel ou AWS Lambda o sistema de arquivos (/var/task) é estritamente somente leitura (EROFS)
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return;
  }

  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    if (errorObj?.code !== "EROFS") {
      console.error("Erro ao salvar data_storage.json:", errorObj?.message || err);
    }
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
    const incluirHistorico = dados.config.auto_limpeza_incluir_historico ?? false;

    if (diasLimite <= 0) return false;

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasLimite);
    const dataLimiteIso = `${dataLimite.getFullYear()}-${String(dataLimite.getMonth() + 1).padStart(2, "0")}-${String(dataLimite.getDate()).padStart(2, "0")}`;

    const totalAntes = dados.agendamentos.length;
    dados.agendamentos = dados.agendamentos.filter((ag) => {
      const dataAg = ag.horario_inicio.split("T")[0];
      const ehAntigo = dataAg < dataLimiteIso;

      // 1. Limpar cancelamentos e faltas mais antigos que o prazo configurado
      if (ag.status === "CANCELADO" || ag.status === "FALTOU") {
        return !ehAntigo;
      }

      // 2. Se a configuração de incluir histórico estiver ativa, limpa também atendimentos concluídos antigos
      if (incluirHistorico && ag.status === "CONCLUIDO") {
        return !ehAntigo;
      }

      return true;
    });

    // Se incluir histórico, limpa também visitas antigas do histórico dos clientes
    if (incluirHistorico && dados.clientes) {
      dados.clientes.forEach((cli) => {
        if (cli.historico_visitas && cli.historico_visitas.length > 0) {
          cli.historico_visitas = cli.historico_visitas.filter((h) => {
            const dataH = h.data_hora.split("T")[0];
            return dataH >= dataLimiteIso;
          });
        }
      });
    }

    if (dados.agendamentos.length !== totalAntes) {
      writeDB(dados);
      console.log(`>>> [Auto-Limpeza] ${totalAntes - dados.agendamentos.length} registros antigos (cancelamentos/faltas${incluirHistorico ? " e histórico" : ""}) foram limpos automaticamente.`);
      return true;
    }
    return false;
  },

  executarAutoExpiracaoSinal(dbParam?: DBData): boolean {
    const dados = dbParam || readDB();
    const autoLiberar = dados.config.auto_liberar_sinal_expirado ?? true;
    if (!autoLiberar) return false;

    const toleranciaMin = dados.config.tolerancia_auto_liberacao_minutos ?? 15;
    const agoraMs = Date.now();
    let alterado = false;

    dados.agendamentos.forEach((ag) => {
      if (ag.status === "AGUARDANDO_SINAL" && !ag.comprovante_recebido && ag.tempo_expiracao_sinal) {
        const tempoExpMs = new Date(ag.tempo_expiracao_sinal).getTime();
        const limiteComTolerancia = tempoExpMs + toleranciaMin * 60 * 1000;

        if (agoraMs > limiteComTolerancia) {
          ag.status = "CANCELADO";
          ag.observacoes = (ag.observacoes ? ag.observacoes + " • " : "") + "Cancelado automaticamente (sinal PIX expirado)";
          alterado = true;

          // Disparar cancelamento e notificação educada no WhatsApp via Evolution API
          try {
            const template = dados.config.mensagens_zap?.cancelamento_sinal_expirado || MENSAGENS_PADRAO.cancelamento_sinal_expirado;
            const partes = (ag.horario_inicio || "").split("T");
            const dataFormatada = partes[0] ? partes[0].split("-").reverse().slice(0, 2).join("/") : "";
            const horaFormatada = partes[1] ? partes[1].slice(0, 5) : "";
            const msg = formatarMensagem(template, {
              cliente: ag.cliente_nome || "Cliente",
              servico: ag.servico_titulo || "Procedimento",
              data: dataFormatada,
              horario: horaFormatada,
            });
            EvolutionService.sendMessage(ag.cliente_telefone, msg).catch((e) =>
              console.error("Erro ao notificar cancelamento por sinal expirado via Evolution:", e)
            );
          } catch (e) {
            console.error("Erro ao formatar cancelamento por sinal expirado:", e);
          }
        }
      }
    });

    if (alterado) {
      writeDB(dados);
      console.log(">>> [Auto-Expiração] Agendamento(s) com sinal expirado foram cancelados e vagas liberadas na agenda.");
      return true;
    }
    return false;
  },

  getAgendamentos(dataFiltro?: string): Agendamento[] {
    this.executarAutoExpiracaoSinal();
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
    status?: StatusAgendamento;
    valor_sinal?: number;
    forma_pagamento?: FormaPagamento;
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

    const exigeSinal = db.config.exigir_sinal ?? true;
    let valorSinalCalculado = params.valor_sinal;
    if (valorSinalCalculado === undefined && exigeSinal) {
      if (db.config.tipo_sinal === "FIXO") {
        valorSinalCalculado = db.config.sinal_valor_fixo ?? 20;
      } else {
        const pct = db.config.sinal_porcentagem ?? 30;
        valorSinalCalculado = Math.round((servico.preco * pct) / 100);
      }
    }

    const statusInicial: StatusAgendamento =
      params.status || (exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO");

    const tempoMinutos = db.config.tempo_limite_sinal_minutos || 30;
    const tempoExpiracao = new Date(Date.now() + tempoMinutos * 60 * 1000).toISOString();

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
      status: statusInicial,
      origem,
      valor_cobrado: servico.preco,
      valor_sinal: valorSinalCalculado,
      tempo_expiracao_sinal: statusInicial === "AGUARDANDO_SINAL" ? tempoExpiracao : undefined,
      forma_pagamento: params.forma_pagamento,
      observacoes,
      created_at: new Date().toISOString(),
    };

    db.agendamentos.push(novoAgendamento);

    // Se o atendimento já foi criado diretamente como CONCLUÍDO (atendimento presencial já pago):
    if (statusInicial === "CONCLUIDO") {
      const idxCli = clienteIdx >= 0 ? clienteIdx : db.clientes.length - 1;
      if (idxCli >= 0 && db.clientes[idxCli]) {
        const cli = db.clientes[idxCli];
        cli.total_visitas = (cli.total_visitas || 0) + 1;
        cli.total_gasto = (cli.total_gasto || 0) + servico.preco;
        if (!cli.historico_visitas) cli.historico_visitas = [];
        cli.historico_visitas.push({
          agendamento_id: novoAgendamento.id,
          data_hora: horario_inicio,
          servico_titulo: servico.titulo,
          valor: servico.preco,
          forma_pagamento: params.forma_pagamento,
        });
      }
    }

    writeDB(db);
    console.log(">>> [ServerStore] Agendamento salvo:", novoAgendamento.cliente_nome, novoAgendamento.horario_inicio, novoAgendamento.status);

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

  updateAgendamento(id: string, updates: Partial<Agendamento>): Agendamento | null {
    const db = readDB();
    const idx = db.agendamentos.findIndex((a) => a.id === id);
    if (idx >= 0) {
      db.agendamentos[idx] = { ...db.agendamentos[idx], ...updates };
      writeDB(db);
      return db.agendamentos[idx];
    }
    return null;
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

  limparClientes(): number {
    const db = readDB();
    const totalAnterior = db.clientes.length;
    db.clientes = [];
    writeDB(db);
    console.log(`>>> [ServerStore] Limpeza de clientes: ${totalAnterior} clientes removidos.`);
    return totalAnterior;
  },

  limparHistoricoFinanceiro(periodo: "HOJE" | "SEMANA" | "MES" | "TODOS" = "TODOS"): number {
    const db = readDB();
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

    const totalAntes = db.agendamentos.length;

    db.agendamentos = db.agendamentos.filter((ag) => {
      // Agendamentos em aberto (Aguardando sinal, confirmados na fila) NÃO são tocados!
      if (ag.status !== "CONCLUIDO") return true;

      const dataAg = ag.horario_inicio.split("T")[0];

      if (periodo === "HOJE") {
        return dataAg !== hojeStr;
      }

      if (periodo === "SEMANA") {
        const dataObj = new Date(ag.horario_inicio);
        const diffTime = Math.abs(agora.getTime() - dataObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 7;
      }

      if (periodo === "MES") {
        return !dataAg.startsWith(hojeStr.slice(0, 7));
      }

      // Se "TODOS", remove todos os concluídos
      return false;
    });

    // Se limpar todos, zera também total_gasto e historico_visitas nos clientes
    if (periodo === "TODOS" && db.clientes) {
      db.clientes.forEach((cli) => {
        cli.total_gasto = 0;
        cli.historico_visitas = [];
      });
    }

    writeDB(db);
    const removidos = totalAntes - db.agendamentos.length;
    console.log(`>>> [ServerStore] Histórico financeiro limpo (${periodo}): ${removidos} registros de faturamento removidos.`);
    return removidos;
  },
};
