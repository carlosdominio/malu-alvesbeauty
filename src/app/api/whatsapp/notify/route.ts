import { NextResponse } from "next/server";
import { DataStore } from "@/lib/dataStore";
import { EvolutionService } from "@/lib/evolutionService";
import { formatarMensagem, MENSAGENS_PADRAO } from "@/lib/whatsappTemplates";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tipo, telefone, nome, servicoTitulo, dataHora, totalVisitas } = body;

    if (!telefone) {
      return NextResponse.json({ success: false, message: "Telefone não informado" }, { status: 400 });
    }

    const config = await DataStore.getConfig();
    const zapCfg = config.mensagens_zap;

    // Se robô estiver desativado, não envia
    if (zapCfg?.robo_ativo === false) {
      return NextResponse.json({ success: false, message: "Atendimento automático desativado" });
    }

    let dataFormatada = "";
    let horaFormatada = "";
    if (dataHora) {
      const partes = String(dataHora).split("T");
      if (partes[0]) {
        dataFormatada = partes[0].split("-").reverse().slice(0, 2).join("/");
      }
      if (partes[1]) {
        horaFormatada = partes[1].slice(0, 5);
      }
    }

    let template = "";
    let variaveis: Record<string, string | number | undefined> = {};

    switch (tipo) {
      case "CONCLUIDO":
        template = zapCfg?.agradecimento_fidelidade || MENSAGENS_PADRAO.agradecimento_fidelidade;
        variaveis = {
          cliente: nome || "Cliente",
          visitas: totalVisitas || 1,
          servico: servicoTitulo || "",
        };
        break;

      case "CANCELADO":
        template = zapCfg?.cancelamento_studio || MENSAGENS_PADRAO.cancelamento_studio;
        variaveis = {
          cliente: nome || "Cliente",
          servico: servicoTitulo || "Procedimento",
          data: dataFormatada,
          horario: horaFormatada,
        };
        break;

      case "SINAL_EXPIRADO":
        template = zapCfg?.cancelamento_sinal_expirado || MENSAGENS_PADRAO.cancelamento_sinal_expirado;
        variaveis = {
          cliente: nome || "Cliente",
          servico: servicoTitulo || "Procedimento",
          data: dataFormatada,
          horario: horaFormatada,
        };
        break;

      case "FALTOU":
        template = zapCfg?.falta_comparecimento || MENSAGENS_PADRAO.falta_comparecimento;
        variaveis = {
          cliente: nome || "Cliente",
          servico: servicoTitulo || "Procedimento",
          data: dataFormatada,
          horario: horaFormatada,
        };
        break;

      case "LEMBRETE":
        template = zapCfg?.lembrete_2h || MENSAGENS_PADRAO.lembrete_2h;
        variaveis = {
          cliente: nome || "Cliente",
          servico: servicoTitulo || "Procedimento",
          data: dataFormatada,
          horario: horaFormatada,
        };
        break;

      default:
        return NextResponse.json({ success: false, message: `Tipo desconhecido: ${tipo}` }, { status: 400 });
    }

    const mensagemFinal = formatarMensagem(template, variaveis);
    const enviado = await EvolutionService.sendMessage(telefone, mensagemFinal);

    return NextResponse.json({ success: enviado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[WhatsApp Notify] Erro ao disparar notificação:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
