CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatar" TEXT,
  "googleId" TEXT NOT NULL,
  "authProvider" TEXT NOT NULL DEFAULT 'google',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email"))),
  CONSTRAINT "User_provider_google" CHECK ("authProvider" = 'google')
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE TABLE "AuthSession" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE TABLE "OAuthAttempt" (
  "stateHash" TEXT NOT NULL PRIMARY KEY,
  "browserHash" TEXT NOT NULL,
  "codeVerifier" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
