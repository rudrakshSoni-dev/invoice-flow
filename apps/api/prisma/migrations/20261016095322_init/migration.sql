-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_BILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PROCESSING', 'AUTO_APPROVED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('AMOUNT_MISMATCH', 'QUANTITY_MISMATCH', 'CURRENCY_MISMATCH', 'DUPLICATE_INVOICE', 'UNKNOWN_VENDOR', 'NO_MATCHING_PO', 'LOW_CONFIDENCE');

-- CreateEnum
CREATE TYPE "DiscrepancySeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "AuditStep" AS ENUM ('UPLOADED', 'EXTRACTED', 'MATCHED', 'DECIDED', 'REVIEWED', 'POSTED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('AGENT', 'USER');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('SUCCEEDED', 'INVALID_OUTPUT', 'ERROR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "billedMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "purchaseOrderId" TEXT,
    "invoiceNumber" TEXT,
    "issueDate" DATE,
    "dueDate" DATE,
    "currency" CHAR(3),
    "subtotalMinor" INTEGER,
    "taxMinor" INTEGER,
    "totalMinor" INTEGER,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PROCESSING',
    "confidence" DOUBLE PRECISION,
    "fileKey" TEXT NOT NULL,
    "rawExtraction" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "DiscrepancyType" NOT NULL,
    "severity" "DiscrepancySeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "expected" TEXT,
    "actual" TEXT,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "step" "AuditStep" NOT NULL,
    "actor" "Actor" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "status" "AgentRunStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_taxId_key" ON "Vendor"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_status_idx" ON "PurchaseOrder"("vendorId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_vendorId_invoiceNumber_idx" ON "Invoice"("vendorId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Discrepancy_invoiceId_idx" ON "Discrepancy"("invoiceId");

-- CreateIndex
CREATE INDEX "AuditEvent_invoiceId_createdAt_idx" ON "AuditEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_postedAt_idx" ON "LedgerEntry"("postedAt");

-- CreateIndex
CREATE INDEX "AgentRun_invoiceId_idx" ON "AgentRun"("invoiceId");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
