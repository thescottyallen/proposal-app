-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AUD', 'USD');

-- CreateEnum
CREATE TYPE "BillingCadence" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "RecurringStartMode" AS ENUM ('IMMEDIATE', 'ON_ACCEPTANCE', 'SPECIFIC_DATE');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('UPON_RECEIPT', 'NET7', 'NET14', 'NET30');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('DOLLAR', 'CENTS');

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL DEFAULT '',
    "abn" TEXT,
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "default_currency" "Currency" NOT NULL DEFAULT 'AUD',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "invoice_seq" INTEGER NOT NULL DEFAULT 0,
    "rounding_mode" "RoundingMode" NOT NULL DEFAULT 'CENTS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_revisions" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_revisions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "proposals"
    ADD COLUMN "client_abn" TEXT,
    ADD COLUMN "pricing_data" JSONB,
    ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'AUD',
    ADD COLUMN "exchange_rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    ADD COLUMN "gst_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "rounding_mode" "RoundingMode" NOT NULL DEFAULT 'CENTS',
    ADD COLUMN "discount_type" TEXT,
    ADD COLUMN "discount_value" DOUBLE PRECISION,
    ADD COLUMN "show_discount" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "deposit_type" TEXT,
    ADD COLUMN "deposit_value" DOUBLE PRECISION,
    ADD COLUMN "billing_cadence" "BillingCadence" NOT NULL DEFAULT 'ONE_OFF',
    ADD COLUMN "recurring_start_mode" "RecurringStartMode",
    ADD COLUMN "recurring_start_date" TIMESTAMP(3),
    ADD COLUMN "fixed_term_months" INTEGER,
    ADD COLUMN "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'NET30',
    ADD COLUMN "late_payment_clause" TEXT,
    ADD COLUMN "invoice_number" TEXT,
    ADD COLUMN "internal_notes" TEXT,
    ADD COLUMN "client_id" TEXT;

-- AlterTable
ALTER TABLE "proposal_events" ADD COLUMN "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "business_settings_user_id_key" ON "business_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_created_by_key" ON "clients"("email", "created_by");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_revisions_proposal_id_version_key" ON "proposal_revisions"("proposal_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_invoice_number_key" ON "proposals"("invoice_number");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_revisions" ADD CONSTRAINT "proposal_revisions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
