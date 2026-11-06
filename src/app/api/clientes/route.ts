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

export async function DELETE() {
  try {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("clientes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (err) {
        console.error("Erro ao limpar clientes no Supabase:", err);
      }
    }

    const removidos = ServerStore.limparClientes();
    return NextResponse.json({
      success: true,
      message: "Histórico de clientes limpo com sucesso.",
      removidos,
    });
  } catch (error) {
    console.error("Erro ao limpar clientes:", error);
    return NextResponse.json({ error: "Erro interno ao limpar clientes" }, { status: 500 });
  }
}
