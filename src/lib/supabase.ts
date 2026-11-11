import { createClient } from "@supabase/supabase-js";
import { BarbeariaConfig, MensagensWhatsAppConfig } from "@/types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://pcnzjizlhwbbdhsksajz.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "sb_publishable_IrbOsWWeurqIGtWns_tVzA_bSV6H65U";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "sua-url-supabase-aqui" &&
    supabaseAnonKey !== "sua-chave-anon-aqui"
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Converte o objeto BarbeariaConfig completo para o schema estrito da tabela barbearia_config no Supabase.
 * Empacota todas as configurações extras (mensagens_zap, sinal, prazos, inatividade) no campo mensagem_boas_vindas em JSON,
 * evitando rejeição 400 por colunas ausentes no Postgres.
 */
export function toSupabaseConfigPayload(config: Partial<BarbeariaConfig>): Record<string, unknown> {
  const extra = {
    bio: config.mensagem_boas_vindas,
    titular_pix: config.titular_pix,
    exigir_sinal: config.exigir_sinal,
    tipo_sinal: config.tipo_sinal,
    sinal_porcentagem: config.sinal_porcentagem,
    sinal_valor_fixo: config.sinal_valor_fixo,
    tempo_limite_sinal_minutos: config.tempo_limite_sinal_minutos,
    auto_liberar_sinal_expirado: config.auto_liberar_sinal_expirado,
    tolerancia_auto_liberacao_minutos: config.tolerancia_auto_liberacao_minutos,
    tempo_inatividade_bot_minutos: config.tempo_inatividade_bot_minutos,
    regra_fidelidade_cortes: config.regra_fidelidade_cortes,
    porcentagem_desconto_fidelidade: config.porcentagem_desconto_fidelidade,
    auto_limpeza_cancelados_dias: config.auto_limpeza_cancelados_dias,
    auto_limpeza_incluir_historico: config.auto_limpeza_incluir_historico,
    evolution_api_url: config.evolution_api_url,
    evolution_api_key: config.evolution_api_key,
    evolution_instance_name: config.evolution_instance_name,
    mensagens_zap: config.mensagens_zap,
  };

  const payload: Record<string, unknown> = {
    mensagem_boas_vindas: JSON.stringify(extra),
  };

  if (config.id) payload.id = config.id;
  if (config.nome_barbearia !== undefined) payload.nome_barbearia = config.nome_barbearia;
  if (config.telefone_whatsapp !== undefined) payload.telefone_whatsapp = config.telefone_whatsapp;
  if (config.tempo_buffer_minutos !== undefined) payload.tempo_buffer_minutos = config.tempo_buffer_minutos;
  if (config.antecedencia_minima_cancelamento_horas !== undefined) payload.antecedencia_minima_cancelamento_horas = config.antecedencia_minima_cancelamento_horas;
  if (config.chave_pix !== undefined) payload.chave_pix = config.chave_pix;
  if (config.admin_usuario !== undefined) payload.admin_usuario = config.admin_usuario;
  if (config.admin_senha !== undefined) payload.admin_senha = config.admin_senha;

  return payload;
}

/**
 * Decodifica o registro vindo da tabela barbearia_config do Supabase,
 * recuperando todas as mensagens do WhatsApp e configurações avançadas com segurança.
 */
export function fromSupabaseConfigPayload(
  row: Record<string, unknown>,
  fallback?: BarbeariaConfig
): BarbeariaConfig {
  let extra: Record<string, unknown> = {};
  let bio = typeof row.mensagem_boas_vindas === "string" ? row.mensagem_boas_vindas : "";

  if (bio.trim().startsWith("{")) {
    try {
      extra = JSON.parse(bio);
      bio = typeof extra.bio === "string" ? extra.bio : bio;
    } catch {
      // Formato textual legível antigo
    }
  }

  const mensagens_zap = (extra.mensagens_zap as MensagensWhatsAppConfig) || fallback?.mensagens_zap;

  return {
    ...fallback,
    ...row,
    ...extra,
    mensagem_boas_vindas: bio,
    mensagens_zap,
  } as BarbeariaConfig;
}

