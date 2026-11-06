import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("barbearia_config").select("*").limit(1).single();
      if (!error && data) {
        return NextResponse.json(data);
      }
    }
    const config = ServerStore.getConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);
    return NextResponse.json({ error: "Erro interno ao buscar configurações" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const atualizado = ServerStore.updateConfig(body);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("barbearia_config").upsert(atualizado);
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
