import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("clientes").select("*").order("total_visitas", { ascending: false });
      if (!error && data && data.length > 0) {
        return NextResponse.json(data);
      }
    }
    const clientes = ServerStore.getClientes();
    return NextResponse.json(clientes);
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
