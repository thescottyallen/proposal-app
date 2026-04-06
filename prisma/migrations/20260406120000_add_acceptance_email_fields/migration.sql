-- Add customisable acceptance email fields to business_settings
ALTER TABLE "business_settings" ADD COLUMN "acceptance_email_subject" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "acceptance_email_message" TEXT;
