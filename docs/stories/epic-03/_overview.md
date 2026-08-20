# Epic 3: Database Schema & Multi-Tenancy

## Purpose
Deploy PostgreSQL schema with strict Row Level Security for multi-tenant isolation.

## Business Value
Multi-tenancy is fundamental to SaaS. Every query must be organization-scoped by default, and no user should ever see another organization's data—even through SQL injection or bugs. This epic delivers the database foundation that ensures data security and compliance.

## Dependencies
Epic 2 (type definitions inform schema design)

## Stories in This Epic

| ID | Story | Hours | Status |
|----|-------|-------|--------|
| 3.1 | Create Supabase Project Config | 2 | `pending` |
| 3.2 | Create Organizations Table | 2 | `pending` |
| 3.3 | Create Users Table | 2 | `pending` |
| 3.4 | Create Properties Table | 2 | `pending` |
| 3.5 | Create Units Table | 2 | `pending` |
| 3.6 | Create Leases Table | 3 | `pending` |
| 3.7 | Create Import Batches Table | 2 | `pending` |
| 3.8 | Create GL Entries Table | 3 | `pending` |
| 3.9 | Create Expense Pools Table | 2 | `pending` |
| 3.10 | Create Pool Mappings Table | 2 | `pending` |
| 3.11 | Create Reconciliation Snapshots Table | 3 | `pending` |
| 3.12 | Enable pgAudit Extension | 2 | `pending` |
| 3.13 | Create RLS Negative Test Suite | 4 | `pending` |
| 3.14 | Create Database Seed Script | 2 | `pending` |
| 3.15 | Create Subscriptions Table | 3 | `pending` |
| 3.16 | Create Invoices Table | 2 | `pending` |
| 3.17 | Create Promotions Table | 3 | `pending` |
| 3.18 | Create Feedback Table | 2 | `pending` |
| 3.19 | Create Audit Log Table | 2 | `pending` |

**Total Hours**: 45

**Note**: Stories 3.15-3.18 should be completed before Story 3.14 (seed script) to include billing/feedback seed data. Story 3.17 (Promotions Table) is optional if using Stripe-first approach for promotions.

## Deliverables
- `supabase/migrations/` SQL files
- RLS policies on all tables
- pgAudit configuration for financial audit trail
- GIN indexes on JSONB columns
- Negative tests proving tenant isolation
- Seed data for local development

## Epic Completion Checklist
- [ ] All migrations run without errors
- [ ] RLS enabled on all tables
- [ ] Negative tests prove isolation
- [ ] Seed data creates usable dev environment
- [ ] pgAudit captures financial changes
