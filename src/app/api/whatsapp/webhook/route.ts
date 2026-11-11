import { NextResponse } from "next/server";
import { EvolutionService } from "@/lib/evolutionService";
import { WhatsAppBotEngine } from "@/lib/whatsappBotEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, message: "Webhook Evolution API ativo no Studio Malu Alves Beauty" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Evolution API v2 envia os dados dentro de body.data
    const data = body.data || body;
    const key = data.key || {};

    // Ignora mensagens enviadas pelo próprio robô, grupos ou status
    if (key.fromMe || !key.remoteJid || key.remoteJid.includes("@g.us") || key.remoteJid === "status@broadcast") {
      return NextResponse.json({ ignored: true });
    }

    const remoteJid = key.remoteJid;
    const pushName = data.pushName || "";

    // Extrai o texto da mensagem
    const messageContent =
      data.message?.ephemeralMessage?.message ||
      data.message?.viewOnceMessage?.message ||
      data.message?.viewOnceMessageV2?.message ||
      data.message?.documentWithCaptionMessage?.message ||
      data.message ||
      {};

    const texto = (
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.documentMessage?.caption ||
      ""
    ).trim();

    const ehMidia = Boolean(messageContent.imageMessage || messageContent.documentMessage);

    // Se não tiver texto nem mídia, ignora
    if (!texto && !ehMidia) {
      return NextResponse.json({ ignored: true });
    }

    // Identifica se o remetente é um Linked Device (@lid) ou número comum
    const isLid = remoteJid.includes("@lid");
    const realPhoneCandidate = String(key.participantPn || key.senderPn || data.sender || key.remoteJidAlt || "").replace(/@.*$/, "").replace(/\D/g, "");

    // Para responder: se for @lid e não tivermos o telefone real garantido, responde diretamente no remoteJid (@lid)
    const replyTarget = (!isLid || realPhoneCandidate.length >= 10) && realPhoneCandidate
      ? realPhoneCandidate
      : remoteJid;

    // Para o motor de agendamento (sessão interna)
    const phone = realPhoneCandidate && realPhoneCandidate.length >= 10
      ? realPhoneCandidate
      : remoteJid.replace(/@.*$/, "").replace(/\D/g, "");

    console.log(`[EvolutionWebhook] Mensagem de ${phone} (${pushName}) [destino: ${replyTarget}]: "${texto || "[Mídia]"}"`);

    // Processa a mensagem no motor do Studio
    const resposta = await WhatsAppBotEngine.processMessage(phone, texto, pushName, ehMidia);

    if (resposta) {
      console.log(`[EvolutionWebhook] Respondendo para ${replyTarget}...`);
      await EvolutionService.sendMessage(replyTarget, resposta);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[EvolutionWebhook] Erro ao processar webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
