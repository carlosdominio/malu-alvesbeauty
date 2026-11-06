"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles, Pencil, Trash2, Check, X } from "lucide-react";
import { Servico } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { formatarMoeda, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export default function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoServico, setEditandoServico] = useState<Servico | null>(null);
  const [servicoParaExcluir, setServicoParaExcluir] = useState<Servico | null>(null);

  // Form states
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [duracao, setDuracao] = useState("30");
  const [emPromocao, setEmPromocao] = useState(false);
  const [precoPromocional, setPrecoPromocional] = useState("");

  const carregarServicos = async () => {
    setLoading(true);
    const data = await DataStore.getServicos();
    setServicos(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarServicos();
  }, []);

  const abrirModalNovo = () => {
    setEditandoServico(null);
    setTitulo("");
    setDescricao("");
    setPreco("");
    setDuracao("30");
    setEmPromocao(false);
    setPrecoPromocional("");
    setModalAberto(true);
  };

  const abrirModalEditar = (s: Servico) => {
    setEditandoServico(s);
    setTitulo(s.titulo);
    setDescricao(s.descricao || "");
    setPreco(String(s.preco));
    setDuracao(String(s.duracao_minutos));
    setEmPromocao(s.em_promocao ?? false);
    setPrecoPromocional(s.preco_promocional ? String(s.preco_promocional) : "");
    setModalAberto(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const precoNum = parseFloat(preco.replace(",", "."));
    const precoPromoNum = emPromocao && precoPromocional ? parseFloat(precoPromocional.replace(",", ".")) : undefined;

    await DataStore.saveServico({
      id: editandoServico?.id,
      titulo,
      descricao,
      preco: precoNum,
      duracao_minutos: parseInt(duracao, 10),
      ativo: editandoServico ? editandoServico.ativo : true,
      em_promocao: emPromocao,
      preco_promocional: precoPromoNum,
    });
    setModalAberto(false);
    carregarServicos();
  };

  const handleToggleAtivo = async (id: string) => {
    await DataStore.toggleServicoAtivo(id);
    carregarServicos();
  };

  const confirmarExclusao = async () => {
    if (!servicoParaExcluir) return;
    await DataStore.deleteServico(servicoParaExcluir.id);
    setServicoParaExcluir(null);
    carregarServicos();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-100">Catálogo de Serviços</h2>
          <p className="text-xs text-zinc-400">
            Cadastre os serviços de design de sobrancelhas, procedimentos e defina preços e duração.
          </p>
        </div>

        <Button
          variant="gold"
          size="sm"
          onClick={abrirModalNovo}
          className="flex items-center gap-1.5 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Serviço</span>
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-zinc-500 text-sm">Carregando catálogo...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servicos.map((s) => (
            <div
              key={s.id}
              className={cn(
                "p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4",
                s.ativo
                  ? "bg-zinc-900 border-zinc-800"
                  : "bg-zinc-900/40 border-zinc-800/40 opacity-60"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-100 text-base">{s.titulo}</h3>
                      <p className="text-xs text-zinc-400">{s.duracao_minutos} minutos de atendimento</p>
                    </div>
                  </div>

                  {s.em_promocao && s.preco_promocional ? (
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-xs line-through text-zinc-500 font-bold">
                          {formatarMoeda(s.preco)}
                        </span>
                        <span className="text-base font-black text-amber-400">
                          {formatarMoeda(s.preco_promocional)}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-block mt-0.5">
                        🔥 Em Promoção
                      </span>
                    </div>
                  ) : (
                    <span className="text-base font-black text-amber-400">
                      {formatarMoeda(s.preco)}
                    </span>
                  )}
                </div>

                {s.descricao && (
                  <p className="text-xs text-zinc-400 mt-3 line-clamp-2 leading-relaxed">
                    {s.descricao}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleToggleAtivo(s.id)}
                  className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5",
                    s.ativo
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                      : "text-zinc-400 bg-zinc-800 border-zinc-700"
                  )}
                >
                  {s.ativo ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  <span>{s.ativo ? "Ativo no Site" : "Inativo"}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => abrirModalEditar(s)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setServicoParaExcluir(s)}
                    className="p-2 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir Procedimento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Cadastro/Edição de Serviço */}
      <Modal
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editandoServico ? "Editar Procedimento" : "Novo Procedimento"}
        description="Defina os detalhes, valor e tempo de atendimento do serviço"
        icon={<Sparkles className="w-5 h-5 text-amber-400" />}
      >
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Título do Serviço</label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Design com Henna"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Descrição (opcional)</label>
            <textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Alinhamento visagista com aplicação de henna para realce."
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Preço (R$)</label>
              <input
                type="number"
                step="0.50"
                required
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="35.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Duração (Minutos)</label>
              <select
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                <option value="10">10 minutos</option>
                <option value="15">15 minutos</option>
                <option value="20">20 minutos</option>
                <option value="25">25 minutos</option>
                <option value="30">30 minutos</option>
                <option value="40">40 minutos</option>
                <option value="45">45 minutos</option>
                <option value="50">50 minutos</option>
                <option value="60">1 hora</option>
                <option value="90">1h30</option>
              </select>
            </div>
          </div>

          {/* Opção de Promoção */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-zinc-200 block">Ativar Preço Promocional?</label>
                <p className="text-[11px] text-zinc-400">
                  Destaca o serviço no catálogo e no robô do WhatsApp com valor promocional.
                </p>
              </div>
              <input
                type="checkbox"
                checked={emPromocao}
                onChange={(e) => setEmPromocao(e.target.checked)}
                className="w-5 h-5 rounded-lg accent-amber-500 cursor-pointer"
              />
            </div>

            {emPromocao && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-2 animate-in fade-in duration-200">
                <label className="text-xs font-bold text-amber-400 block">
                  Valor Promocional (R$)
                </label>
                <input
                  type="number"
                  step="0.50"
                  required={emPromocao}
                  value={precoPromocional}
                  onChange={(e) => setPrecoPromocional(e.target.value)}
                  placeholder="Ex: 25.00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-amber-500/40 text-sm text-zinc-100 focus:outline-none focus:border-amber-400 font-bold"
                />
                {preco && precoPromocional && parseFloat(precoPromocional) < parseFloat(preco) && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    ✨ Economia de {formatarMoeda(parseFloat(preco) - parseFloat(precoPromocional))} ({Math.round(((parseFloat(preco) - parseFloat(precoPromocional)) / parseFloat(preco)) * 100)}% de desconto para as clientes)
                  </p>
                )}
              </div>
            )}
          </div>

          <Button type="submit" variant="gold" size="lg" className="w-full font-bold">
            Salvar Serviço
          </Button>
        </form>
      </Modal>

      {/* MODAL PERSONALIZADO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <Modal
        isOpen={!!servicoParaExcluir}
        onClose={() => setServicoParaExcluir(null)}
        title="Excluir Procedimento?"
        description="Esta ação removerá o serviço da agenda e do catálogo online."
        icon={<Trash2 className="w-5 h-5 text-red-400" />}
        maxWidth="sm"
      >
        {servicoParaExcluir && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-red-500/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">
                  Procedimento
                </span>
                <h4 className="font-extrabold text-white text-base mt-0.5">
                  {servicoParaExcluir.titulo}
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Duração: {servicoParaExcluir.duracao_minutos} min
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  Preço
                </span>
                <p className="text-base font-black text-amber-400 mt-0.5">
                  {formatarMoeda(servicoParaExcluir.preco)}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-300 leading-relaxed flex items-start gap-2.5">
              <span className="text-base leading-none">⚠️</span>
              <span>
                Tem certeza que deseja apagar <strong>{servicoParaExcluir.titulo}</strong>? Novas clientes não poderão mais selecioná-lo no agendamento.
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setServicoParaExcluir(null)}
                className="flex-1 text-zinc-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={confirmarExclusao}
                className="flex-1 font-bold shadow-lg shadow-red-500/20"
              >
                Sim, Excluir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
