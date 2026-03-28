# Proposal App - Setup Guide

## Prerequisites

- Node.js 18+
- A Supabase account (free tier works)
- A Clerk account (free tier works)

## 1. Install dependencies

```bash
cd proposal-app
npm install
```

## 2. Set up Supabase

1. Go to https://supabase.com and create a new project
2. Copy the database connection string from Settings > Database > Connection string (URI)
3. Update `.env.local` with your connection string

## 3. Set up Clerk

1. Go to https://clerk.com and create a new application
2. Copy your publishable key and secret key
3. Update `.env.local` with both keys

## 4. Generate Prisma client and run migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## 5. Run the development server

```bash
npm run dev
```

Open http://localhost:3000. You will be redirected to the Clerk sign-in page. After signing in, you will see the proposal dashboard.

## Project Structure

```
src/
  app/
    page.tsx                    # Dashboard
    proposals/
      page.tsx                  # Proposals list
      new/page.tsx              # New proposal editor
      [id]/edit/page.tsx        # Edit proposal
    templates/page.tsx          # Templates list
    content-library/page.tsx    # Content library
    p/[publicId]/page.tsx       # Public proposal view (for clients)
    sign-in/                    # Clerk sign-in
    sign-up/                    # Clerk sign-up
    api/
      proposals/                # Proposals CRUD
      templates/                # Templates CRUD
      content-blocks/           # Content blocks CRUD
  components/
    editor/
      ProposalEditor.tsx        # TipTap editor wrapper
      PricingTable.tsx          # Inline pricing table component
      Toolbar.tsx               # Editor toolbar
    ui/
      Shell.tsx                 # App shell with sidebar nav
  lib/
    prisma.ts                   # Prisma client singleton
    utils.ts                    # Utility functions
    default-content.ts          # Blank proposal template
  middleware.ts                 # Clerk auth middleware
prisma/
  schema.prisma                 # Database schema
```

## What is built (Phase 1)

- TipTap rich text editor with toolbar (bold, italic, underline, headings, lists, alignment, images, horizontal rules)
- Inline pricing table with line items, quantities, unit prices, and auto-calculated totals
- Proposal CRUD (create, edit, duplicate, delete)
- Status tracking (Draft, Sent, Viewed, Accepted, Declined, Expired)
- Template system (save proposals as templates, create proposals from templates)
- Content library (reusable content blocks organized by category)
- Dashboard with stats (total proposals, awaiting response, accepted, won value)
- Proposals list with search and status filtering
- Public proposal view for clients (via shareable link)
- View tracking (logs when clients open proposals, auto-updates status)
- Clerk authentication for your team

## What comes next (Phase 2-5)

- Section-level analytics (time on each section, scroll depth)
- E-signature capture
- Stripe payment integration
- PDF export of signed proposals
- Email delivery and reminders
- Proposal expiry
