export type VerifiedJwt = {
  subject: string;
  payload: Record<string, unknown>;
  isActive: boolean;
};

export type JwtVerifier = {
  verify(token: string): Promise<VerifiedJwt>;
};

export class JwtVerificationError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
  }
}

export function subjectFromPayload(payload: Record<string, unknown>): string {
  const subject = payload.sub;

  if (typeof subject !== "string" || subject.trim() === "") {
    throw new JwtVerificationError("Token subject is required");
  }

  return subject;
}
