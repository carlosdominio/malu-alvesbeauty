"use client";

import { useEffect, useState } from "react";
import { Save, Check, Trash2, AlertTriangle, RefreshCw, ShieldCheck, Lock, User, Eye, EyeOff, Sparkles } from "lucide-react";
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

        {/* Chave Pix para Recebimento */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
            Chave Pix do Studio
          </label>
          <input
            type="text"
            required
            value={config.chave_pix || ""}
            onChange={(e) => setConfig({ ...config, chave_pix: e.target.value })}
            placeholder="Ex: CPF, CNPJ, E-mail ou Celular"
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
          />
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
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
            Auto-Limpeza Automática de Cancelamentos & Faltas
          </label>
          <select
            value={config.auto_limpeza_cancelados_dias ?? 7}
            onChange={(e) =>
              setConfig({ ...config, auto_limpeza_cancelados_dias: parseInt(e.target.value, 10) })
            }
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-semibold"
          >
            <option value="7">A cada 7 dias (Recomendado - Remove faltas/cancelamentos antigos)</option>
            <option value="15">A cada 15 dias</option>
            <option value="30">A cada 30 dias (Mensal)</option>
            <option value="60">A cada 60 dias</option>
            <option value="0">Desativado (Manter tudo no banco de dados)</option>
          </select>
          <p className="text-[11px] text-zinc-400 mt-1">
            O sistema limpa da agenda os cancelamentos e faltas mais antigos que esse prazo automaticamente, sem apagar o histórico de atendimentos nem os pontos de fidelidade dos clientes.
          </p>
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
            onClick={() => setModalLimparAberto(true)}
            className="flex items-center justify-center gap-2 text-xs font-bold py-2.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Zerar Agendamentos de Teste</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExecutarLimpeza("CANCELADOS")}
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
        title="Zerar Agendamentos de Teste"
        description="Atenção: esta ação apagará os atendimentos de teste"
        icon={<Trash2 className="w-5 h-5 text-red-400" />}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-900/40 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-red-200">Atenção: Ação Irreversível</h4>
              <p className="text-xs text-red-300/80 leading-relaxed">
                Isso irá apagar todos os agendamentos registrados no painel para deixar a agenda 100% limpa para a inauguração. Seus <strong>Serviços</strong>, <strong>Preços</strong> e <strong>Horários</strong> permanecerão salvos.
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
              onClick={() => handleExecutarLimpeza("TODOS")}
              className="text-xs font-bold shadow-lg shadow-red-500/20"
            >
              Sim, Limpar Tudo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
