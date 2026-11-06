"use client";

import { useEffect, useState } from "react";
import {
  Save,
  Check,
  Trash2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  QrCode,
  Percent,
  Coins,
} from "lucide-react";
import { BarbeariaConfig } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function ConfigPage() {
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Estados de Limpeza de Dados
  const [modalLimparAberto, setModalLimparAberto] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [tipoLimpeza, setTipoLimpeza] = useState<"TODOS" | "CANCELADOS">("TODOS");

  const { toastSuccess, toastWarning } = useToast();

  const gerarSenhaAleatoria = () => {
    if (!config) return;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setConfig({ ...config, admin_senha: pass });
    setMostrarSenha(true);
    toastSuccess("Nova Senha Gerada!", `Senha gerada: ${pass}. Clique em Salvar.`);
  };

  useEffect(() => {
    DataStore.getConfig().then(setConfig);
  }, []);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSalvando(true);
    await DataStore.updateConfig(config);
    setSalvando(false);
    setSucesso(true);
    toastSuccess("Configurações Salvas!", "As regras de agendamento e limites foram atualizadas.");
    setTimeout(() => setSucesso(false), 3000);
  };

  const handleExecutarLimpeza = async (modo: "TODOS" | "CANCELADOS") => {
    setLimpando(true);
    try {
      const res = await fetch(`/api/agendamentos?modo=${modo}`, { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        if (modo === "TODOS") {
          toastSuccess("Agenda Limpa!", `${data.removidos || 0} agendamentos de teste foram excluídos com sucesso.`);
        } else {
          toastSuccess("Cancelamentos Removidos!", `${data.removidos || 0} agendamentos cancelados foram limpos.`);
        }
        setModalLimparAberto(false);
      }
    } catch (err) {
      console.error(err);
      toastWarning("Erro", "Não foi possível realizar a limpeza no momento.");
    } finally {
      setLimpando(false);
    }
  };

  if (!config) return <div className="p-12 text-center text-zinc-500 text-sm">Carregando configurações...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-zinc-100">Configurações do Studio</h2>
        <p className="text-xs text-zinc-400">
          Personalize as informações do seu studio, chave Pix e regras de agendamento.
        </p>
      </div>

      <form onSubmit={handleSalvar} className="space-y-5 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
        {/* Nome do Studio */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
            Nome do Studio
          </label>
          <input
            type="text"
            required
            value={config.nome_barbearia}
            onChange={(e) => setConfig({ ...config, nome_barbearia: e.target.value })}
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
          />
        </div>

        {/* Telefone / WhatsApp */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
            Seu Número de WhatsApp (com DDD)
          </label>
          <input
            type="tel"
            required
            value={config.telefone_whatsapp}
            onChange={(e) => setConfig({ ...config, telefone_whatsapp: e.target.value })}
            placeholder="Ex: 82994247688"
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
          />
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO: GARANTIA DE HORÁRIO & SINAL ANTECIPADO (ANTI-NO-SHOW) */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-amber-500/30 space-y-4 shadow-lg shadow-black/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-sm shadow-amber-500/20 mt-0.5">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                    Sinal Antecipado via PIX
                  </h3>
                  <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Anti-Falta
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Exija um sinal via PIX para garantir a reserva e evitar horários vazios na agenda.
                </p>
              </div>
            </div>

            {/* Botão de Toggle Claro, Táctil e Responsivo */}
            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
              <span className="sm:hidden text-xs font-bold text-zinc-400">Cobrança de Sinal:</span>
              <button
                type="button"
                onClick={() =>
                  setConfig({
                    ...config,
                    exigir_sinal: !(config.exigir_sinal ?? true),
                  })
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-xs font-black select-none shrink-0 shadow-sm ${
                  (config.exigir_sinal ?? true)
                    ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-amber-500/25 active:scale-95"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 active:scale-95"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    (config.exigir_sinal ?? true) ? "bg-zinc-950 animate-pulse" : "bg-zinc-600"
                  }`}
                />
                <span>{(config.exigir_sinal ?? true) ? "ATIVADO" : "DESATIVADO"}</span>
              </button>
            </div>
          </div>

          {(config.exigir_sinal ?? true) && (
            <div className="pt-3 border-t border-zinc-800 space-y-4 animate-in fade-in duration-200">
              {/* Chave PIX e Nome da Titular */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                    Chave PIX do Studio (Celular/CPF/Email)
                  </label>
                  <input
                    type="text"
                    required
                    value={config.chave_pix || ""}
                    onChange={(e) => setConfig({ ...config, chave_pix: e.target.value })}
                    placeholder="Ex: 82981430673"
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                    Nome da Titular da Conta
                  </label>
                  <input
                    type="text"
                    required
                    value={config.titular_pix || ""}
                    onChange={(e) => setConfig({ ...config, titular_pix: e.target.value })}
                    placeholder="Ex: Luisa Alves dos Santos"
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
                  />
                </div>
              </div>

              {/* Tipo de Cálculo e Valor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                    Modelo de Cobrança do Sinal
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, tipo_sinal: "PORCENTAGEM" })}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        (config.tipo_sinal ?? "PORCENTAGEM") === "PORCENTAGEM"
                          ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5" />
                      Porcentagem (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, tipo_sinal: "FIXO" })}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        config.tipo_sinal === "FIXO"
                          ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <Coins className="w-3.5 h-3.5" />
                      Valor Fixo (R$)
                    </button>
                  </div>
                </div>

                <div>
                  {(config.tipo_sinal ?? "PORCENTAGEM") === "PORCENTAGEM" ? (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
                        Porcentagem do Procedimento
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="100"
                          required
                          value={config.sinal_porcentagem ?? 30}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              sinal_porcentagem: parseInt(e.target.value, 10) || 30,
                            })
                          }
                          className="w-20 sm:w-24 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-black text-center shrink-0"
                        />
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {[20, 30, 50].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setConfig({ ...config, sinal_porcentagem: pct })}
                              className={`flex-1 py-2 rounded-lg text-xs font-extrabold border transition-all truncate ${
                                (config.sinal_porcentagem ?? 30) === pct
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850"
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
                        Valor Fixo em Reais (R$)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="500"
                        required
                        value={config.sinal_valor_fixo ?? 20}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sinal_valor_fixo: parseFloat(e.target.value) || 20,
                          })
                        }
                        className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Tolerância de Tempo para Envio do Comprovante */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                  Tolerância para Envio do Comprovante (Tempo de Reserva)
                </label>
                <select
                  value={config.tempo_limite_sinal_minutos ?? 30}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tempo_limite_sinal_minutos: parseInt(e.target.value, 10) || 30,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos (Recomendado)</option>
                  <option value="45">45 minutos</option>
                  <option value="60">1 hora (60 minutos)</option>
                  <option value="120">2 horas</option>
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Se a cliente não enviar o comprovante dentro deste prazo, o robô pode liberar a vaga na agenda para outras clientes.
                </p>
              </div>

              {/* Preview da Mensagem enviada pelo Robô */}
              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Como o cliente verá no WhatsApp:
                </span>
                <p className="text-xs text-zinc-300 font-mono leading-relaxed bg-zinc-950 p-3 rounded-lg border border-zinc-800 whitespace-pre-line">
                  {`🔒 *GARANTIA DO SEU HORÁRIO*
Para confirmar com exclusividade o seu atendimento, solicitamos um sinal de:
💰 *Valor do Sinal:* *R$ ${(
                    ((config.tipo_sinal ?? "PORCENTAGEM") === "PORCENTAGEM"
                      ? (45 * (config.sinal_porcentagem ?? 30)) / 100
                      : (config.sinal_valor_fixo ?? 20)
                    ).toFixed(2)
                  ).replace(".", ",")}* _(exemplo num serviço de R$ 45)_

🔑 *CHAVE PIX (Celular):*
\`${config.chave_pix || "82981430673"}\`
*Titular:* ${config.titular_pix || "Luisa Alves dos Santos"}

⏳ *Tempo limite:* ${config.tempo_limite_sinal_minutos ?? 30} minutos para enviar o comprovante.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Mensagem de Boas-Vindas */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
            Mensagem da Bio / Boas-Vindas
          </label>
          <textarea
            rows={2}
            value={config.mensagem_boas_vindas}
            onChange={(e) => setConfig({ ...config, mensagem_boas_vindas: e.target.value })}
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold resize-none"
          />
        </div>

        {/* Limite Máximo de Atendimentos */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
            Limite Máximo de Atendimentos por Dia
          </label>
          <input
            type="number"
            min="1"
            max="40"
            required
            value={config.limite_maximo_agendamentos_dia || 15}
            onChange={(e) =>
              setConfig({ ...config, limite_maximo_agendamentos_dia: parseInt(e.target.value, 10) || 15 })
            }
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-bold"
          />
          <p className="text-[11px] text-zinc-400 mt-1">
            Quando este número for atingido no dia, o robô e o site bloqueiam novos agendamentos e avisam que o dia está lotado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Buffer entre atendimentos */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
              Tempo de Intervalo / Limpeza (min)
            </label>
            <select
              value={config.tempo_buffer_minutos}
              onChange={(e) => setConfig({ ...config, tempo_buffer_minutos: parseInt(e.target.value, 10) })}
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
            >
              <option value="0">0 minutos (emendado)</option>
              <option value="5">5 minutos (recomendado)</option>
              <option value="10">10 minutos</option>
              <option value="15">15 minutos</option>
            </select>
          </div>

          {/* Cancelamento Mínimo */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
              Antecedência Mínima para Cancelar (horas)
            </label>
            <select
              value={config.antecedencia_minima_cancelamento_horas}
              onChange={(e) =>
                setConfig({ ...config, antecedencia_minima_cancelamento_horas: parseInt(e.target.value, 10) })
              }
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
            >
              <option value="1">1 hora antes</option>
              <option value="2">2 horas antes (recomendado)</option>
              <option value="4">4 horas antes</option>
              <option value="12">12 horas antes</option>
              <option value="24">24 horas antes</option>
            </select>
          </div>
        </div>

        {/* Limpeza Automática Inteligente */}
        <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
              Auto-Limpeza Automática de Cancelamentos & Faltas
            </label>
            <select
              value={config.auto_limpeza_cancelados_dias ?? 7}
              onChange={(e) =>
                setConfig({ ...config, auto_limpeza_cancelados_dias: parseInt(e.target.value, 10) })
              }
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
            >
              <option value="7">A cada 7 dias (Recomendado - Remove faltas/cancelamentos antigos)</option>
              <option value="15">A cada 15 dias</option>
              <option value="30">A cada 30 dias (Mensal)</option>
              <option value="60">A cada 60 dias</option>
              <option value="0">Desativado (Manter tudo no banco de dados)</option>
            </select>
            <p className="text-[11px] text-zinc-400 mt-1.5">
              {config.auto_limpeza_incluir_historico
                ? "O sistema limpa da agenda os cancelamentos, faltas e também os atendimentos concluídos mais antigos que esse prazo automaticamente."
                : "O sistema limpa da agenda os cancelamentos e faltas mais antigos que esse prazo automaticamente, sem apagar o histórico de atendimentos nem os pontos de fidelidade dos clientes."}
            </p>
          </div>

          {/* Opção para incluir itens do histórico na auto-limpeza */}
          <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-zinc-200 block">
                🧹 Incluir Limpeza de Itens de Histórico (Atendimentos Concluídos)
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Ao ativar, atendimentos concluídos e registros do histórico anteriores a {config.auto_limpeza_cancelados_dias || 7} dias também serão removidos automaticamente, mantendo a agenda e o financeiro limpos e leves.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.auto_limpeza_incluir_historico ?? false}
                onChange={(e) =>
                  setConfig({ ...config, auto_limpeza_incluir_historico: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>

        {/* SEGURANÇA & ACESSO AO PAINEL ADMINISTRATIVO */}
        <div className="pt-4 border-t border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span>Segurança & Senha de Acesso ao Painel</span>
          </div>
          <p className="text-xs text-zinc-400">
            Defina o usuário e a senha que serão solicitados na tela de login para acessar o painel do Studio.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Usuário Administrador */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                Usuário Administrador
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={config.admin_usuario || "admin"}
                  onChange={(e) => setConfig({ ...config, admin_usuario: e.target.value })}
                  placeholder="Ex: admin"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>
            </div>

            {/* Senha de Acesso */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block">
                  Senha de Acesso
                </label>
                <button
                  type="button"
                  onClick={gerarSenhaAleatoria}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                  title="Gerar uma nova senha segura aleatória"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Gerar Senha Forte</span>
                </button>
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={mostrarSenha ? "text" : "password"}
                  required
                  value={config.admin_senha || "Malu@2026"}
                  onChange={(e) => setConfig({ ...config, admin_senha: e.target.value })}
                  placeholder="Digite a senha de acesso"
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={mostrarSenha ? "Ocultar senha" : "Ver senha"}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Destaque das Credenciais Atuais */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">Credenciais Atuais de Acesso:</span>
              <span className="font-mono font-bold text-zinc-100">
                Usuário: <span className="text-amber-400">{config.admin_usuario || "admin"}</span> • Senha:{" "}
                <span className="text-amber-400">{config.admin_senha || "Malu@2026"}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`Usuário: ${config.admin_usuario || "admin"}\nSenha: ${config.admin_senha || "Malu@2026"}`);
                toastSuccess("Copiado!", "Credenciais copiadas para a área de transferência.");
              }}
              className="text-[11px] font-bold text-amber-400 hover:underline shrink-0"
            >
              📋 Copiar Credenciais
            </button>
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            variant="gold"
            size="lg"
            loading={salvando}
            className="w-full font-bold shadow-lg shadow-amber-500/20"
          >
            {sucesso ? <Check className="w-5 h-5 mr-1" /> : <Save className="w-5 h-5 mr-1" />}
            <span>{sucesso ? "Configurações Salvas com Sucesso!" : "Salvar Configurações"}</span>
          </Button>
        </div>
      </form>

      {/* ÁREA DE MANUTENÇÃO E LIMPEZA DA AGENDA */}
      <div className="bg-zinc-900/60 border border-red-950/60 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-100">Limpeza & Manutenção da Agenda</h3>
            <p className="text-xs text-zinc-400">
              Ferramenta para resetar agendamentos de teste ou limpar histórico de cancelamentos.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setTipoLimpeza("TODOS");
              setModalLimparAberto(true);
            }}
            className="flex items-center justify-center gap-2 text-xs font-bold py-2.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Zerar Agendamentos de Teste</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTipoLimpeza("CANCELADOS");
              setModalLimparAberto(true);
            }}
            loading={limpando}
            className="flex items-center justify-center gap-2 text-xs font-bold py-2.5 text-zinc-300"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Limpar Apenas Cancelados / Faltas</span>
          </Button>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE LIMPEZA */}
      <Modal
        isOpen={modalLimparAberto}
        onClose={() => setModalLimparAberto(false)}
        title={tipoLimpeza === "TODOS" ? "Zerar Agendamentos de Teste" : "Limpar Cancelados e Faltas"}
        description={
          tipoLimpeza === "TODOS"
            ? "Atenção: esta ação apagará os atendimentos registrados no painel."
            : "Esta ação removerá do histórico os atendimentos cancelados ou com falta."
        }
        icon={<Trash2 className="w-5 h-5 text-red-400" />}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-900/40 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-red-200">Atenção: Ação Irreversível</h4>
              <p className="text-xs text-red-300/80 leading-relaxed">
                {tipoLimpeza === "TODOS"
                  ? "Isso irá apagar todos os agendamentos registrados no painel para deixar a agenda 100% limpa para a inauguração. Seus Serviços, Preços e Horários permanecerão salvos."
                  : "Isso irá remover da listagem todos os agendamentos cancelados ou marcados como falta, mantendo os confirmados e concluídos."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setModalLimparAberto(false)}
              className="text-xs font-bold"
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              size="md"
              loading={limpando}
              onClick={() => handleExecutarLimpeza(tipoLimpeza)}
              className="text-xs font-bold shadow-lg shadow-red-500/20"
            >
              {tipoLimpeza === "TODOS" ? "Sim, Limpar Tudo" : "Sim, Limpar Cancelados"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
