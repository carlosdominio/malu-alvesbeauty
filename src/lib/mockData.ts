import { Agendamento, BarbeariaConfig, Cliente, ExpedienteDia, Servico } from "@/types";

export const configInicial: BarbeariaConfig = {
  id: "cfg-1",
  nome_barbearia: "Studio Malu Alves Beauty",
  telefone_whatsapp: "82994247688",
  tempo_buffer_minutos: 5,
  antecedencia_minima_cancelamento_horas: 2,
  limite_maximo_agendamentos_dia: 15,
  mensagem_boas_vindas: "Bem-vinda ao Studio Malu Alves Beauty! Agende seu horário com praticidade.",
  chave_pix: "82981430673",
  titular_pix: "Luisa Alves dos Santos",
  exigir_sinal: true,
  tipo_sinal: "PORCENTAGEM",
  sinal_porcentagem: 30,
  sinal_valor_fixo: 20,
  tempo_limite_sinal_minutos: 30,
  auto_liberar_sinal_expirado: true,
  tolerancia_auto_liberacao_minutos: 15,
  tempo_inatividade_bot_minutos: 15,
  regra_fidelidade_cortes: 5,
  porcentagem_desconto_fidelidade: 20,
  auto_limpeza_cancelados_dias: 7,
  auto_limpeza_incluir_historico: false,
  admin_usuario: "admin",
  admin_senha: "Malu@2026",
};

export const servicosIniciais: Servico[] = [
  {
    id: "serv-1",
    titulo: "Design de Sobrancelhas Simples",
    descricao: "Alinhamento com pinça, medição visagista e acabamento perfeito.",
    preco: 30.0,
    duracao_minutos: 30,
    ativo: true,
    icone: "sparkles",
  },
  {
    id: "serv-2",
    titulo: "Design com Henna",
    descricao: "Design personalizado com aplicação de henna para realce e preenchimento.",
    preco: 45.0,
    duracao_minutos: 45,
    ativo: true,
    icone: "sparkles",
  },
  {
    id: "serv-3",
    titulo: "Brow Lamination",
    descricao: "Alinhamento dos fios rebeldes das sobrancelhas deixando visual encorpado e moderno.",
    preco: 80.0,
    duracao_minutos: 50,
    ativo: true,
    icone: "sparkles",
  },
  {
    id: "serv-4",
    titulo: "Epilação Facial / Buço",
    descricao: "Remoção delicada dos pelos faciais com acabamento suave.",
    preco: 20.0,
    duracao_minutos: 15,
    ativo: true,
    icone: "sparkles",
  },
];

export const expedienteInicial: ExpedienteDia[] = [
  { id: "exp-0", dia_semana: 0, hora_inicio: "09:00", hora_fim: "14:00", ativo: false }, // Domingo
  { id: "exp-1", dia_semana: 1, hora_inicio: "09:00", hora_fim: "19:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
  { id: "exp-2", dia_semana: 2, hora_inicio: "09:00", hora_fim: "19:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
  { id: "exp-3", dia_semana: 3, hora_inicio: "09:00", hora_fim: "19:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
  { id: "exp-4", dia_semana: 4, hora_inicio: "09:00", hora_fim: "19:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
  { id: "exp-5", dia_semana: 5, hora_inicio: "09:00", hora_fim: "20:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
  { id: "exp-6", dia_semana: 6, hora_inicio: "09:00", hora_fim: "18:00", intervalo_inicio: "12:00", intervalo_fim: "13:00", ativo: true },
];

export const agendamentosIniciais: Agendamento[] = [];

export const clientesIniciais: Cliente[] = [];
