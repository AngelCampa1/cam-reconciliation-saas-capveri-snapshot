# Scaling Guide

Planning for growth and scaling CapVeri infrastructure.

## Current Architecture Limits

### Supabase Free Tier

| Resource | Limit |
|----------|-------|
| Database size | 500 MB |
| Connections | 60 |
| Storage | 1 GB |
| Bandwidth | 2 GB/month |
| Auth users | Unlimited |

### Railway Starter

| Resource | Limit |
|----------|-------|
| RAM | 512 MB (can increase) |
| CPU | Shared |
| Instances | 1 (can scale) |

### Vercel Free

| Resource | Limit |
|----------|-------|
| Bandwidth | 100 GB/month |
| Serverless functions | 100 GB-hours |
| Build time | 100 hours/month |

## Scaling Triggers

### Database Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Size > 400 MB | 80% | Plan upgrade to Pro |
| Connections > 48 | 80% | Enable pooling |
| Slow queries > 1s avg | | Optimize, add indexes |

### Backend Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Memory > 80% | | Increase RAM |
| CPU > 80% sustained | | Add instances |
| Response time > 2s | | Investigate, optimize |

### Frontend Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Bandwidth > 80 GB | 80% | Plan Pro upgrade |
| Build time > 10 min | | Optimize build |

## Supabase Scaling

### Upgrade Path

| Tier | Database | Price |
|------|----------|-------|
| Free | 500 MB, 60 conn | $0 |
| Pro | 8 GB, 500 conn (pooled) | $25/mo |
| Team | 16 GB, 1500 conn | $599/mo |
| Enterprise | Custom | Contact |

### Enable Connection Pooling

1. Go to **Settings** > **Database**
2. Enable **Connection pooling**
3. Use pooler connection string:

```env
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Performance Optimizations

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_properties_org
ON properties(organization_id);

CREATE INDEX CONCURRENTLY idx_gl_entries_org_date
ON gl_entries(organization_id, transaction_date);

-- Analyze tables for query planner
ANALYZE;

-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
```

## Backend Scaling

### Vertical Scaling (Bigger Instance)

In Railway:
1. Go to **Settings** > **Service**
2. Increase **Memory**: 1GB, 2GB, 4GB
3. Increase **vCPU**: 1, 2, 4

### Horizontal Scaling (More Instances)

1. Go to **Settings** > **Service**
2. Set **Replicas**: 2, 3, etc.

**Requirements for horizontal scaling**:
- Stateless application (CapVeri is stateless)
- Session stored in database (using Supabase Auth)
- No local file storage

### Background Jobs

For heavy processing:
1. Use Railway's background workers
2. Or implement Celery + Redis (future)
3. Queue heavy operations

## Frontend Scaling

### Upgrade to Vercel Pro

When hitting free limits:
- 1 TB bandwidth
- Faster builds
- Team features

### CDN Optimization

Already optimized by Vercel:
- Global edge network
- Automatic compression
- Image optimization

### Bundle Size

Monitor and reduce:
```bash
npm run build
# Check dist size

# Analyze
npm run build -- --report
```

## Cost Projections

### Small Scale (< 100 orgs)

| Service | Tier | Cost |
|---------|------|------|
| Supabase | Free | $0 |
| Railway | Starter | $5-20 |
| Vercel | Free | $0 |
| AWS | Usage | $50-100 |
| Anthropic | Usage | $20-50 |
| **Total** | | **$75-170/mo** |

### Medium Scale (100-500 orgs)

| Service | Tier | Cost |
|---------|------|------|
| Supabase | Pro | $25 |
| Railway | Pro | $20-50 |
| Vercel | Pro | $20 |
| AWS | Usage | $100-300 |
| Anthropic | Usage | $100-300 |
| **Total** | | **$265-695/mo** |

### Large Scale (500+ orgs)

| Service | Tier | Cost |
|---------|------|------|
| Supabase | Team | $599 |
| Railway | Enterprise | $100+ |
| Vercel | Team | $400 |
| AWS | Usage | $500+ |
| Anthropic | Usage | $500+ |
| **Total** | | **$2,100+/mo** |

## Optimization Strategies

### Database Optimization

1. **Index everything filtered by**:
   - `organization_id`
   - `property_id`
   - Date ranges

2. **Use pagination**:
   ```python
   # Always paginate large result sets
   offset = (page - 1) * limit
   query = query.offset(offset).limit(limit)
   ```

3. **Batch operations**:
   ```python
   # Instead of N queries, batch
   results = await db.execute(
       select(Property).where(Property.id.in_(property_ids))
   )
   ```

### Caching (Future)

When needed:
1. Add Redis to Railway
2. Cache frequently accessed data
3. Cache AI extraction results

```python
# Example caching pattern
from redis import Redis

redis = Redis.from_url(settings.redis_url)

@cache(ttl=3600)
async def get_property(property_id: str):
    # Cache for 1 hour
    ...
```

### CDN for Documents

For document serving:
1. Use CloudFront in front of S3
2. Pre-signed URLs with caching
3. Reduces S3 costs

## Monitoring for Scale

### Key Metrics

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| Response time | Railway logs | > 2s |
| Error rate | Sentry | > 1% |
| DB connections | Supabase | > 80% |
| Memory usage | Railway | > 80% |

### Capacity Planning

Review monthly:
1. Database size growth rate
2. User growth rate
3. API call volume
4. Storage usage

## Migration Considerations

### When to Consider Moving

At enterprise scale, consider:
- Dedicated PostgreSQL (AWS RDS, GCP Cloud SQL)
- Kubernetes for backend
- Custom infrastructure

### Not Recommended Yet

For < 500 orgs, stay with current stack:
- Supabase scales well to Team tier
- Railway scales to enterprise
- Simpler ops, faster iteration

## Checklist

- [ ] Monitoring in place for scale metrics
- [ ] Upgrade paths documented
- [ ] Cost projections reviewed
- [ ] Optimization backlog maintained
- [ ] Capacity planning scheduled

## Next Steps

- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
- [Launch Day Runbook](../go-live/01-launch-day-runbook.md)
