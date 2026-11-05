import { Agendamento, BloqueioAgenda, DiaSemana, ExpedienteDia, HorarioSlot, Servico } from "@/types";

interface CalcularSlotsParams {
  data: string; // YYYY-MM-DD
  servico: Servico;
  expedientes: ExpedienteDia[];
  agendamentosExistentes: Agendamento[];
  bloqueios: BloqueioAgenda[];
  tempoBufferMinutos?: number;
  limiteMaximoDia?: number;
}

/**
 * Converte "HH:mm" para minutos desde o início do dia (ex: "09:30" => 570)
 */
function horaParaMinutos(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Converte minutos desde o início do dia para "HH:mm" (ex: 570 => "09:30")
 */
function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * MOTOR DE AGENDAMENTO CENTRAL:
 * Calcula os slots livres e valida lotação máxima diária.
 */
export function calcularSlotsDisponiveis({
  data,
  servico,
  expedientes,
  agendamentosExistentes,
  bloqueios,
  limiteMaximoDia = 15,
}: CalcularSlotsParams): { slots: HorarioSlot[]; aberto: boolean; motivoFechado?: string; lotado?: boolean } {
  // 1. Descobrir dia da semana da data solicitada
  const [ano, mes, dia] = data.split("-").map(Number);
  const dataAlvo = new Date(ano, mes - 1, dia);
  const diaSemana = dataAlvo.getDay() as DiaSemana;

  // 2. Buscar o expediente correspondente
  const expediente = expedientes.find((e) => e.dia_semana === diaSemana);

  if (!expediente || !expediente.ativo) {
    return {
      slots: [],
      aberto: false,
      motivoFechado: "A barbearia não abre neste dia da semana.",
    };
  }

  // 3. Filtrar agendamentos ativos para o dia
  const agendamentosDoDia = agendamentosExistentes.filter((ag) => {
    if (ag.status === "CANCELADO") return false;
    const agData = ag.horario_inicio.split("T")[0];
    return agData === data;
  });

  // 4. Checar se atingiu o limite máximo de agendamentos para o dia
  if (agendamentosDoDia.length >= limiteMaximoDia) {
    return {
      slots: [],
      aberto: false,
      lotado: true,
      motivoFechado: `Dia com lotação máxima atingida (${agendamentosDoDia.length}/${limiteMaximoDia} agendamentos).`,
    };
  }

  const inicioExpediente = horaParaMinutos(expediente.hora_inicio);
  const fimExpediente = horaParaMinutos(expediente.hora_fim);

  // Mapear intervalos de almoço/descanso
  const temIntervalo = expediente.intervalo_inicio && expediente.intervalo_fim;
  const inicioIntervalo = temIntervalo ? horaParaMinutos(expediente.intervalo_inicio!) : null;
  const fimIntervalo = temIntervalo ? horaParaMinutos(expediente.intervalo_fim!) : null;

  // Mapear ocupação em minutos dos agendamentos
  const ocupacoesExistentes = agendamentosDoDia.map((ag) => {
    const horaPart = ag.horario_inicio.split("T")[1] || "09:00";
    const minInicio = horaParaMinutos(horaPart.slice(0, 5));
    const minFim = minInicio + (ag.duracao_minutos || 30);
    return { inicio: minInicio, fim: minFim };
  });

  // Mapear bloqueios manuais para o dia
  const bloqueiosDoDia = bloqueios.filter((b) => {
    const bInicio = b.data_inicio.split("T")[0];
    const bFim = b.data_fim.split("T")[0];
    return data >= bInicio && data <= bFim;
  });

  const ocupacoesBloqueios = bloqueiosDoDia.map((b) => {
    const horaPart = b.data_inicio.split("T")[1] || "09:00";
    const horaFimPart = b.data_fim.split("T")[1] || "10:00";
    return {
      inicio: horaParaMinutos(horaPart.slice(0, 5)),
      fim: horaParaMinutos(horaFimPart.slice(0, 5)),
    };
  });

  const todasOcupacoes = [...ocupacoesExistentes, ...ocupacoesBloqueios];

  // Verificar se a data é hoje para filtrar horários que já passaram
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const ehHoje = data === hojeStr;
  const minutoAtualAgora = ehHoje ? agora.getHours() * 60 + agora.getMinutes() : -1;

  // Gerar slots com incremento de 15 em 15 minutos
  const slots: HorarioSlot[] = [];
  const passoIncremento = 15;

  for (
    let slotInicio = inicioExpediente;
    slotInicio + servico.duracao_minutos <= fimExpediente;
    slotInicio += passoIncremento
  ) {
    const slotFim = slotInicio + servico.duracao_minutos;

    // Se é hoje e o horário já passou (com 15 min de antecedência mínima)
    if (ehHoje && slotInicio <= minutoAtualAgora + 15) {
      continue;
    }

    // Verificar se cruza com o intervalo de almoço
    let conflitoIntervalo = false;
    if (temIntervalo && inicioIntervalo !== null && fimIntervalo !== null) {
      if (slotInicio < fimIntervalo && slotFim > inicioIntervalo) {
        conflitoIntervalo = true;
      }
    }

    if (conflitoIntervalo) {
      continue;
    }

    // Verificar se colide com algum agendamento ou bloqueio existente
    const temConflito = todasOcupacoes.some((ocp) => {
      return Math.max(slotInicio, ocp.inicio) < Math.min(slotFim, ocp.fim);
    });

    if (!temConflito) {
      slots.push({
        hora_inicio: minutosParaHora(slotInicio),
        hora_fim: minutosParaHora(slotFim),
        disponivel: true,
      });
    }
  }

  return {
    slots,
    aberto: true,
    lotado: false,
  };
}
