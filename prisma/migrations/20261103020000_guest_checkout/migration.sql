BEGIN;

ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
ALTER TABLE "ReplacementRequest" DROP CONSTRAINT "ReplacementRequest_customerId_fkey";

ALTER TABLE "Order"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "email" TEXT;

UPDATE "Order"
SET
  "firstName" = COALESCE(
    NULLIF("contactSnapshot" ->> 'firstName', ''),
    NULLIF(split_part(COALESCE("contactSnapshot" ->> 'name', "contactSnapshot" ->> 'fullName', ''), ' ', 1), ''),
    'Guest'
  ),
  "lastName" = COALESCE(
    NULLIF("contactSnapshot" ->> 'lastName', ''),
    NULLIF(trim(substr(
      COALESCE("contactSnapshot" ->> 'name', "contactSnapshot" ->> 'fullName', ''),
      NULLIF(position(' ' IN COALESCE("contactSnapshot" ->> 'name', "contactSnapshot" ->> 'fullName', '')), 0) + 1
    )), ''),
    ''
  ),
  "phoneNumber" = COALESCE(
    NULLIF("contactSnapshot" ->> 'phoneNumber', ''),
    NULLIF("contactSnapshot" ->> 'phone', ''),
    NULLIF("addressSnapshot" ->> 'phone', ''),
    '0000000000'
  ),
  "email" = COALESCE(NULLIF("contactSnapshot" ->> 'email', ''), 'unknown+' || "id" || '@invalid.local');

DROP INDEX "Order_customerId_idempotencyKey_key";
ALTER TABLE "Order"
  DROP COLUMN "customerId",
  DROP COLUMN "contactSnapshot",
  ALTER COLUMN "firstName" SET NOT NULL,
  ALTER COLUMN "lastName" SET NOT NULL,
  ALTER COLUMN "phoneNumber" SET NOT NULL,
  ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

DROP INDEX "OrderLine_sourceCartLineId_idx";
ALTER TABLE "OrderLine"
  DROP COLUMN "sourceCartLineId",
  DROP COLUMN "sourceCartQuoteVersion";

DROP INDEX "ReplacementRequest_orderId_customerId_idx";
ALTER TABLE "ReplacementRequest" DROP COLUMN "customerId";

DELETE FROM "Cart";
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_fkey";
DROP INDEX "Cart_userId_key";
ALTER TABLE "Cart"
  DROP COLUMN "userId",
  ALTER COLUMN "guestTokenHash" SET NOT NULL;

DELETE FROM "Session"
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" <> 'ADMIN');
ALTER TABLE "Session" RENAME TO "AdminSession";
ALTER TABLE "AdminSession" RENAME COLUMN "userId" TO "adminUserId";
ALTER TABLE "AdminSession" RENAME CONSTRAINT "Session_pkey" TO "AdminSession_pkey";
ALTER TABLE "AdminSession" RENAME CONSTRAINT "Session_userId_fkey" TO "AdminSession_adminUserId_fkey";
ALTER INDEX "Session_tokenHash_key" RENAME TO "AdminSession_tokenHash_key";
ALTER INDEX "Session_userId_expiresAt_idx" RENAME TO "AdminSession_adminUserId_expiresAt_idx";

DELETE FROM "User" WHERE "role" <> 'ADMIN';
ALTER TABLE "User" RENAME TO "AdminUser";
ALTER TABLE "AdminUser" DROP COLUMN "role";
ALTER TABLE "AdminUser" DROP COLUMN "emailVerifiedAt";
ALTER TABLE "AdminUser" DROP COLUMN "isGuestSession";
ALTER TABLE "AdminUser" DROP COLUMN "phone";
ALTER TABLE "AdminUser" RENAME CONSTRAINT "User_pkey" TO "AdminUser_pkey";
ALTER INDEX "User_email_key" RENAME TO "AdminUser_email_key";

DROP TABLE "VerificationToken";
DROP TABLE "PasswordResetToken";
DROP TABLE "Address";
DROP TYPE "UserRole";

CREATE TABLE "OrderAccessToken" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAccessToken_tokenHash_key" ON "OrderAccessToken"("tokenHash");
CREATE INDEX "OrderAccessToken_orderId_revokedAt_idx" ON "OrderAccessToken"("orderId", "revokedAt");
ALTER TABLE "OrderAccessToken"
  ADD CONSTRAINT "OrderAccessToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
