# Deployment Guide

## Deploy to Render (Recommended)

### Prerequisites
- GitHub repository with your code
- Render account (free at render.com)

### Steps to Deploy

1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Prepare for production deployment"
   git push origin main
   ```

2. **Deploy on Render:**
   - Go to [render.com](https://render.com) and sign up/login
   - Click "New +" and select "Web Service"
   - Connect your GitHub repository
   - Use these settings:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Environment:** `Node`
     - **Plan:** Free (or paid for better performance)

3. **Environment Variables (if needed):**
   - NODE_ENV: `production`
   - PORT: (automatically set by Render)

### Alternative: Deploy to Railway

1. **Railway Setup:**
   - Go to [railway.app](https://railway.app)
   - Connect your GitHub repository
   - Railway will auto-detect Node.js and deploy

### Alternative: Deploy to Vercel

1. **Vercel Setup:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will handle the rest automatically

## Production Considerations

- The app uses file-based caching for geocoding results
- PDF uploads are stored temporarily in memory
- Consider adding environment-specific configurations
- Monitor performance and add rate limiting if needed

## Features Available in Production

✅ PDF parsing and property extraction
✅ Server-side geocoding with caching
✅ Interactive property maps
✅ Street View integration
✅ Property sorting and filtering
✅ Mobile-responsive design

## Support

If you encounter issues during deployment, check:
1. Node.js version compatibility (>=16.0.0)
2. Environment variables are set correctly
3. All dependencies are listed in package.json
