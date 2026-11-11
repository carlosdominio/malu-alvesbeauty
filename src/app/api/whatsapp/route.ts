import { NextResponse } from "next/server";
import { EvolutionService, EvolutionQrCodeResponse } from "@/lib/evolutionService";
import { DataStore } from "@/lib/dataStore";

export const dynamic = "force-dynamic";

const DEFAULT_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/whatsapp/webhook`
    : "https://malu-alvesbeauty.vercel.app/api/whatsapp/webhook";

export async function GET() {
  try {
    const creds = await EvolutionService.getConfig();

    if (!creds || !creds.apiUrl || !creds.apiKey) {
      return NextResponse.json({
        configured: false,
        status: "DISCONNECTED",
        connectedPhone: null,
        qrCodeBase64: null,
        apiUrl: creds?.apiUrl || "",
        instanceName: creds?.instanceName || "studio-malu",
        webhookUrl: DEFAULT_WEBHOOK_URL,
        message: "Evolution API não configurada. Informe a URL e a Chave de API.",
      });
    }

    const status = await EvolutionService.getStatus(creds);

    if (status.connected) {
      return NextResponse.json({
        configured: true,
        status: "CONNECTED",
        connectedPhone: status.phone || null,
        qrCodeBase64: null,
        apiUrl: creds.apiUrl,
        instanceName: creds.instanceName,
        webhookUrl: DEFAULT_WEBHOOK_URL,
      });
    }

    if (status.state === "connecting") {
      return NextResponse.json({
        configured: true,
        status: "CONNECTING",
        connectedPhone: null,
        qrCodeBase64: null,
        apiUrl: creds.apiUrl,
        instanceName: creds.instanceName,
        webhookUrl: DEFAULT_WEBHOOK_URL,
      });
    }

    return NextResponse.json({
      configured: true,
      status: "DISCONNECTED",
      connectedPhone: null,
      qrCodeBase64: null,
      pairingCode: null,
      apiUrl: creds.apiUrl,
      instanceName: creds.instanceName,
      webhookUrl: DEFAULT_WEBHOOK_URL,
      error: status.error || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[WhatsApp Route] Erro no GET:", message);
    return NextResponse.json(
      {
        configured: false,
        status: "DISCONNECTED",
        connectedPhone: null,
        qrCodeBase64: null,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action || "START";

    // 1. Salvar credenciais da Evolution API e configurar Webhook automaticamente
    if (action === "SAVE_EVOLUTION") {
      const apiUrl = (body.apiUrl || "").trim().replace(/\/$/, "");
      const apiKey = (body.apiKey || "").trim();
      const instanceName = (body.instanceName || "studio-malu").trim();

      if (!apiUrl || !apiKey) {
        return NextResponse.json(
          { error: "URL da API e Chave API (Token) são obrigatórios." },
          { status: 400 }
        );
      }

      // Persistir no banco de dados
      await DataStore.updateConfig({
        evolution_api_url: apiUrl,
        evolution_api_key: apiKey,
        evolution_instance_name: instanceName,
      });

      const creds = { apiUrl, apiKey, instanceName };

      // Garante que a instância exista na Evolution API
      await EvolutionService.createInstance(creds);

      // Configura automaticamente o webhook para receber as mensagens no Vercel
      const webhookUrl = body.webhookUrl || DEFAULT_WEBHOOK_URL;
      await EvolutionService.configureWebhook(webhookUrl, creds);

      // Consulta o status atual e tenta gerar o QR Code
      const status = await EvolutionService.getStatus(creds);
      let qrData: EvolutionQrCodeResponse = { base64: null, pairingCode: null };

      if (!status.connected) {
        qrData = await EvolutionService.getQrCode(creds);
      }

      return NextResponse.json({
        success: true,
        configured: true,
        status: status.connected ? "CONNECTED" : qrData.base64 ? "CONNECTING" : "DISCONNECTED",
        connectedPhone: status.phone || null,
        qrCodeBase64: qrData.base64,
        pairingCode: qrData.pairingCode,
        webhookUrl,
      });
    }

    // 2. Iniciar conexão / Gerar QR Code
    if (action === "START") {
      const creds = await EvolutionService.getConfig();
      if (!creds) {
        return NextResponse.json(
          { error: "Configure a Evolution API antes de iniciar a conexão." },
          { status: 400 }
        );
      }

      await EvolutionService.createInstance(creds);
      const qrData = await EvolutionService.getQrCode(creds);

      return NextResponse.json({
        success: true,
        status: qrData.base64 ? "CONNECTING" : "DISCONNECTED",
        qrCodeBase64: qrData.base64,
        pairingCode: qrData.pairingCode,
        error: qrData.error,
      });
    }

    // 3. Desconectar WhatsApp
    if (action === "DISCONNECT") {
      const creds = await EvolutionService.getConfig();
      if (creds) {
        await EvolutionService.disconnect(creds);
      }
      return NextResponse.json({ success: true, status: "DISCONNECTED" });
    }

    // 4. Configurar Webhook explicitamente
    if (action === "CONFIGURE_WEBHOOK") {
      const webhookUrl = body.webhookUrl || DEFAULT_WEBHOOK_URL;
      const ok = await EvolutionService.configureWebhook(webhookUrl);
      return NextResponse.json({ success: ok, webhookUrl });
    }

    return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[WhatsApp Route] Erro no POST:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
