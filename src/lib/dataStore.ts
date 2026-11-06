import {
  Agendamento,
  BarbeariaConfig,
  BloqueioAgenda,
  Cliente,
  ExpedienteDia,
  FormaPagamento,
  ResumoFinanceiro,
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
import { isSupabaseConfigured, supabase } from "./supabase";

const KEYS = {
  CONFIG: "barber_os_config",
  SERVICOS: "barber_os_servicos",
  EXPEDIENTE: "barber_os_expediente",
  AGENDAMENTOS: "barber_os_agendamentos",
  CLIENTES: "barber_os_clientes",
  BLOQUEIOS: "barber_os_bloqueios",
};

// Helper para somar minutos sem desvio de timezone
function somarMinutosDataHora(dataHoraInicio: string, duracaoMinutos: number): string {
  const [dataPart, horaPart] = dataHoraInicio.split("T");
  if (!horaPart) return dataHoraInicio;
  const [h, m] = horaPart.slice(0, 5).split(":").map(Number);
  const totalMin = h * 60 + m + duracaoMinutos;
  const fimH = Math.floor(totalMin / 60);
  const fimM = totalMin % 60;
  return `${dataPart}T${String(fimH).padStart(2, "0")}:${String(fimM).padStart(2, "0")}:00`;
}

// Helper para ler do LocalStorage com fallback
function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

// Helper para salvar no LocalStorage
function setLocal<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Erro ao salvar no LocalStorage", e);
  }
}

// Limpeza automática de dados mockados antigos no navegador do usuário
if (typeof window !== "undefined") {
  try {
    const version = localStorage.getItem("barber_os_storage_version");
    if (version !== "v3_clean_start") {
      localStorage.setItem(KEYS.AGENDAMENTOS, JSON.stringify([]));
      localStorage.setItem(KEYS.CLIENTES, JSON.stringify([]));
      localStorage.setItem(KEYS.BLOQUEIOS, JSON.stringify([]));
      localStorage.setItem("barber_os_storage_version", "v3_clean_start");
    }
  } catch {}
}

