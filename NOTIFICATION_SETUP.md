# PDF Change Alert System Setup Guide

## 🚨 Overview

Your tax sale application now includes a comprehensive notification system that will alert you whenever the PDF file changes. This includes:

- **New properties** added to the tax sale
- **Properties removed** from the list  
- **File updates** with detailed statistics
- **Multiple notification methods** (Email, Slack, Webhook, File logging)

## 🔧 Quick Setup

### 1. **Choose Your Notification Methods**

Copy the environment template:
```bash
cp .env.template .env
```

Then edit `.env` and uncomment the notification methods you want:

#### 📧 **Email Notifications (Recommended)**
```env
EMAIL_NOTIFICATIONS=true
NOTIFICATION_EMAIL=your-email@example.com
FROM_EMAIL=noreply@taxsalealerts.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### 💬 **Slack Notifications**
1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Add to your `.env`:
```env
SLACK_NOTIFICATIONS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#tax-sale-updates
```

#### 🎯 **Custom Webhook**
```env
WEBHOOK_NOTIFICATIONS=true
WEBHOOK_URL=https://your-webhook-endpoint.com/tax-sale
```

#### 📝 **File Logging**
```env
FILE_NOTIFICATIONS=true
NOTIFICATION_LOG_PATH=./notifications.log
```

### 2. **Install Email Dependencies (if using email)**
```bash
npm install nodemailer
```

### 3. **Test Your Setup**

#### Test all notifications:
```bash
# Via API
curl -X POST https://your-app.onrender.com/api/test-notifications

# Or visit in browser:
https://your-app.onrender.com/api/test-notifications
```

#### Check configuration:
```bash
curl https://your-app.onrender.com/api/notification-config
```

## 📊 **What You'll Receive**

When the PDF changes, you'll get notifications with:

- **County name** (e.g., "CHATHAM")
- **Total properties** in new file
- **New properties** added (with IDs)
- **Removed properties** (with IDs)
- **Direct link** to the PDF
- **Geocoding statistics**
- **Timestamp** of the change

### Example Email:
```
🚨 Tax Sale PDF Update Alert

County: CHATHAM
Time: August 12, 2025 at 2:30 PM
Total Properties: 247
New Properties: 12
Removed Properties: 3
PDF URL: View PDF

This is an automated notification from your Tax Sale Monitoring System
```

## 🔄 **Automated Monitoring**

The system automatically:

1. **Checks for PDF changes** every time someone visits your site
2. **Compares file hashes** to detect even minor changes
3. **Analyzes property differences** (added/removed)
4. **Sends notifications** only when actual changes occur
5. **Prevents spam** by only notifying on real changes

## 📋 **API Endpoints**

Your application now includes these notification endpoints:

```bash
# Test notifications
POST /api/test-notifications

# Get notification configuration  
GET /api/notification-config

# Trigger manual notification
POST /api/trigger-notification

# View notification log
GET /api/notification-log

# Check system health (includes notification status)
GET /api/health
```

## 🚀 **Render Deployment**

### Environment Variables in Render:

1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add these variables:

```
EMAIL_NOTIFICATIONS = true
NOTIFICATION_EMAIL = your-email@example.com
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = your-gmail@gmail.com
SMTP_PASS = your-gmail-app-password
```

### Gmail Setup:
1. Enable 2-factor authentication on Gmail
2. Generate an "App Password" for your application
3. Use the app password (not your regular password)

## 🧪 **Testing**

### Test locally:
```bash
node server.js

# In another terminal:
curl -X POST http://localhost:3001/api/test-notifications
```

### Test on Render:
```bash
# Replace YOUR_APP_NAME with your actual app name
curl -X POST https://YOUR_APP_NAME.onrender.com/api/test-notifications
```

## 📱 **Mobile Notifications**

### IFTTT Integration:
1. Set up a webhook notification
2. Use IFTTT to trigger phone notifications
3. Configure webhook URL: `https://maker.ifttt.com/trigger/YOUR_EVENT/with/key/YOUR_KEY`

### Slack Mobile:
- Install Slack mobile app
- Enable push notifications for your channel
- You'll get mobile alerts instantly

## 🔍 **Monitoring & Logs**

### Check notification status:
```bash
curl https://your-app.onrender.com/api/notification-config
```

### View recent notifications:
```bash
curl https://your-app.onrender.com/api/notification-log
```

### Render logs:
- Go to Render dashboard → Your service → Logs
- Look for messages starting with "📢" for notification activity

## 🚨 **Troubleshooting**

### No notifications received?

1. **Check configuration**:
   ```bash
   curl https://your-app.onrender.com/api/notification-config
   ```

2. **Test manually**:
   ```bash
   curl -X POST https://your-app.onrender.com/api/test-notifications
   ```

3. **Check Render logs** for error messages

4. **Verify email settings** (most common issue):
   - Use Gmail app password, not regular password
   - Enable "Less secure app access" if needed
   - Check spam folder

### Gmail not working?
- Enable 2FA and generate app password
- Use `smtp.gmail.com`, port `587`
- Check spam/promotions folder

### Slack not working?  
- Verify webhook URL format
- Check channel permissions
- Test webhook manually with curl

## 💡 **Pro Tips**

1. **Start with file logging** to verify the system works
2. **Use Gmail** for the easiest email setup  
3. **Set up Slack** for instant mobile notifications
4. **Monitor Render logs** during initial setup
5. **Test with force refresh** to simulate changes

## 📞 **Support Commands**

```bash
# Health check with notification status
curl https://YOUR_APP_NAME.onrender.com/api/health

# Force refresh to test notification 
curl -X POST https://YOUR_APP_NAME.onrender.com/api/force-refresh/chatham

# Manual test notification
curl -X POST https://YOUR_APP_NAME.onrender.com/api/trigger-notification
```

---

🎉 **You're all set!** Your system will now automatically alert you whenever the tax sale PDF is updated with new properties.
