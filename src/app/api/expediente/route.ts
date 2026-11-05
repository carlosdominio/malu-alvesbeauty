import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { expedienteInicial } from "@/lib/mockData";
import { ExpedienteDia } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("expediente")
        .select("*")
        .order("dia_semana", { ascending: true });

      if (!error && data && data.length > 0) {
        return NextResponse.json(data, {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      }
    }

    return NextResponse.json(expedienteInicial, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("Erro ao buscar expediente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const expedientes: ExpedienteDia[] = await req.json();

    if (!Array.isArray(expedientes) || expedientes.length === 0) {
      return NextResponse.json(
        { error: "Lista de expedientes inválida" },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("expediente")
        .upsert(expedientes)
        .select();

      if (error) {
        console.error("Erro ao atualizar expediente no Supabase:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, data }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    return NextResponse.json({ ok: true, data: expedientes });
  } catch (error) {
    console.error("Erro ao salvar expediente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
