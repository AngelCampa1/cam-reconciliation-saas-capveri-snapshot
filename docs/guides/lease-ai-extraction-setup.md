# Lease AI Extraction Pipeline - Setup Guide

## Overview

The Lease AI Extraction pipeline automates the extraction of "Financial DNA" from lease PDF documents. This data is critical for accurate CAM (Common Area Maintenance) reconciliation calculations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEASE AI EXTRACTION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │   UPLOAD     │    │     OCR      │    │  AI EXTRACT  │    │    HUMAN     │
  │  /leases/    │───▶│    AWS       │───▶│    Claude    │───▶│   REVIEW     │
  │   upload     │    │   document reader   │    │   3.5 Sonnet │    │  /verify/:id │
  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
         │                                                            │
         │                                                            ▼
         │                                                    ┌──────────────┐
         │                                                    │    LEASE     │
         │                                                    │   UPDATED    │
         │                                                    │  (recovery   │
         │                                                    │   profile)   │
         │                                                    └──────────────┘
         │                                                            │
         ▼                                                            ▼
  ┌──────────────┐                                           ┌──────────────┐
  │  EXTRACTIONS │                                           │ RECONCILE    │
  │ /extractions │◀──────────────────────────────────────────│ /properties/ │
  │  (list all)  │                                           │ :id/recon... │
  └──────────────┘                                           └──────────────┘
```

---

## Part 1: UI Flow Walkthrough

### Step 1: Upload Lease PDFs
**URL**: `/leases/upload`

- Select a property (required)
- Optionally link to an existing lease
- Drag & drop PDF files (up to 50MB each)
- Click "Upload" to start processing

### Step 2: View Extraction Queue
**URL**: `/extractions`

Shows all uploaded documents with their status:
| Status | Meaning |
|--------|---------|
| `PENDING` | Queued for processing |
| `PROCESSING` | OCR + AI extraction in progress |
| `READY_FOR_REVIEW` | AI finished, needs human verification |
| `VERIFIED` | Human approved, data saved to lease |
| `REJECTED` | Human rejected, needs re-upload |
| `FAILED` | Processing error |

### Step 3: Human-in-the-Loop Verification
**URL**: `/verify/:documentId`

Split-screen interface:
- **Left Panel**: Original PDF with highlighted source text
- **Right Panel**: Extracted values with confidence scores

Features:
- Click on extracted fields to highlight source in PDF
- Edit any value if AI got it wrong
- See confidence scores (90-100 = high, <70 = needs review)
- Approve or Reject the extraction

### Step 4: Data Saves to Lease
When you **Approve** an extraction:
- The extracted `recovery_profile` is saved to the lease record
- Includes: `pro_rata_share`, `base_year`, `cap_type`, `cap_rate`, etc.

### Step 5: Reconciliation Uses Extracted Data
**URL**: `/properties/:propertyId/reconciliations`

The reconciliation engine uses the lease's `recovery_profile` to calculate:
- **Tenant's Share**: `total_expenses × pro_rata_share`
- **Base Year Stop**: Subtracts base year amount if applicable
- **Caps**: Applies annual increase limits (cumulative or non-cumulative)
- **Admin Fee**: Adds landlord's admin fee percentage

---

## Part 2: What the AI Extracts

The AI extracts these fields from lease documents:

| Field | Description | Example |
|-------|-------------|---------|
| `pro_rata_share` | Tenant's % of building expenses | `0.0525` (5.25%) |
| `base_year` | Baseline year for expense stop | `2020` |
| `base_year_amount` | Fixed dollar amount for base | `$50,000.00` |
| `cap_type` | How increases are capped | `cumulative` |
| `cap_rate` | Annual cap percentage | `0.05` (5%) |
| `admin_fee_percentage` | Landlord admin fee | `0.15` (15%) |
| `excluded_pools` | Expense types tenant doesn't pay | `["capital"]` |

Each extraction includes:
- **Confidence Score** (0-100)
- **Source Text** (exact quote from lease)

---

## Part 3: AWS Setup

### Required AWS Services

| Service | Purpose | Estimated Cost |
|---------|---------|----------------|
| **S3** | Store uploaded PDFs | ~$0.023/GB/month |
| **document reader** | OCR text extraction | ~$1.50/1000 pages |
| **IAM** | Access credentials | Free |

### Step-by-Step Setup

#### 1. Create S3 Bucket

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click **Create bucket**
3. Configure:
   - **Bucket name**: `capveri-documents` (or your preferred name)
   - **Region**: `us-east-1` (or your preferred region)
   - **Block Public Access**: Keep ALL options checked (secure by default)
   - **Versioning**: Enable (recommended for document audit trail)
   - **Encryption**: Enable SSE-S3 (default encryption)
4. Click **Create bucket**

#### 2. Create IAM User

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click **Users** → **Create user**
3. **User name**: `capveri-app`
4. Click **Next**
5. Select **Attach policies directly**
6. Create a custom policy (recommended) or use managed policies:

**Option A: Custom Policy (Recommended - Least Privilege)**

Click "Create policy" and paste this JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
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
      "Sid": "S3BucketList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:HeadBucket"
      ],
      "Resource": "arn:aws:s3:::capveri-documents"
    },
    {
      "Sid": "document readerAccess",
      "Effect": "Allow",
      "Action": [
        "document_reader:StartDocumentTextDetection",
        "document_reader:StartDocumentAnalysis",
        "document_reader:GetDocumentTextDetection",
        "document_reader:GetDocumentAnalysis",
        "document_reader:AnalyzeDocument"
      ],
      "Resource": "*"
    }
  ]
}
```

