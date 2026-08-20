# Database Monitoring

Guide for monitoring Supabase PostgreSQL database in CapVeri.

## Supabase Dashboard

### Access Metrics

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Database** > **Reports**

### Key Metrics

| Metric | Location | Healthy Range |
|--------|----------|---------------|
| Active connections | Reports > Connections | < 80% of max |
| Database size | Settings > Database | < 80% of limit |
| Query performance | Reports > Query Performance | < 100ms avg |

## Connection Monitoring

### Free Tier Limits

| Resource | Limit |
|----------|-------|
| Max connections | 60 |
| Database size | 500 MB |
| Bandwidth | 2 GB/month |

### Check Current Connections

In SQL Editor:
```sql
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';
```

### Connection Pooling

For serverless (Railway), use connection pooling:

1. Go to **Settings** > **Database**
2. Enable **Connection pooling**
3. Use pooler connection string

```env
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

## Query Performance

### Slow Query Log

```sql
-- Find slow queries (last 24h)
SELECT
  query,
  calls,
  mean_time,
  total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Query Analysis

```sql
-- Analyze specific query
EXPLAIN ANALYZE
SELECT * FROM properties
WHERE organization_id = 'uuid';
```

Look for:
- Sequential scans on large tables
- Missing index usage
- High row estimates

### Add Missing Indexes

```sql
-- If queries filter by organization_id frequently
CREATE INDEX CONCURRENTLY idx_properties_org
ON properties(organization_id);
```

## Storage Monitoring

### Check Database Size

```sql
SELECT
  pg_size_pretty(pg_database_size('postgres')) as db_size;
```

### Check Table Sizes

```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 10;
```

### Storage Cleanup

```sql
-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Full vacuum (locks table)
VACUUM FULL table_name;
```

## Alerts

### What to Alert On

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Connections > 80% | 48/60 | Email warning |
| Database > 400 MB | 80% of 500 MB | Email + plan upgrade |
| Query time > 1s | Average | Email + investigate |

### Manual Monitoring

Set calendar reminder for weekly checks:
- [ ] Check connection count
- [ ] Check database size
- [ ] Review slow queries
- [ ] Check error logs

## Performance Optimization

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing index | Slow queries | Add appropriate index |
| N+1 queries | Many small queries | Use joins or batch |
| Large result sets | Memory issues | Add pagination |
| Connection exhaustion | Timeouts | Use connection pooling |

### Index Strategy

Tables should have indexes on:
- Primary key (automatic)
- `organization_id` (RLS filter)
- Foreign keys
- Frequently filtered columns

### Example Index Creation

```sql
-- For common queries
CREATE INDEX CONCURRENTLY idx_gl_entries_org_date
ON gl_entries(organization_id, transaction_date);

CREATE INDEX CONCURRENTLY idx_leases_property
ON leases(property_id);
```

## Backup Verification

### Check Last Backup

In Supabase Dashboard:
1. Go to **Database** > **Backups**
2. Verify latest backup completed

### Test Restore

Periodically test restore:
1. Create test project
2. Restore from backup
3. Verify data integrity
4. Delete test project

## Monitoring Checklist

- [ ] Dashboard bookmarked
- [ ] Weekly metrics review scheduled
- [ ] Connection pooling enabled
- [ ] Key indexes created
- [ ] Slow query review process
- [ ] Backup verification scheduled
- [ ] Upgrade path documented

## Upgrade Triggers

### When to Upgrade

| Trigger | Current | Upgrade To |
|---------|---------|------------|
| Size > 400 MB | Free | Pro ($25/mo) |
| Connections > 50 | Free | Pro |
| Need daily backups | Free | Pro |
| Need point-in-time recovery | Pro | Pro+ |

### Supabase Pro Features

- 8 GB database
- 500 connections (pooled)
- Daily backups (7-day retention)
- Email support

## Next Steps

- [Common Issues Runbook](../operations/01-runbook-common-issues.md)
- [Backup and Recovery](../operations/02-database-backup-and-recovery.md)
