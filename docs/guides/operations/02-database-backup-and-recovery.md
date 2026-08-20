# Database Backup and Recovery

Guide for backing up and restoring the CapVeri database.

## Supabase Automatic Backups

### Free Tier

- **Backups**: Not included
- **Recovery**: Manual only

### Pro Tier ($25/month)

- **Backups**: Daily automated
- **Retention**: 7 days
- **Recovery**: Point-in-time (PITR)

## Manual Backup

### Using Supabase CLI

```bash
# Login to Supabase
supabase login

# Link to project
supabase link --project-ref YOUR_PROJECT_REF

# Create backup
supabase db dump -f backup_$(date +%Y%m%d).sql
```

### Using pg_dump

```bash
# Set connection string
export DATABASE_URL="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres"

# Full backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz

# Schema only
pg_dump $DATABASE_URL --schema-only > schema_$(date +%Y%m%d).sql

# Data only
pg_dump $DATABASE_URL --data-only > data_$(date +%Y%m%d).sql
```

### Backup Specific Tables

```bash
# Critical tables only
pg_dump $DATABASE_URL \
  -t organizations \
  -t properties \
  -t leases \
  -t reconciliation_snapshots \
  > critical_backup.sql
```

## Backup Schedule

### Recommended Schedule

| Frequency | Type | Retention |
|-----------|------|-----------|
| Daily | Full backup | 7 days |
| Weekly | Full backup | 4 weeks |
| Monthly | Full backup | 12 months |

### Automation Script

```bash
#!/bin/bash
# backup.sh - Run via cron

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups"
DATABASE_URL="postgresql://..."

# Create backup
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/backup_$DATE.sql.gz s3://capveri-backups/

# Delete old backups (keep 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

### Cron Setup

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/backup.sh
```

## Recovery Procedures

### Restore from Backup

```bash
# Restore full backup
psql $DATABASE_URL < backup_20240115.sql

# Restore compressed backup
gunzip -c backup_20240115.sql.gz | psql $DATABASE_URL

# Restore specific table
psql $DATABASE_URL -c "TRUNCATE table_name CASCADE;"
pg_restore -d $DATABASE_URL -t table_name backup.dump
```

### Point-in-Time Recovery (Pro)

In Supabase Dashboard:
1. Go to **Database** > **Backups**
2. Select date/time
3. Click **Restore**
4. Confirm (creates new project or overwrites)

### Partial Recovery

```sql
-- Restore specific records from backup
-- First, import backup to temp table
CREATE TEMP TABLE restored_data AS
SELECT * FROM backup_table WHERE id IN ('uuid1', 'uuid2');

-- Then merge back
INSERT INTO original_table
SELECT * FROM restored_data
ON CONFLICT (id) DO UPDATE SET ...;
```

## Verification

### Verify Backup Integrity

```bash
# Check backup file is valid SQL
head -100 backup.sql

# Try restore to test database
createdb test_restore
psql test_restore < backup.sql
dropdb test_restore
```

### Verify Row Counts

```sql
-- Before backup, note counts
SELECT 'organizations', count(*) FROM organizations
UNION ALL
SELECT 'properties', count(*) FROM properties
UNION ALL
SELECT 'leases', count(*) FROM leases;

-- After restore, compare
```

## Data Export for Compliance

### GDPR Data Export

```sql
-- Export user's data
\copy (
  SELECT * FROM organization_members
  WHERE user_id = 'user-uuid'
) TO 'user_data_members.csv' CSV HEADER;

\copy (
  SELECT * FROM properties p
  JOIN organizations o ON p.organization_id = o.id
  JOIN organization_members om ON o.id = om.organization_id
  WHERE om.user_id = 'user-uuid'
) TO 'user_data_properties.csv' CSV HEADER;
```

### Tenant Data Export

```sql
-- Export tenant's visible data
\copy (
  SELECT l.* FROM leases l
  JOIN tenant_lease_links tll ON l.id = tll.lease_id
  JOIN tenant_users tu ON tll.tenant_user_id = tu.id
  WHERE tu.user_id = 'tenant-user-uuid'
) TO 'tenant_leases.csv' CSV HEADER;
```

## Disaster Recovery

### Recovery Time Objective (RTO)

Target: < 4 hours

| Phase | Time |
|-------|------|
| Detection | 15 min |
| Assessment | 30 min |
| Restore from backup | 1-2 hours |
| Verification | 30 min |
| Communication | 30 min |

### Recovery Point Objective (RPO)

Target: < 24 hours (daily backups)

With Pro tier: < 1 hour (PITR)

### Recovery Steps

1. **Assess damage** - What was lost?
2. **Identify backup** - Most recent valid backup
3. **Create new instance** - If needed
4. **Restore data** - From backup
5. **Verify integrity** - Check row counts, test queries
6. **Update connections** - Point app to restored DB
7. **Communicate** - Notify users of data loss window

## Backup Checklist

- [ ] Backup script created
- [ ] Automation configured (cron)
- [ ] Off-site storage set up (S3)
- [ ] Retention policy defined
- [ ] Recovery tested successfully
- [ ] Documentation updated
- [ ] Team trained on procedures

## Next Steps

- [Incident Response Playbook](./03-incident-response-playbook.md)
- [Scaling Guide](./04-scaling-guide.md)
