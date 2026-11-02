import { OAuth2Client, CodeChallengeMethod, type TokenPayload } from "google-auth-library";
import { googleConfig } from "./config.js";

export interface GoogleProfile { email: string; name: string; avatar?: string; googleId: string }
export interface GoogleProvider {
  authorizationUrl(state: string, nonce: string, codeChallenge: string): string;
  verify(code: string, codeVerifier: string, nonce: string): Promise<GoogleProfile>;
}

export function profileFromPayload(payload: (TokenPayload & { nonce?: string }) | undefined, nonce: string): GoogleProfile {
  if (!payload || payload.nonce !== nonce || payload.email_verified !== true || !payload.email || !payload.sub) {
    throw new Error("Google identity could not be verified.");
  }
  return {
    email: payload.email.trim().toLowerCase(),
    name: payload.name?.trim() || payload.email,
    avatar: payload.picture?.startsWith("https://") ? payload.picture : undefined,
    googleId: payload.sub,
  };
}

function client() {
  const config = googleConfig();
  return new OAuth2Client({ ...config, transporterOptions: { timeout: 15000 } });
}
export const googleProvider: GoogleProvider = {
  authorizationUrl(state, nonce, codeChallenge) {
    return client().generateAuthUrl({
      scope: ["openid", "email", "profile"], state, nonce,
      code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      prompt: "select_account", access_type: "online",
    });
  },
  async verify(code, codeVerifier, nonce) {
    const oauth = client();
    const { tokens } = await oauth.getToken({ code, codeVerifier });
    if (!tokens.id_token) throw new Error("Missing Google identity token.");
    // Google's library validates signature, issuer, audience, and token expiry.
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: googleConfig().clientId });
    return profileFromPayload(ticket.getPayload(), nonce);
  },
};
