# Wedding Checklist Deployment Guide

## AWS Free Tier & Cost Analysis

**Good news:** With 2 users, polling every 5 seconds stays **within AWS free tier**.

### Cost Breakdown

**Lambda invocations:**
- Polling interval: 5 seconds
- Requests per minute: 12 per user × 2 users = 24 req/min
- Requests per month: ~1 million (at free tier limit)
- Cost: $0 (covered by free tier: 1M invocations/month)

**DynamoDB:**
- 30 items (checklist entries)
- Storage: <1 KB (no charge, free tier: 25 GB)
- Reads: ~30 per sync (on-demand pricing: $0.25 per 1M)
- Cost: <$0.01/month

**Total estimated cost: $0/month** ✅

### If You Need to Optimize Further

If you add more users (3+), consider:
1. **Increase polling interval** (e.g., 10 seconds = 600K requests/month)
2. **Use WebSockets** instead of polling (more efficient but more complex)
3. **Enable Lambda caching** (CloudFront in front of API)

---

## Step 1: Deploy SAM Infrastructure

```bash
cd infrastructure
sam deploy --config-env default
```

The deployment will output:
```
ChecklistApi endpoint: https://abc123.execute-api.us-east-1.amazonaws.com/prod
```

## Step 2: Update API Endpoint

Edit `src/pages/wedding/index.astro` and replace this line:

```javascript
const API_BASE = 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod';
```

With your actual API endpoint from the SAM output above.

## Step 3: Deploy the Website

```bash
git add src/pages/wedding/
git commit -m "Add wedding checklist with shared state"
git push origin main
```

The site will be live at `https://philippeollivier.github.io/wedding`

---

## Using the Checklist

1. Navigate to `/wedding`
2. Enter password: `phiji`
3. Check items as you complete them
4. Checked items sync to DynamoDB instantly
5. Changes appear on your girlfriend's device within 5 seconds (polling)

---

## Monitoring Costs

Check AWS Console:
- **Lambda:** CloudWatch Metrics → Invocations count
- **DynamoDB:** AWS Console → Tables → wedding-checklist-items

If costs exceed free tier, you'll receive an AWS billing alert.

---

## Troubleshooting

**Checklist won't load after login:**
- Check browser console (F12) for API errors
- Verify API endpoint is correct in index.astro
- Ensure SAM stack is deployed and active

**Changes not syncing:**
- Check AWS console → DynamoDB → Items
- Verify Lambda functions are executing (CloudWatch Logs)

**Password doesn't work:**
- Check that password is exactly: `phiji`
- It's case-sensitive