**Option B: Managed Policies (Easier but broader access)**
- `AmazonS3FullAccess`
- `Amazondocument readerFullAccess`

7. Click **Create user**

#### 3. Generate Access Keys

1. Click on your new user (`capveri-app`)
2. Go to **Security credentials** tab
3. Scroll to **Access keys** → **Create access key**
4. Select **Application running outside AWS**
5. Click **Create access key**
6. **IMPORTANT**: Download or copy both keys immediately
   - `Access key ID`: `AKIA...`
   - `Secret access key`: (shown only once!)

#### 4. Configure Backend Environment

Add these to your `backend/.env` file:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=AKIA...your_access_key...
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
AWS_TEXTRACT_BUCKET=capveri-documents
```

---

## Part 4: Anthropic (Claude) Setup

The AI extraction uses Claude 3.5 Sonnet for intelligent lease parsing.

### Get API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`)

### Configure Backend

Add to your `backend/.env`:

```env
# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-...your_key_here...
```

### Cost Estimate

| Model | Input Cost | Output Cost |
|-------|-----------|-------------|
| Claude 3.5 Sonnet | $3/M tokens | $15/M tokens |

Typical lease extraction: ~5K input tokens, ~1K output tokens ≈ $0.03 per lease

---

## Part 5: How It Connects to Reconciliation

### The Data Flow

```
Lease PDF
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ AI Extraction (Claude)                              │
│ Extracts: pro_rata_share, base_year, caps, etc.    │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Human Verification (/verify/:id)                    │
│ Reviews, edits if needed, approves                  │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Lease Record Updated                                │
│ lease.recovery_profile = {                          │
│   pro_rata_share: 0.0525,                          │
│   base_year: 2020,                                 │
│   cap_type: "cumulative",                          │
│   cap_rate: 0.05,                                  │
│   ...                                              │
│ }                                                   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Reconciliation Calculation                          │
│ /properties/:id/reconciliations                     │
│                                                     │
│ For each lease:                                     │
│ 1. Get total expenses from GL data                 │
│ 2. Apply pro_rata_share: $100K × 5.25% = $5,250    │
│ 3. Subtract base_year amount if applicable         │
│ 4. Apply cap limits (cumulative/non-cumulative)    │
│ 5. Add admin_fee_percentage                        │
│ 6. Result: Tenant's CAM charge                     │
└─────────────────────────────────────────────────────┘
```

### Example Calculation

Given:
- Total Property Expenses: $100,000
- Tenant's `pro_rata_share`: 5.25%
- Tenant's `base_year` amount: $4,000
- Tenant's `admin_fee_percentage`: 15%

Calculation:
```
Tenant's Share:     $100,000 × 5.25%  = $5,250.00
Less Base Year:     $5,250 - $4,000   = $1,250.00
Add Admin Fee:      $1,250 × 15%      = $187.50
                                       ─────────
TOTAL CAM CHARGE:                      $1,437.50
```

---

## Part 6: Troubleshooting

### "Unable to locate credentials"
- Check that `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in `.env`
- Restart the backend server after changing `.env`

### "Access Denied" on S3
- Verify the IAM policy includes your bucket name
- Check bucket name matches `AWS_TEXTRACT_BUCKET`

### "document reader throttling"
- document reader has rate limits (~1 concurrent job by default)
- Request a limit increase in AWS console if processing many documents

### Extraction confidence is low
- PDF may be a scanned image with poor quality
- Lease language may be unusual/non-standard
- Human reviewer can manually correct values

---

## Quick Reference: Environment Variables

```env
# backend/.env

# AWS (for S3 storage + document reader OCR)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_TEXTRACT_BUCKET=capveri-documents

# Anthropic (for Claude AI extraction)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase (database)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```
