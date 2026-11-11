import { NextResponse } from "next/server";
import { DataStore } from "@/lib/dataStore";
import { EvolutionService } from "@/lib/evolutionService";
import { formatarMensagem, MENSAGENS_PADRAO } from "@/lib/whatsappTemplates";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tipo = "SINAL_EXPIRADO", telefone, nome, servicoTitulo, dataHora } = body;

    if (!telefone) {
      return NextResponse.json({ success: false, message: "Telefone não informado" }, { status: 400 });
    }

    const config = await DataStore.getConfig();
    const zapCfg = config.mensagens_zap;

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

    const template =
      tipo === "CANCELADO"
        ? zapCfg?.cancelamento_studio || MENSAGENS_PADRAO.cancelamento_studio
        : zapCfg?.cancelamento_sinal_expirado || MENSAGENS_PADRAO.cancelamento_sinal_expirado;

    const mensagemFinal = formatarMensagem(template, {
      cliente: nome || "Cliente",
      servico: servicoTitulo || "Procedimento",
      data: dataFormatada,
      horario: horaFormatada,
    });

    const enviado = await EvolutionService.sendMessage(telefone, mensagemFinal);
    return NextResponse.json({ success: enviado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[WhatsApp Cancel Notify] Erro:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
