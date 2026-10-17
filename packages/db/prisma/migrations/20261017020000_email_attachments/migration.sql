ALTER TABLE "Email" ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StoredAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailAttachment" (
    "emailId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("emailId", "attachmentId")
);

CREATE INDEX "EmailAttachment_attachmentId_idx" ON "EmailAttachment"("attachmentId");

ALTER TABLE "StoredAttachment" ADD CONSTRAINT "StoredAttachment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailId_fkey"
  FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "StoredAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
