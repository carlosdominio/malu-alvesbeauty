import crypto from "crypto";

const JWT_SECRET =
  process.env.JWT_SECRET || "malu_beauty_studio_secret_key_2026_jwt_token";

export interface TokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export function signAdminToken(usuario: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: usuario,
      role: "admin",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 dias de validade
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export function verifyAdminToken(token: string): { valid: boolean; usuario?: string } {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false };
    }

    // Suporte a retrocompatibilidade com tokens simples antigos
    if (!token.includes(".")) {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      if (decoded.includes(":studio_malu_auth")) {
        return { valid: true, usuario: decoded.split(":")[0] };
      }
      return { valid: false };
    }

    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      return { valid: false };
    }

    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const parsedPayload: TokenPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );

    if (parsedPayload.exp && parsedPayload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    return { valid: true, usuario: parsedPayload.sub };
  } catch {
    return { valid: false };
  }
}
