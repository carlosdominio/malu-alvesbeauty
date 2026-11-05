import { NextResponse } from "next/server";
import { DataStore } from "@/lib/dataStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { usuario, senha } = body;

    if (!usuario || !senha) {
      return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
    }

    let configUsuario = "admin";
    let configSenha = "Malu@2026";

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from("barbearia_config").select("admin_usuario, admin_senha").limit(1).single();
      if (data) {
        configUsuario = data.admin_usuario || configUsuario;
        configSenha = data.admin_senha || configSenha;
      }
    } else {
      const cfg = await DataStore.getConfig();
      configUsuario = cfg.admin_usuario || configUsuario;
      configSenha = cfg.admin_senha || configSenha;
    }

    if (usuario.trim() === configUsuario && senha === configSenha) {
      const token = Buffer.from(`${usuario}:${Date.now()}:studio_malu_auth`).toString("base64");
      
      const response = NextResponse.json({ success: true, token });
      response.cookies.set("malu_admin_auth", token, {
        path: "/",
        httpOnly: false, // Accessible to client-side auth guard
        maxAge: 60 * 60 * 24 * 30, // 30 days
        sameSite: "lax",
      });

      return response;
    }

    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  } catch (error) {
    console.error("Erro no login:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
