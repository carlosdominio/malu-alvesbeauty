import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";
import {
  isSupabaseConfigured,
  supabase,
  toSupabaseConfigPayload,
  fromSupabaseConfigPayload,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configServidor = ServerStore.getConfig();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("barbearia_config").select("*").limit(1).single();
      if (!error && data) {
        const configCombinado = fromSupabaseConfigPayload(data, configServidor);
        // Garante que o ServerStore (data_storage.json) também fica com a versão mais recente
        ServerStore.updateConfig(configCombinado);
        return NextResponse.json(configCombinado);
      }
    }

    return NextResponse.json(configServidor);
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);
    return NextResponse.json(ServerStore.getConfig());
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const atualizado = ServerStore.updateConfig(body);

    if (isSupabaseConfigured && supabase) {
      try {
        const payloadSupabase = toSupabaseConfigPayload(atualizado);
        const { error } = await supabase.from("barbearia_config").upsert(payloadSupabase);
        if (error) {
          console.error("Erro no upsert de config no Supabase:", error.message);
        } else {
          console.log(">>> [Supabase] Configurações e Mensagens salvas com sucesso!");
        }
      } catch (err) {
        console.error("Erro ao atualizar config no Supabase:", err);
      }
    }

    return NextResponse.json(atualizado);
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    return NextResponse.json({ error: "Erro interno ao salvar configurações" }, { status: 500 });
  }
}
