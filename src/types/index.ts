export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

export interface BarbeariaConfig {
  id: string;
  nome_barbearia: string;
  telefone_whatsapp: string;
  tempo_buffer_minutos: number;
  antecedencia_minima_cancelamento_horas: number;
  limite_maximo_agendamentos_dia: number;
  mensagem_boas_vindas?: string;
  chave_pix?: string;
  regra_fidelidade_cortes?: number; // Ex: A cada 5 cortes ganha desconto
  porcentagem_desconto_fidelidade?: number; // Ex: 20%
  auto_limpeza_cancelados_dias?: number; // 0 = Desativado, 7, 15, 30, 60 dias
}

export interface ExpedienteDia {
  id: string;
  dia_semana: DiaSemana;
  hora_inicio: string;
  hora_fim: string;
  intervalo_inicio?: string;
  intervalo_fim?: string;
  ativo: boolean;
}

export interface BloqueioAgenda {
  id: string;
  data_inicio: string;
  data_fim: string;
  motivo: string;
}

export interface Servico {
  id: string;
  titulo: string;
  descricao?: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
  icone?: string;
}

export interface HistoricoCorte {
  agendamento_id: string;
  data_hora: string;
  servico_titulo: string;
  valor: number;
  forma_pagamento?: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string; // Chave única
  ultimo_servico_id?: string;
  ultimo_servico_nome?: string;
  ultima_visita?: string;
  total_visitas: number;
  total_gasto?: number;
  historico_visitas?: HistoricoCorte[];
  created_at: string;
}

export type StatusAgendamento = 'CONFIRMADO' | 'CONCLUIDO' | 'CANCELADO' | 'FALTOU';
export type OrigemAgendamento = 'WEB' | 'WHATSAPP' | 'MANUAL';
export type FormaPagamento = 'PIX' | 'DINHEIRO' | 'CARTAO';

export interface Agendamento {
  id: string;
  cliente_id?: string;
  cliente_nome: string;
  cliente_telefone: string;
  servico_id: string;
  servico_titulo: string;
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
  status: StatusAgendamento;
  origem: OrigemAgendamento;
  valor_cobrado: number;
  forma_pagamento?: FormaPagamento;
  observacoes?: string;
  created_at: string;
}

export interface HorarioSlot {
  hora_inicio: string;
  hora_fim: string;
  disponivel: boolean;
  motivo_indisponivel?: string;
}

export interface ResumoFinanceiro {
  periodo: 'HOJE' | 'SEMANA' | 'MES';
  total_atendimentos: number;
  faturamento_total: number;
  ticket_medio: number;
  por_forma_pagamento: {
    pix: number;
    dinheiro: number;
    cartao: number;
  };
  servicos_mais_vendidos: {
    titulo: string;
    quantidade: number;
    total: number;
  }[];
}
