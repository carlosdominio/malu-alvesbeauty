import { BarbeariaConfig } from "@/types";
import { DataStore } from "@/lib/dataStore";

export interface EvolutionStatusResponse {
  connected: boolean;
  state?: "open" | "connecting" | "close" | "disconnected";
  phone?: string | null;
  error?: string | null;
}

export interface EvolutionQrCodeResponse {
  base64?: string | null;
  pairingCode?: string | null;
  error?: string | null;
}

export class EvolutionService {
  /**
   * Obtém as credenciais da Evolution API configuradas no estúdio ou no .env
   */
  static async getConfig(): Promise<{ apiUrl: string; apiKey: string; instanceName: string } | null> {
    try {
      const config: BarbeariaConfig = await DataStore.getConfig();
      const apiUrl = (config.evolution_api_url || process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
      const apiKey = (config.evolution_api_key || process.env.EVOLUTION_API_KEY || "").trim();
      const instanceName = (config.evolution_instance_name || process.env.EVOLUTION_INSTANCE_NAME || "studio-malu").trim();

      if (!apiUrl || !apiKey) {
        return null;
      }

      return { apiUrl, apiKey, instanceName };
    } catch (e) {
      console.error("[EvolutionAPI] Erro ao obter credenciais:", e);
      return null;
    }
  }

  private static getHeaders(apiKey: string) {
    return {
      "Content-Type": "application/json",
      apikey: apiKey,
    };
  }

  /**
   * Cria a instância na Evolution API se ela ainda não existir
   */
  static async createInstance(customCreds?: { apiUrl: string; apiKey: string; instanceName: string }): Promise<boolean> {
    const creds = customCreds || (await this.getConfig());
    if (!creds) return false;

    try {
      const url = `${creds.apiUrl}/instance/create`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(creds.apiKey),
        body: JSON.stringify({
          instanceName: creds.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });

      return res.ok || res.status === 403; // 403 geralmente significa que já existe
    } catch (err) {
      console.error("[EvolutionAPI] Falha ao criar instância:", err);
      return false;
    }
  }

  /**
   * Verifica o status da conexão da instância na Evolution API
   */
  static async getStatus(customCreds?: { apiUrl: string; apiKey: string; instanceName: string }): Promise<EvolutionStatusResponse> {
    const creds = customCreds || (await this.getConfig());
    if (!creds) {
      return { connected: false, error: "Evolution API não configurada. Preencha URL e Chave API." };
    }

    try {
      type ConnectionState = "open" | "connecting" | "close" | "disconnected";
      let state: ConnectionState = "close";
      let phone: string | null = null;

      // 1. Consulta o estado de conexão imediato
      const url = `${creds.apiUrl}/instance/connectionState/${creds.instanceName}`;
      const res = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(creds.apiKey),
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const rawState = String(data?.instance?.state || data?.state || "close").toLowerCase();
        if (rawState === "open" || rawState === "connecting" || rawState === "close" || rawState === "disconnected") {
          state = rawState;
        }
        if (data?.instance?.ownerJid) {
          phone = data.instance.ownerJid.split("@")[0];
        }
      }

      // 2. Dupla verificação com fetchInstances para garantir precisão e capturar dados do perfil
      if (state !== "open" || !phone) {
        try {
          const fetchUrl = `${creds.apiUrl}/instance/fetchInstances?instanceName=${creds.instanceName}`;
          const fetchRes = await fetch(fetchUrl, {
            method: "GET",
            headers: this.getHeaders(creds.apiKey),
            cache: "no-store",
          });
          if (fetchRes.ok) {
            const list = await fetchRes.json();
            const inst = Array.isArray(list)
              ? list.find((i: { name?: string }) => i.name === creds.instanceName) || list[0]
              : list;
            if (inst) {
              const fetchState = (inst.connectionStatus || inst.status || inst.state || "").toLowerCase();
              if (fetchState === "open") {
                state = "open";
              } else if (fetchState === "connecting" && state !== "open") {
                state = "connecting";
              }
              if (inst.ownerJid) {
                phone = inst.ownerJid.split("@")[0];
              } else if (inst.number) {
                phone = String(inst.number);
              }
            }
          }
        } catch {
          // Fallback silencioso
        }
      }

      return {
        connected: state === "open",
        state,
        phone,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[EvolutionAPI] Falha ao consultar status:", message);
      return { connected: false, error: message };
    }
  }

  /**
   * Obtém o QR Code para conectar o WhatsApp
   */
  static async getQrCode(customCreds?: { apiUrl: string; apiKey: string; instanceName: string }): Promise<EvolutionQrCodeResponse> {
    const creds = customCreds || (await this.getConfig());
    if (!creds) {
      return { base64: null, error: "Evolution API não configurada." };
    }

    try {
      const url = `${creds.apiUrl}/instance/connect/${creds.instanceName}`;
      const res = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(creds.apiKey),
        cache: "no-store",
      });

      if (!res.ok) {
        return { base64: null, error: `Falha ao obter QR Code (${res.status})` };
      }

      const data = await res.json();
      return {
        base64: data.base64 || data.qrcode?.base64 || null,
        pairingCode: data.pairingCode || null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[EvolutionAPI] Falha ao buscar QR Code:", message);
      return { base64: null, error: message };
    }
  }

  /**
   * Envia uma mensagem de texto via Evolution API
   */
  static async sendMessage(phone: string, text: string): Promise<boolean> {
    const creds = await this.getConfig();
    if (!creds) {
      console.warn("[EvolutionAPI] Não foi possível enviar mensagem: credenciais ausentes.");
      return false;
    }

    const telLimpo = phone.replace(/\D/g, "");
    const telFinal = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;

    try {
      const url = `${creds.apiUrl}/message/sendText/${creds.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(creds.apiKey),
        body: JSON.stringify({
          number: telFinal,
          text,
          delay: 1200,
        }),
      });

      if (!res.ok) {
        const erroTxt = await res.text();
        console.error(`[EvolutionAPI] Erro ao enviar mensagem para ${telFinal}:`, erroTxt);
        return false;
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[EvolutionAPI] Falha no envio de mensagem:", message);
      return false;
    }
  }

  /**
   * Configura o webhook na Evolution API apontando para o Barber-OS
   */
  static async configureWebhook(webhookUrl: string, customCreds?: { apiUrl: string; apiKey: string; instanceName: string }): Promise<boolean> {
    const creds = customCreds || (await this.getConfig());
    if (!creds) return false;

    try {
      const url = `${creds.apiUrl}/webhook/set/${creds.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(creds.apiKey),
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT"],
          },
        }),
      });

      return res.ok;
    } catch (err) {
      console.error("[EvolutionAPI] Falha ao registrar webhook:", err);
      return false;
    }
  }

  /**
   * Desconecta o WhatsApp da Evolution API
   */
  static async disconnect(customCreds?: { apiUrl: string; apiKey: string; instanceName: string }): Promise<boolean> {
    const creds = customCreds || (await this.getConfig());
    if (!creds) return false;

    try {
      const url = `${creds.apiUrl}/instance/logout/${creds.instanceName}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: this.getHeaders(creds.apiKey),
      });

      return res.ok;
    } catch (err) {
      console.error("[EvolutionAPI] Falha ao desconectar:", err);
      return false;
    }
  }
}
