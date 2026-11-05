import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clientes = ServerStore.getClientes();
    return NextResponse.json(clientes);
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
