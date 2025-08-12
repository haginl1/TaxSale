#!/bin/bash

# Render Post-Deploy Hook
# This script runs after your app is deployed on Render

echo "🚀 Starting post-deployment initialization..."

# Wait for the server to be ready
sleep 10

# Get the app URL from Render environment
if [ -z "$RENDER_EXTERNAL_URL" ]; then
    echo "⚠️ RENDER_EXTERNAL_URL not found, using localhost"
    APP_URL="http://localhost:${PORT:-3001}"
else
    APP_URL="$RENDER_EXTERNAL_URL"
fi

echo "🔗 App URL: $APP_URL"

# Function to check if server is ready
check_server_ready() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "📡 Checking server readiness (attempt $attempt/$max_attempts)..."
        
        if curl -s -f "$APP_URL/api/health" > /dev/null; then
            echo "✅ Server is ready!"
            return 0
        fi
        
        echo "⏳ Server not ready yet, waiting 10 seconds..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    echo "❌ Server failed to become ready after $max_attempts attempts"
    return 1
}

# Function to initialize database
initialize_database() {
    echo "🗄️ Initializing database..."
    
    local response=$(curl -s -X POST "$APP_URL/api/auto-init" \
        -H "Content-Type: application/json" \
        -w "HTTPSTATUS:%{http_code}" \
        -d '{}')
    
    local http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    local body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ $http_code -eq 200 ]; then
        echo "✅ Database initialization successful!"
        echo "📊 Response: $body"
    else
        echo "⚠️ Database initialization returned status: $http_code"
        echo "📄 Response: $body"
        
        # Try force refresh as fallback
        echo "🔄 Trying force refresh as fallback..."
        curl -s -X POST "$APP_URL/api/force-refresh/chatham" \
            -H "Content-Type: application/json" \
            -d '{}' || echo "❌ Force refresh also failed"
    fi
}

# Main execution
if check_server_ready; then
    initialize_database
    echo "✅ Post-deployment initialization complete!"
else
    echo "❌ Could not initialize database - server not ready"
    exit 1
fi
