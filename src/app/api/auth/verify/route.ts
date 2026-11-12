import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queryToken = searchParams.get("token");

    const cookieStore = cookies();
    const cookieToken = cookieStore.get("malu_admin_auth")?.value;

    const token = queryToken || cookieToken;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const { valid, usuario } = verifyAdminToken(token);

    if (!valid) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, usuario });
  } catch (error) {
    console.error("Erro na verificação de token:", error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
