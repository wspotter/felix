# Facebook & Instagram Setup Guide

Complete guide to setting up social media integration for your Art Supply Store MCP Server.

## Prerequisites

- Facebook Business account
- Instagram Business account (connected to your Facebook Page)
- Admin access to both accounts

## Table of Contents

1. [Create Facebook Business Account](#1-create-facebook-business-account)
2. [Create Facebook App](#2-create-facebook-app)
3. [Configure App Permissions](#3-configure-app-permissions)
4. [Get Your Access Tokens](#4-get-your-access-tokens)
5. [Connect Instagram](#5-connect-instagram)
6. [Configure MCP Server](#6-configure-mcp-server)
7. [Test Your Integration](#7-test-your-integration)
8. [Troubleshooting](#troubleshooting)

---

## 1. Create Facebook Business Account

If you don't already have a Facebook Business account:

1. Go to [business.facebook.com](https://business.facebook.com)
2. Click **Create Account**
3. Enter your business name, your name, and business email
4. Fill in your business details
5. Go to **Business Settings** → **Pages** → **Add** → **Create a New Page**
6. Create your art supply store's Facebook Page

**Result:** You now have a Facebook Business account and a Facebook Page.

---

## 2. Create Facebook App

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **My Apps** → **Create App**
3. Choose **Business** as the app type
4. Fill in:
   - **App Name**: "Art Supply Store Social Manager" (or your store name)
   - **App Contact Email**: Your business email
   - **Business Account**: Select your business account
5. Click **Create App**
6. In the app dashboard, find your **App ID** - save this!

**Result:** You have a Facebook App that can access the Graph API.

---

## 3. Configure App Permissions

### Required Permissions

Your app needs these permissions to post and manage content:

1. In your app dashboard, go to **App Settings** → **Basic**
2. Add your app to development mode
3. Go to **Tools** → **Graph API Explorer**
4. Click **Permissions** and add:
   - `pages_show_list` - View list of Pages
   - `pages_read_engagement` - Read engagement data
   - `pages_manage_posts` - Create, edit, and delete posts
   - `instagram_basic` - View Instagram account info
   - `instagram_content_publish` - Publish Instagram posts
   - `instagram_manage_comments` - Read and manage comments

### App Review (For Production)

⚠️ **For Development:** You can use your app immediately with your own Facebook Page.

🚀 **For Production** (to manage other Pages):
1. Go to **App Review** → **Permissions and Features**
2. Request the permissions listed above
3. Provide:
   - Business verification documents
   - Explanation of how you'll use each permission
   - Screen recording of your app in action
4. Wait 3-5 business days for review

**Development Mode**: Your app can manage Pages that you own/admin without app review!

---

## 4. Get Your Access Tokens

### Step 1: Get Page Access Token

1. Go to **Graph API Explorer**: [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
2. Select your app from the dropdown
3. Click **Generate Access Token**
4. Grant all requested permissions
5. Copy the **User Access Token** (short-lived)

### Step 2: Get Long-Lived Page Token

Now convert the short-lived token to a long-lived Page token:

```bash
# Replace with your values
APP_ID="your_app_id"
APP_SECRET="your_app_secret"  # Found in App Settings → Basic
SHORT_LIVED_TOKEN="token_from_step_1"

# Get long-lived user token
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${SHORT_LIVED_TOKEN}"
```

This returns a long-lived token (60 days). Save this as `LONG_LIVED_TOKEN`.

### Step 3: Get Page Token and Page ID

```bash
# Get your pages
curl -X GET "https://graph.facebook.com/v18.0/me/accounts?access_token=${LONG_LIVED_TOKEN}"
```

Response will include:
```json
{
  "data": [
    {
      "access_token": "EAAxxxxxxx",  // This is your FB_PAGE_TOKEN
      "id": "123456789",               // This is your FB_PAGE_ID
      "name": "Your Art Supply Store"
    }
  ]
}
```

**Save these values:**
- `access_token` → `FB_PAGE_TOKEN`
- `id` → `FB_PAGE_ID`

Page tokens don't expire as long as your app is active!

---

## 5. Connect Instagram

### Step 1: Convert to Instagram Business Account

1. Open Instagram app on your phone
2. Go to **Settings** → **Account** → **Switch to Professional Account**
3. Choose **Business**
4. Connect to your Facebook Page when prompted

### Step 2: Get Instagram Account ID

```bash
# Get Instagram account connected to your page
curl -X GET "https://graph.facebook.com/v18.0/${FB_PAGE_ID}?fields=instagram_business_account&access_token=${FB_PAGE_TOKEN}"
```

Response:
```json
{
  "instagram_business_account": {
    "id": "17841405309211844"  // This is your IG_ACCOUNT_ID
  },
  "id": "123456789"
}
```

**Save:** `instagram_business_account.id` → `IG_ACCOUNT_ID`

---

## 6. Configure MCP Server

### Step 1: Create .env File

```bash
cd /home/stacy/mcp
cp .env.example .env
```

### Step 2: Add Your Tokens

Edit `.env` with your values:

```bash
# Facebook Page Access Token (from Step 4)
FB_PAGE_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Facebook Page ID (from Step 4)
FB_PAGE_ID=123456789012345

# Instagram Business Account ID (from Step 5)
IG_ACCOUNT_ID=17841405309211844

# Optional: OpenAI for enhanced content generation
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Secure Your Credentials

```bash
# Make sure .env is in .gitignore (already done)
echo ".env" >> .gitignore

# Set restrictive permissions
chmod 600 .env
```

**⚠️ NEVER commit .env to version control!**

---

## 7. Test Your Integration

### Rebuild and Start

```bash
# Rebuild with new dependencies
npm run build

# Start the dashboard
npm run dashboard
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Test Each Tool

1. **Test Post Generation**:
   - Tool: `generate_post_ideas`
   - Params: `{"theme": "fall", "products": "Acrylic Paint, Brushes"}`
   - Expected: 5 post ideas generated

2. **Test Hashtag Generation**:
   - Tool: `generate_hashtags`
   - Params: `{"postTopic": "watercolor painting"}`
   - Expected: 15 relevant hashtags

3. **Test Facebook Post** (if configured):
   - Tool: `post_to_social_media`
   - Params: `{"platforms": "facebook", "message": "Test post from MCP!"}`
   - Expected: Success message with post ID
   - Check: Visit your Facebook Page to see the post

4. **Test Analytics** (if configured):
   - Tool: `get_social_analytics`
   - Params: `{"platform": "facebook", "period": 7}`
   - Expected: Reach, engagement, and top posts data

### Verify Configuration

If you see "Social media not configured" errors:

```bash
# Check .env file exists
ls -la .env

# Verify tokens are set (don't print actual values!)
grep -c "FB_PAGE_TOKEN=" .env
grep -c "FB_PAGE_ID=" .env
grep -c "IG_ACCOUNT_ID=" .env
```

---

## Troubleshooting

### Error: "Social media not configured"

**Solution:** Make sure `.env` file exists and contains valid tokens.

```bash
# Check if .env file is loaded
node -e "require('dotenv').config(); console.log('FB_PAGE_TOKEN:', process.env.FB_PAGE_TOKEN ? 'Set' : 'Not set')"
```

### Error: "Invalid OAuth access token"

**Causes:**
- Token expired (unlikely for page tokens)
- Wrong token type (user token instead of page token)
- App permissions revoked

**Solution:**
1. Regenerate tokens following Step 4
2. Make sure you're using the **Page Access Token**, not user token
3. Check app permissions in Facebook developers console

### Error: "Permissions error"

**Solution:** Add missing permissions in Graph API Explorer:
1. Go to developers.facebook.com/tools/explorer
2. Select your app
3. Click **Get Token** → **Get Page Access Token**
4. Check all required permissions
5. Generate new token

### Error: "Instagram account not found"

**Causes:**
- Instagram account not connected to Facebook Page
- Not a Business account
- Wrong account ID

**Solution:**
1. Verify Instagram is Business account
2. Connect to Facebook Page in Instagram settings
3. Re-run Step 5 to get correct `IG_ACCOUNT_ID`

### Posts Not Appearing

**Check:**
1. Visit Facebook Activity Log to see if post is there (might be in draft)
2. Check `published` parameter is true (not scheduled)
3. Verify page permissions: go to Facebook Page → Settings → Page roles → check your app has access

### Rate Limiting

Meta Graph API limits:
- **200 calls per hour per user**
- **200 calls per hour per app**

**Solution:** Space out API calls. For typical small business use (5-10 posts/day, checking analytics hourly), you'll stay well within limits.

---

## Security Best Practices

### 1. Protect Your Tokens

```bash
# ✅ DO: Use .env file
FB_PAGE_TOKEN=xxxxx

# ❌ DON'T: Hardcode in source
const token = "EAAxxxxx";  // Never do this!
```

### 2. Rotate Tokens Regularly

Even though page tokens don't expire, rotate them every 90 days:
1. Generate new token (Step 4)
2. Update `.env`
3. Restart server
4. Verify old token no longer works

### 3. Restrict App Permissions

Only request permissions you actually use. Remove unused ones from Graph API Explorer.

### 4. Monitor App Activity

Check regularly:
- **App Dashboard** → **Analytics** for unusual activity
- **Page Settings** → **Business integrations** to see what's connected

---

## Next Steps

✅ Your social media integration is ready!

### Recommended Workflows

1. **Daily Morning Routine** (5 min):
   ```
   - generate_post_ideas → pick one
   - generate_hashtags → copy to clipboard
   - post_to_social_media → publish to both platforms
   ```

2. **Afternoon Check** (5 min):
   ```
   - get_new_comments → review comments
   - suggest_comment_reply → pick reply
   - Respond via Facebook/Instagram app
   ```

3. **Weekly Planning** (30 min):
   ```
   - schedule_weekly_posts → plan content calendar
   - get_social_analytics → review performance
   - adjust strategy based on what performed best
   ```

### Learning Resources

- **Meta for Developers**: [developers.facebook.com](https://developers.facebook.com)
- **Graph API Documentation**: [developers.facebook.com/docs/graph-api](https://developers.facebook.com/docs/graph-api)
- **Instagram API**: [developers.facebook.com/docs/instagram-api](https://developers.facebook.com/docs/instagram-api)
- **API Explorer**: [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)

---

## Cost Summary

### Free Forever ✅

- Facebook Graph API: **FREE**
- Instagram API: **FREE**
- Rate limits: **200 calls/hour** (enough for small business)
- No credit card required
- No monthly fees

### Optional Upgrades

- **OpenAI API** (enhanced captions): ~$5-20/month
- **Image hosting** (AWS S3/Cloudinary): ~$1-5/month

**Total cost: $0-25/month** vs. **$500-2000/month** for social media management agency!

---

## Support

Having issues? Check:

1. This guide's **Troubleshooting** section
2. **SOCIAL_MEDIA_INTEGRATION_PLAN.md** for architecture details
3. **SOCIAL_MEDIA_API_COSTS.md** for API pricing info
4. Meta's [Developer Community Forum](https://developers.facebook.com/community/)

**Remember:** Development mode lets you test everything with your own pages before submitting for app review!
