"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { DiaSemana, ExpedienteDia } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const DIAS_NOMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export default function HorariosPage() {
  const [expedientes, setExpedientes] = useState<ExpedienteDia[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    DataStore.getExpediente().then(setExpedientes);
  }, []);

  const handleChange = <K extends keyof ExpedienteDia>(
    diaSemana: DiaSemana,
    field: K,
    value: ExpedienteDia[K]
  ) => {
    setExpedientes((prev) =>
      prev.map((exp) => (exp.dia_semana === diaSemana ? { ...exp, [field]: value } : exp))
    );
  };

  const handleSalvar = async () => {
    setSalvando(true);
    await DataStore.updateExpediente(expedientes);
    setSalvando(false);
    setSucesso(true);
    setTimeout(() => setSucesso(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-100">Horários de Atendimento</h2>
          <p className="text-xs text-zinc-400">
            Defina os dias que você atende, horário de abertura, fechamento e intervalo de almoço.
          </p>
        </div>

        <Button
          variant="gold"
          size="md"
          loading={salvando}
          onClick={handleSalvar}
          className="flex items-center gap-1.5 text-xs font-bold"
        >
          {sucesso ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{sucesso ? "Salvo com Sucesso!" : "Salvar Horários"}</span>
        </Button>
      </div>

      <div className="space-y-3">
        {expedientes.map((exp) => {
          const nomeDia = DIAS_NOMES[exp.dia_semana];

          return (
            <div
              key={exp.dia_semana}
              className={cn(
                "p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
                exp.ativo ? "bg-zinc-900 border-zinc-800" : "bg-zinc-900/40 border-zinc-800/40 opacity-60"
              )}
            >
              {/* Checkbox de Ativo & Nome do Dia */}
              <div className="flex items-center gap-3 min-w-[160px]">
                <input
                  type="checkbox"
                  id={`dia-${exp.dia_semana}`}
                  checked={exp.ativo}
                  onChange={(e) => handleChange(exp.dia_semana, "ativo", e.target.checked)}
                  className="w-5 h-5 rounded-lg accent-amber-500 cursor-pointer"
                />
                <label
                  htmlFor={`dia-${exp.dia_semana}`}
                  className="font-bold text-sm text-zinc-100 cursor-pointer select-none"
                >
                  {nomeDia}
                </label>
              </div>

              {/* Horários de Expediente */}
              {exp.ativo ? (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Expediente */}
                  <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 font-semibold">Abre:</span>
                    <input
                      type="time"
                      value={exp.hora_inicio}
                      onChange={(e) => handleChange(exp.dia_semana, "hora_inicio", e.target.value)}
                      className="bg-transparent text-zinc-100 font-bold focus:outline-none"
                    />
                    <span className="text-zinc-500">até</span>
                    <input
                      type="time"
                      value={exp.hora_fim}
                      onChange={(e) => handleChange(exp.dia_semana, "hora_fim", e.target.value)}
                      className="bg-transparent text-zinc-100 font-bold focus:outline-none"
                    />
                  </div>

                  {/* Intervalo de Almoço */}
                  <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 font-semibold">Almoço:</span>
                    <input
                      type="time"
                      value={exp.intervalo_inicio || "12:00"}
                      onChange={(e) => handleChange(exp.dia_semana, "intervalo_inicio", e.target.value)}
                      className="bg-transparent text-zinc-100 font-bold focus:outline-none"
                    />
                    <span className="text-zinc-500">às</span>
                    <input
                      type="time"
                      value={exp.intervalo_fim || "13:00"}
                      onChange={(e) => handleChange(exp.dia_semana, "intervalo_fim", e.target.value)}
                      className="bg-transparent text-zinc-100 font-bold focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-zinc-500 italic">Fechado o dia todo</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
