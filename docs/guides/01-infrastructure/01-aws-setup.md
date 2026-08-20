# AWS Setup Guide

This guide covers configuring AWS services required for CapVeri's document ingestion pipeline:
- **S3**: Document storage for uploaded lease PDFs
- **document reader**: OCR service for extracting text and tables from documents

## Prerequisites

- AWS Account with billing enabled
- IAM user with administrator access (for initial setup)
- AWS CLI installed (optional, for testing)

## 1. Create S3 Bucket

### Via AWS Console

1. Navigate to **S3** in the AWS Console
2. Click **Create bucket**
3. Configure:
   - **Bucket name**: `capveri-documents` (or your preferred name)
   - **Region**: `us-east-1` (must match document reader region)
   - **Block Public Access**: Enable ALL options (checked)
4. Under **Default encryption**:
   - Select **Server-side encryption with Amazon S3 managed keys (SSE-S3)**
   - Bucket Key: **Enable**
5. (Optional) Enable **Versioning** for audit trail
6. Click **Create bucket**

### Via AWS CLI

```bash
# Create bucket
aws s3api create-bucket \
    --bucket capveri-documents \
    --region us-east-1

# Enable encryption
aws s3api put-bucket-encryption \
    --bucket capveri-documents \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            },
            "BucketKeyEnabled": true
        }]
    }'

# Block public access
aws s3api put-public-access-block \
    --bucket capveri-documents \
    --public-access-block-configuration '{
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }'
```

## 2. Create IAM User

### Create User

1. Navigate to **IAM** > **Users**
2. Click **Add users**
3. Configure:
   - **User name**: `capveri-service`
   - **Access type**: Programmatic access only

### Create IAM Policy

1. Navigate to **IAM** > **Policies**
2. Click **Create policy**
3. Select **JSON** tab
4. Paste this policy (least privilege):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "document readerAccess",
            "Effect": "Allow",
            "Action": [
                "document_reader:AnalyzeDocument",
                "document_reader:StartDocumentAnalysis",
                "document_reader:GetDocumentAnalysis",
                "document_reader:StartDocumentTextDetection",
                "document_reader:GetDocumentTextDetection"
            ],
            "Resource": "*"
        },
        {
            "Sid": "S3DocumentAccess",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:HeadObject"
            ],
            "Resource": "arn:aws:s3:::capveri-documents/*"
        },
        {
            "Sid": "S3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:HeadBucket"
            ],
            "Resource": "arn:aws:s3:::capveri-documents"
        }
    ]
}
```

5. Name: `CapVeriServicePolicy`
6. Click **Create policy**

### Attach Policy to User

1. Navigate to **IAM** > **Users** > `capveri-service`
2. Click **Add permissions** > **Attach policies directly**
3. Search for and select `CapVeriServicePolicy`
4. Click **Add permissions**

### Create Access Keys

1. Navigate to **IAM** > **Users** > `capveri-service`
2. Click **Security credentials** tab
3. Under **Access keys**, click **Create access key**
4. Select **Application running outside AWS**
5. Click **Create access key**
6. **IMPORTANT**: Download or copy both keys immediately:
   - Access key ID: `AKIA...`
   - Secret access key: (only shown once)

## 3. Environment Variables

Add these to your backend `.env` file:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...your-access-key...
AWS_SECRET_ACCESS_KEY=...your-secret-key...
AWS_TEXTRACT_BUCKET=capveri-documents
```

For production deployment (Railway/Render), add these as environment variables in your deployment dashboard.

## 4. Verify Configuration

### Test S3 Connection

Run the health check endpoint:

```bash
curl http://localhost:8000/api/v1/extractions/health
```

Expected response:
```json
{
    "s3": {
        "healthy": true,
        "bucket": "capveri-documents",
        "region": "us-east-1",
        "message": "S3 bucket is accessible"
    },
    "document_reader": {
        "healthy": true,
        "region": "us-east-1",
        "message": "document reader service is reachable"
    }
}
```

### Test S3 Upload (CLI)

```bash
# Create test file
echo "Test document" > test.txt

# Upload to S3
aws s3 cp test.txt s3://capveri-documents/test/test.txt

# Verify upload
aws s3 ls s3://capveri-documents/test/

# Clean up
aws s3 rm s3://capveri-documents/test/test.txt
rm test.txt
```

## 5. Application Integration

### S3 Client Configuration

The S3 client (`backend/app/services/extraction/s3_client.py`) is configured with:

| Setting | Value | Description |
|---------|-------|-------------|
| Max file size | 50 MB | Maximum PDF upload size |
| Encryption | AES-256 | Server-side encryption |
| Pre-signed URL expiry | 1 hour | Temporary download links |
| Retry attempts | 3 | Automatic retry with backoff |
| Read timeout | 30s | Request timeout |

### S3 Key Structure

Documents are stored with organization isolation:

```
{organization_id}/{property_id}/{uuid}.pdf
```

Example:
```
550e8400-e29b-41d4-a716-446655440000/
  660e8400-e29b-41d4-a716-446655440001/
    770e8400-e29b-41d4-a716-446655440002.pdf
```

### Document reader client Configuration

The document reader client (`backend/app/services/extraction/document_reader_client.py`) is configured with:

| Setting | Value | Description |
|---------|-------|-------------|
| Feature types | TABLES, FORMS | Extracts tables and form data |
| Retry attempts | 3 | Retry on transient failures |
| Backoff | 1-10s exponential | Wait between retries |
| Health cache | 60s | Avoid excessive health checks |

### Retryable Errors

The following AWS errors trigger automatic retry:
- `ProvisionedThroughputExceededException`
- `ThrottlingException`
- `ServiceUnavailableException`
- `InternalServerError`

## 6. Cost Estimates

### S3 Costs (us-east-1)

| Item | Price | Example |
|------|-------|---------|
| Storage | $0.023/GB/month | 10GB = $0.23/month |
| PUT requests | $0.005/1,000 | 1,000 uploads = $0.005 |
| GET requests | $0.0004/1,000 | 10,000 downloads = $0.004 |
| Data transfer out | $0.09/GB | 10GB = $0.90 |

**Estimated monthly cost for small deployment**: $5-25/month

### document reader Costs (us-east-1)

| Item | Price | Example |
|------|-------|---------|
| AnalyzeDocument (TABLES + FORMS) | $0.015/page | 1,000 pages = $15 |
| StartDocumentAnalysis (async) | $0.015/page | 1,000 pages = $15 |

**Estimated monthly cost for small deployment**: $50-150/month (based on ~5,000 pages)

## 7. Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `AccessDenied` | Missing IAM permissions | Check IAM policy |
| `NoSuchBucket` | Wrong bucket name | Verify `AWS_TEXTRACT_BUCKET` |
| `InvalidAccessKeyId` | Wrong access key | Regenerate IAM credentials |
| `SignatureDoesNotMatch` | Wrong secret key | Regenerate IAM credentials |
| `ThrottlingException` | Rate limited | Wait and retry (automatic) |

### Debug Mode

Enable debug logging to see AWS requests:

```env
LOG_LEVEL=DEBUG
```

This logs all boto3 requests/responses for troubleshooting.

## 8. Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Rotate keys regularly** - Every 90 days recommended
3. **Use least privilege** - Only grant required permissions
4. **Enable CloudTrail** - Audit all API calls
5. **Enable S3 versioning** - Protect against accidental deletion
6. **Monitor costs** - Set up AWS Budgets alerts

## Next Steps

- [Anthropic Setup](./02-anthropic-setup.md) - Configure AI extraction
- [Environment Variables Reference](../02-deployment/05-environment-variables-reference.md) - All configuration options
