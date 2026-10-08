# MT Life Operations Hub

**MT Life Operations Hub (BD Tracker)** is an internal workspace for managing business development and day-to-day operations. It brings team performance, customer records, advertising activities, approval workflows, and merchant administration into one place.

The platform is primarily used by BD teams, operations staff, and administrators.

## Features

- **Team Performance** — Track BD activities and performance records.
- **Customers** — Manage customer follow-ups and related business information.
- **Management** — Maintain shared master data and reference lists.
- **Q&A** — Submit, track, and resolve internal support tickets.
- **Ads Tracking** — Monitor advertising records and campaign status.
- **Approvals** — Review and process internal requests.
- **Invoices** — Manage merchant invoice records, statuses, and supporting documents.
- **Role-based Access** — Provide appropriate features and actions for different user roles.

The web application also supports data filtering, exports, attachments, and realtime updates where applicable.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript |
| Styling & UI | Tailwind CSS 4, Radix UI, shadcn/ui, Lucide |
| Backend & Authentication | Supabase (PostgreSQL, Auth, Realtime) |
| File Management | Cloudinary |
| Data & Document Export | SheetJS (xlsx), DOCX, jsPDF |
| Mobile (in development) | Flutter, Dart, Supabase Flutter |

## Project Components

- **[web/](web/)** — Main web application and primary operating interface.
- **[mobile/](mobile/)** — Early-stage Flutter client.
- **[supabase/](supabase/)** — Supabase migrations, configuration, and functions.

## Getting Started

To run the web application locally:

```bash
cd web
npm install
npm run dev
```

Configure the required Supabase environment variables in `web/.env.local` before starting:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

Developer and AI maintenance instructions are available in [AI.md](AI.md).

---

*Internal operations platform for MT Life.*
