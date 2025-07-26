# Tax Sale Listings Deployment Guide

## Overview
This application consists of a Node.js backend server and a frontend that can fetch live tax sale data from Georgia counties.

## Deployment Options

### Option 1: Render (Recommended - Free Tier Available)

1. **Prepare Your Repository**
   - Ensure your code is in a Git repository (GitHub, GitLab, etc.)
   - Your `package.json` is properly configured
   - Your server uses `process.env.PORT` for the port

2. **Deploy to Render**
   - Go to [render.com](https://render.com)
   - Sign up/in with your GitHub account
   - Click "New" → "Web Service"
   - Connect your repository
   - Configure:
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment**: Node
     - **Instance Type**: Free (or paid for better performance)

3. **Access Your App**
   - Render will provide a URL like `https://yourapp.onrender.com`
   - Your API will be available at `https://yourapp.onrender.com/api/counties`

### Option 2: Railway

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "Deploy from GitHub repo"
4. Select your repository
5. Railway will auto-detect Node.js and deploy

### Option 3: Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`
4. Deploy: `git push heroku main`

### Option 4: DigitalOcean App Platform

1. Go to DigitalOcean
2. Create new App
3. Connect GitHub repository
4. Configure build settings

## Local Testing Before Deployment

1. Test your app locally:
   ```bash
   npm install
   npm start
   ```

2. Visit `http://localhost:3001` to ensure it works

3. Test the API endpoints:
   - `http://localhost:3001/api/counties`
   - `http://localhost:3001/api/tax-sale-listings/chatham`

## Environment Variables (if needed)

Most deployment platforms allow you to set environment variables:
- `PORT` - Set automatically by most platforms
- `NODE_ENV` - Set to "production"

## Files Important for Deployment

- `package.json` - Contains dependencies and start script
- `server.js` - Main server file
- `app.html` - Main frontend file (deployment-ready)
- `.gitignore` - Excludes node_modules from deployment

## After Deployment

1. Your app will be available at the provided URL
2. The frontend will automatically use the deployed API
3. Test all functionality including PDF parsing and mapping

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **App crashes**: Check logs in your deployment platform
- **API errors**: Ensure CORS is properly configured
- **Slow response**: PDF parsing can take time; consider caching

## Cost Considerations

- **Free tiers**: Render, Railway, Heroku all offer free tiers
- **Limitations**: Free tiers may have bandwidth/compute limits
- **Scaling**: Paid tiers offer better performance and uptime

## Monitoring

Most platforms provide:
- Application logs
- Performance metrics
- Uptime monitoring
- Error tracking
