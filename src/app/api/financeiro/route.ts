import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const periodo = (searchParams.get("periodo") as "HOJE" | "SEMANA" | "MES" | "TODOS") || "TODOS";

    const removidos = ServerStore.limparHistoricoFinanceiro(periodo);

    if (isSupabaseConfigured && supabase) {
      try {
        if (periodo === "TODOS") {
          await supabase.from("agendamentos").delete().eq("status", "CONCLUIDO");
        }
      } catch (errDb) {
        console.error("Erro ao limpar no Supabase:", errDb);
      }
    }

    return NextResponse.json({ success: true, removidos });
  } catch (error) {
    console.error("Erro ao limpar financeiro:", error);
    return NextResponse.json({ error: "Erro interno ao limpar histórico financeiro" }, { status: 500 });
  }
}
