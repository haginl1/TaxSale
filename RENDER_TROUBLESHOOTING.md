# Render Database Ingestion Troubleshooting Guide

## 🎯 Quick Fixes (Try These First)

### 1. **Manual Database Initialization**
Visit these URLs in your browser (replace `your-app-name` with your actual Render app name):

```
https://your-app-name.onrender.com/api/health
https://your-app-name.onrender.com/api/auto-init
```

### 2. **Force Refresh via API**
```bash
curl -X POST https://your-app-name.onrender.com/api/force-refresh/chatham \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3. **Check Current Status**
```bash
curl https://your-app-name.onrender.com/api/debug-status
```

## 🔍 Root Causes & Solutions

### **Issue 1: Ephemeral File System**
**Problem**: Render's free tier resets files on each deployment.
**Solution**: Database auto-initializes on first request.

**Fix Steps**:
1. Deploy your latest code
2. Wait 2-3 minutes for deployment to complete
3. Visit: `https://your-app-name.onrender.com/api/health`
4. If database is empty, visit: `https://your-app-name.onrender.com/api/auto-init`

### **Issue 2: Cold Start Timeouts**
**Problem**: First PDF parsing takes time, causing timeouts.
**Solutions**:

1. **Increase timeout settings** in Render (if available)
2. **Warm up the service** after deployment:
   ```bash
   # Visit these endpoints to warm up
   curl https://your-app-name.onrender.com/api/counties
   curl https://your-app-name.onrender.com/api/health
   ```

### **Issue 3: Memory/Resource Constraints**
**Problem**: Free tier has limited resources for PDF parsing.
**Solutions**:

1. **Monitor memory usage**: Check Render logs for memory errors
2. **Consider upgrading** to a paid tier for more resources
3. **Optimize parsing**: The server now caches results to reduce load

## 📋 Step-by-Step Resolution

### **Step 1: Check Health Status**
```bash
curl https://your-app-name.onrender.com/api/health
```
Expected response:
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "totalProperties": 0,
    "hasData": false
  }
}
```

### **Step 2: Initialize Database**
```bash
curl -X POST https://your-app-name.onrender.com/api/auto-init
```

### **Step 3: Verify Data**
```bash
curl https://your-app-name.onrender.com/api/tax-sale-listings/chatham
```

### **Step 4: Check Logs**
1. Go to your Render dashboard
2. Select your service
3. Click "Logs" tab
4. Look for error messages or timeouts

## 🔧 Advanced Troubleshooting

### **Enable Debug Mode**
Add environment variable in Render:
- Key: `DEBUG`
- Value: `true`

### **Manual Force Refresh**
If auto-init fails, try manual refresh:
```bash
curl -X POST https://your-app-name.onrender.com/api/force-refresh/chatham \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 120
```

### **Clear Cache and Restart**
```bash
# Clear cache
curl -X POST https://your-app-name.onrender.com/api/clear-cache

# Wait 30 seconds then force refresh
curl -X POST https://your-app-name.onrender.com/api/force-refresh/chatham
```

## 🎯 Prevention Tips

### **1. Automated Initialization**
The server now auto-initializes on first request with no data.

### **2. Health Monitoring**
Set up monitoring to check `/api/health` endpoint regularly.

### **3. Graceful Degradation**
The app shows appropriate messages when data is loading.

### **4. Caching Strategy**
- PDF hash checking prevents unnecessary re-processing
- Geocoding results are cached
- Database persists between restarts (when possible)

## 🚨 When to Escalate

Contact support if:
1. Multiple force refreshes fail
2. Memory errors persist in logs
3. API consistently returns 500 errors
4. Database initialization fails repeatedly

## 📞 Quick Reference Commands

Replace `YOUR_APP_NAME` with your actual Render app name:

```bash
# Health check
curl https://YOUR_APP_NAME.onrender.com/api/health

# Auto-initialize
curl -X POST https://YOUR_APP_NAME.onrender.com/api/auto-init

# Force refresh
curl -X POST https://YOUR_APP_NAME.onrender.com/api/force-refresh/chatham

# Clear cache
curl -X POST https://YOUR_APP_NAME.onrender.com/api/clear-cache

# Check data
curl https://YOUR_APP_NAME.onrender.com/api/tax-sale-listings/chatham
```
