import { Agendamento, BarbeariaConfig, Cliente, ExpedienteDia, Servico } from "@/types";

export const configInicial: BarbeariaConfig = {
  id: "cfg-1",
  nome_barbearia: "Studio Malu Alves Beauty",
  telefone_whatsapp: "82994247688",
  tempo_buffer_minutos: 5,
  antecedencia_minima_cancelamento_horas: 2,
  limite_maximo_agendamentos_dia: 15,
  mensagem_boas_vindas: "Bem-vinda ao Studio Malu Alves Beauty! Agende seu horário em menos de 1 minuto.",
  chave_pix: "pix@malualvesbeauty.com.br",
};

export const servicosIniciais: Servico[] = [
  {
    id: "serv-1",
    titulo: "Corte Degradê / Social",
    descricao: "Corte moderno na máquina e tesoura, com acabamento na navalha e finalização com pomada.",
    preco: 35.0,
    duracao_minutos: 30,
    ativo: true,
    icone: "scissors",
  },
  {
    id: "serv-2",
    titulo: "Barba Terapia Completa",
    descricao: "Toalha quente, alinhamento na navalha, esfoliação, massagem e óleo hidratante.",
    preco: 25.0,
    duracao_minutos: 25,
    ativo: true,
    icone: "sparkles",
  },
  {
    id: "serv-3",
    titulo: "Combo Corte + Barba",
    descricao: "O pacote completo para sair impecável. Cabelo + barba terapia completa.",
    preco: 50.0,
    duracao_minutos: 50,
    ativo: true,
    icone: "flame",
  },
  {
    id: "serv-4",
    titulo: "Sobrancelha na Navalha",
    descricao: "Alinhamento e limpeza precisa do contorno das sobrancelhas.",
    preco: 15.0,
    duracao_minutos: 10,
    ativo: true,
    icone: "scissors",
  },
  {
    id: "serv-5",
    titulo: "Pigmentação Cabelo / Barba",
    descricao: "Preenchimento de falhas e destaque no alinhamento do corte.",
    preco: 20.0,
    duracao_minutos: 20,
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

const hoje = new Date();
const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

export const agendamentosIniciais: Agendamento[] = [
  {
    id: "ag-1",
    cliente_nome: "Marcos Vinicius",
    cliente_telefone: "11987654321",
    servico_id: "serv-1",
    servico_titulo: "Corte Degradê / Social",
    horario_inicio: `${hojeStr}T09:30:00`,
    horario_fim: `${hojeStr}T10:00:00`,
    duracao_minutos: 30,
    status: "CONCLUIDO",
    origem: "WEB",
    valor_cobrado: 35.0,
    forma_pagamento: "PIX",
    created_at: `${hojeStr}T08:00:00`,
  },
  {
    id: "ag-2",
    cliente_nome: "Lucas Ferreira",
    cliente_telefone: "11977778888",
    servico_id: "serv-3",
    servico_titulo: "Combo Corte + Barba",
    horario_inicio: `${hojeStr}T10:30:00`,
    horario_fim: `${hojeStr}T11:20:00`,
    duracao_minutos: 50,
    status: "CONCLUIDO",
    origem: "WHATSAPP",
    valor_cobrado: 50.0,
    forma_pagamento: "DINHEIRO",
    created_at: `${hojeStr}T08:30:00`,
  },
  {
    id: "ag-3",
    cliente_nome: "Guilherme Santos",
    cliente_telefone: "11966665555",
    servico_id: "serv-1",
    servico_titulo: "Corte Degradê / Social",
    horario_inicio: `${hojeStr}T14:00:00`,
    horario_fim: `${hojeStr}T14:30:00`,
    duracao_minutos: 30,
    status: "CONFIRMADO",
    origem: "WEB",
    valor_cobrado: 35.0,
    created_at: `${hojeStr}T09:00:00`,
  },
  {
    id: "ag-4",
    cliente_nome: "Rodrigo Almeida",
    cliente_telefone: "11955554444",
    servico_id: "serv-2",
    servico_titulo: "Barba Terapia Completa",
    horario_inicio: `${hojeStr}T15:30:00`,
    horario_fim: `${hojeStr}T15:55:00`,
    duracao_minutos: 25,
    status: "CONFIRMADO",
    origem: "WEB",
    valor_cobrado: 25.0,
    created_at: `${hojeStr}T09:15:00`,
  },
];

export const clientesIniciais: Cliente[] = [
  {
    id: "cli-1",
    nome: "Marcos Vinicius",
    telefone: "11987654321",
    ultimo_servico_id: "serv-1",
    ultimo_servico_nome: "Corte Degradê / Social",
    ultima_visita: `${hojeStr}T09:30:00`,
    total_visitas: 6,
    created_at: "2026-06-10T10:00:00Z",
  },
  {
    id: "cli-2",
    nome: "Lucas Ferreira",
    telefone: "11977778888",
    ultimo_servico_id: "serv-3",
    ultimo_servico_nome: "Combo Corte + Barba",
    ultima_visita: `${hojeStr}T10:30:00`,
    total_visitas: 4,
    created_at: "2026-07-01T14:00:00Z",
  },
];
