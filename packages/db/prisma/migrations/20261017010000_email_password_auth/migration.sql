ALTER TABLE "User"
  ALTER COLUMN "googleId" DROP NOT NULL,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TYPE "AuthTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

CREATE TABLE "AuthToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "tokenHash" TEXT NOT NULL,
  "purpose" "AuthTokenPurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_email_purpose_expiresAt_idx" ON "AuthToken"("email", "purpose", "expiresAt");