export const DataStore = {
  // 1. CONFIGURAÇÃO DA BARBEARIA
  async getConfig(): Promise<BarbeariaConfig> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("barbearia_config").select("*").limit(1).single();
      if (!error && data) return data as BarbeariaConfig;
    }
    return getLocal<BarbeariaConfig>(KEYS.CONFIG, configInicial);
  },

  async updateConfig(config: Partial<BarbeariaConfig>): Promise<BarbeariaConfig> {
    const atual = await this.getConfig();
    const atualizado = { ...atual, ...config };
    setLocal(KEYS.CONFIG, atualizado);

    if (isSupabaseConfigured && supabase) {
      await supabase.from("barbearia_config").upsert(atualizado);
    }
    return atualizado;
  },

  // 2. SERVIÇOS
  async getServicos(): Promise<Servico[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("servicos").select("*").order("preco", { ascending: true });
      if (!error && data && data.length > 0) return data as Servico[];
    }
    return getLocal<Servico[]>(KEYS.SERVICOS, servicosIniciais);
  },

  async saveServico(servico: Omit<Servico, "id"> & { id?: string }): Promise<Servico> {
    const servicos = await this.getServicos();
    let novo: Servico;

    if (servico.id) {
      novo = servico as Servico;
      const index = servicos.findIndex((s) => s.id === servico.id);
      if (index >= 0) servicos[index] = novo;
    } else {
      novo = {
        ...servico,
        id: `serv-${Date.now()}`,
      };
      servicos.push(novo);
    }

    setLocal(KEYS.SERVICOS, servicos);
    if (isSupabaseConfigured && supabase) {
      await supabase.from("servicos").upsert(novo);
    }
    return novo;
  },

  async toggleServicoAtivo(id: string): Promise<void> {
    const servicos = await this.getServicos();
    const index = servicos.findIndex((s) => s.id === id);
    if (index >= 0) {
      servicos[index].ativo = !servicos[index].ativo;
      setLocal(KEYS.SERVICOS, servicos);
      if (isSupabaseConfigured && supabase) {
        await supabase.from("servicos").update({ ativo: servicos[index].ativo }).eq("id", id);
      }
    }
  },

  async deleteServico(id: string): Promise<void> {
    const servicos = (await this.getServicos()).filter((s) => s.id !== id);
    setLocal(KEYS.SERVICOS, servicos);
    if (isSupabaseConfigured && supabase) {
      await supabase.from("servicos").delete().eq("id", id);
    }
  },

  // 3. EXPEDIENTE
  async getExpediente(): Promise<ExpedienteDia[]> {
    try {
      const res = await fetch("/api/expediente", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setLocal(KEYS.EXPEDIENTE, data);
          return data;
        }
      }
    } catch {}

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("expediente").select("*").order("dia_semana", { ascending: true });
      if (!error && data && data.length > 0) return data as ExpedienteDia[];
    }
    return getLocal<ExpedienteDia[]>(KEYS.EXPEDIENTE, expedienteInicial);
  },

  async updateExpediente(expedientes: ExpedienteDia[]): Promise<void> {
    setLocal(KEYS.EXPEDIENTE, expedientes);
    try {
      await fetch("/api/expediente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expedientes),
      });
    } catch {}

    if (isSupabaseConfigured && supabase) {
      await supabase.from("expediente").upsert(expedientes);
    }
  },

  // 4. BLOQUEIOS DE AGENDA
  async getBloqueios(): Promise<BloqueioAgenda[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("bloqueios").select("*");
      if (!error && data) return data as BloqueioAgenda[];
    }
    return getLocal<BloqueioAgenda[]>(KEYS.BLOQUEIOS, []);
  },

  async addBloqueio(bloqueio: Omit<BloqueioAgenda, "id">): Promise<BloqueioAgenda> {
    const bloqueios = await this.getBloqueios();
    const novo: BloqueioAgenda = {
      ...bloqueio,
      id: `blq-${Date.now()}`,
    };
    bloqueios.push(novo);
    setLocal(KEYS.BLOQUEIOS, bloqueios);
    if (isSupabaseConfigured && supabase) {
      await supabase.from("bloqueios").insert(novo);
    }
    return novo;
  },

  async deleteBloqueio(id: string): Promise<void> {
    const bloqueios = (await this.getBloqueios()).filter((b) => b.id !== id);
    setLocal(KEYS.BLOQUEIOS, bloqueios);
    if (isSupabaseConfigured && supabase) {
      await supabase.from("bloqueios").delete().eq("id", id);
    }
  },

  // 5. CLIENTES & DETECÇÃO DE CLIENTE RECORRENTE
  async getClientes(): Promise<Cliente[]> {
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/clientes", { cache: "no-store" });
        if (res.ok) {
          const dados = await res.json();
          if (Array.isArray(dados)) {
            setLocal(KEYS.CLIENTES, dados);
            return dados;
          }
        }
      } catch {}
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("clientes").select("*").order("ultima_visita", { ascending: false });
      if (!error && data && data.length > 0) return data as Cliente[];
    }
    return getLocal<Cliente[]>(KEYS.CLIENTES, clientesIniciais);
  },

  async findClientePorTelefone(telefone: string): Promise<Cliente | null> {
    const telLimpo = telefone.replace(/\D/g, "");
    const clientes = await this.getClientes();
    const cliente = clientes.find((c) => c.telefone.replace(/\D/g, "") === telLimpo);
    return cliente || null;
  },

  async registrarOuAtualizarCliente(nome: string, telefone: string, servico: Servico, dataVisita: string): Promise<Cliente> {
    const telLimpo = telefone.replace(/\D/g, "");
    const clientes = await this.getClientes();
    const index = clientes.findIndex((c) => c.telefone.replace(/\D/g, "") === telLimpo);

    let clienteAtualizado: Cliente;
    if (index >= 0) {
      clienteAtualizado = {
        ...clientes[index],
        nome: nome || clientes[index].nome,
        ultimo_servico_id: servico.id,
        ultimo_servico_nome: servico.titulo,
        ultima_visita: dataVisita,
        total_visitas: clientes[index].total_visitas + 1,
      };
      clientes[index] = clienteAtualizado;
    } else {
      clienteAtualizado = {
        id: `cli-${Date.now()}`,
        nome,
        telefone: telLimpo,
        ultimo_servico_id: servico.id,
        ultimo_servico_nome: servico.titulo,
        ultima_visita: dataVisita,
        total_visitas: 1,
        created_at: new Date().toISOString(),
      };
      clientes.push(clienteAtualizado);
    }

    setLocal(KEYS.CLIENTES, clientes);
    if (isSupabaseConfigured && supabase) {
      await supabase.from("clientes").upsert(clienteAtualizado);
    }
    return clienteAtualizado;
  },

  // 6. AGENDAMENTOS
  async getAgendamentos(dataFiltro?: string): Promise<Agendamento[]> {
    if (typeof window !== "undefined") {
      try {
        const url = dataFiltro ? `/api/agendamentos?data=${dataFiltro}` : `/api/agendamentos`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const dados = await res.json();
          if (Array.isArray(dados)) {
            setLocal(KEYS.AGENDAMENTOS, dados);
            return dados.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
          }
        }
      } catch {}
    }

    let lista: Agendamento[] = [];

    if (isSupabaseConfigured && supabase) {
      let query = supabase.from("agendamentos").select("*").order("horario_inicio", { ascending: true });
      if (dataFiltro) {
        query = query.gte("horario_inicio", `${dataFiltro}T00:00:00`).lte("horario_inicio", `${dataFiltro}T23:59:59`);
      }
      const { data, error } = await query;
      if (!error && data) lista = data as Agendamento[];
    }

    if (lista.length === 0) {
      lista = getLocal<Agendamento[]>(KEYS.AGENDAMENTOS, agendamentosIniciais);
      if (dataFiltro) {
        lista = lista.filter((ag) => ag.horario_inicio.startsWith(dataFiltro));
      }
    }

    return lista.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  },

  async createAgendamento(params: {
    cliente_nome: string;
    cliente_telefone: string;
    servico: Servico;
    horario_inicio: string;
    origem?: "WEB" | "WHATSAPP" | "MANUAL";
    observacoes?: string;
    status?: StatusAgendamento;
    valor_sinal?: number;
  }): Promise<Agendamento> {
    const { cliente_nome, cliente_telefone, servico, horario_inicio, origem = "WEB", observacoes } = params;

    // Calcular horário de término diretamente sem conversão errônea de timezone
    const horarioFim = somarMinutosDataHora(horario_inicio, servico.duracao_minutos);

    // Salvar ou atualizar cliente
    const cliente = await this.registrarOuAtualizarCliente(
      cliente_nome,
      cliente_telefone,
      servico,
      horario_inicio
    );

    const config = await this.getConfig();
    const exigeSinal = config.exigir_sinal ?? true;
    let valorSinal = params.valor_sinal;
    if (valorSinal === undefined && exigeSinal) {
      if (config.tipo_sinal === "FIXO") {
        valorSinal = config.sinal_valor_fixo ?? 20;
      } else {
        const pct = config.sinal_porcentagem ?? 30;
        valorSinal = Math.round((servico.preco * pct) / 100);
      }
    }

    const statusFinal: StatusAgendamento =
      params.status || (exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO");

    const tempoMinutos = config.tempo_limite_sinal_minutos || 30;
    const tempoExpiracao = new Date(Date.now() + tempoMinutos * 60 * 1000).toISOString();

    const novoAgendamento: Agendamento = {
      id: `ag-${Date.now()}`,
      cliente_id: cliente.id,
      cliente_nome,
      cliente_telefone: cliente_telefone.replace(/\D/g, ""),
      servico_id: servico.id,
      servico_titulo: servico.titulo,
      horario_inicio,
      horario_fim: horarioFim,
      duracao_minutos: servico.duracao_minutos,
      status: statusFinal,
      origem,
      valor_cobrado: servico.preco,
      valor_sinal: valorSinal,
      tempo_expiracao_sinal: statusFinal === "AGUARDANDO_SINAL" ? tempoExpiracao : undefined,
      observacoes,
      created_at: new Date().toISOString(),
    };

    const agendamentos = getLocal<Agendamento[]>(KEYS.AGENDAMENTOS, agendamentosIniciais);
    agendamentos.push(novoAgendamento);
    setLocal(KEYS.AGENDAMENTOS, agendamentos);

    if (isSupabaseConfigured && supabase) {
      await supabase.from("agendamentos").insert(novoAgendamento);
    }

    return novoAgendamento;
  },

  async updateStatusAgendamento(
    id: string,
    status: StatusAgendamento,
    formaPagamento?: FormaPagamento
  ): Promise<void> {
    const agendamentos = getLocal<Agendamento[]>(KEYS.AGENDAMENTOS, agendamentosIniciais);
    const index = agendamentos.findIndex((a) => a.id === id);

    if (index >= 0) {
      agendamentos[index].status = status;
      if (formaPagamento) {
        agendamentos[index].forma_pagamento = formaPagamento;
      }
      setLocal(KEYS.AGENDAMENTOS, agendamentos);

      if (isSupabaseConfigured && supabase) {
        const updateData: Record<string, unknown> = { status };
        if (formaPagamento) updateData.forma_pagamento = formaPagamento;
        await supabase.from("agendamentos").update(updateData).eq("id", id);
      }
    }
  },

  // 7. DASHBOARD FINANCEIRO ENXUTO (HOJE, SEMANA, MÊS)
  async getResumoFinanceiro(periodo: "HOJE" | "SEMANA" | "MES" = "HOJE"): Promise<ResumoFinanceiro> {
    const agendamentos = await this.getAgendamentos();
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

    const agendamentosValidos = agendamentos.filter((ag) => {
      if (ag.status === "CANCELADO" || ag.status === "FALTOU") return false;
      const dataAg = ag.horario_inicio.split("T")[0];

      if (periodo === "HOJE") {
        return dataAg === hojeStr;
      }

      if (periodo === "SEMANA") {
        const dataObj = new Date(ag.horario_inicio);
        const diffTime = Math.abs(agora.getTime() - dataObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }

      if (periodo === "MES") {
        return dataAg.startsWith(hojeStr.slice(0, 7));
      }

      return true;
    });

    const totalAtendimentos = agendamentosValidos.length;
    const faturamentoTotal = agendamentosValidos.reduce((acc, curr) => acc + (curr.valor_cobrado || 0), 0);
    const ticketMedio = totalAtendimentos > 0 ? faturamentoTotal / totalAtendimentos : 0;

    const porForma = {
      pix: 0,
      dinheiro: 0,
      cartao: 0,
    };

    const servicosContador: Record<string, { quantidade: number; total: number }> = {};

    agendamentosValidos.forEach((ag) => {
      if (ag.forma_pagamento === "PIX") porForma.pix += ag.valor_cobrado;
      else if (ag.forma_pagamento === "DINHEIRO") porForma.dinheiro += ag.valor_cobrado;
      else if (ag.forma_pagamento === "CARTAO") porForma.cartao += ag.valor_cobrado;
      else {
        porForma.pix += ag.valor_cobrado;
      }

      if (!servicosContador[ag.servico_titulo]) {
        servicosContador[ag.servico_titulo] = { quantidade: 0, total: 0 };
      }
      servicosContador[ag.servico_titulo].quantidade += 1;
      servicosContador[ag.servico_titulo].total += ag.valor_cobrado;
    });

    const servicosMaisVendidos = Object.entries(servicosContador)
      .map(([titulo, val]) => ({
        titulo,
        quantidade: val.quantidade,
        total: val.total,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    return {
      periodo,
      total_atendimentos: totalAtendimentos,
      faturamento_total: faturamentoTotal,
      ticket_medio: ticketMedio,
      por_forma_pagamento: porForma,
      servicos_mais_vendidos: servicosMaisVendidos,
    };
  },
};
