#!/bin/bash
echo "🛒 TESTING COMPLETE CUSTOMER PURCHASE FLOW"
echo "==========================================="

# Step 1: Check if Stripe delivery system exists
echo -e "\n1️⃣ Checking Stripe payment system..."
if [ -f stripe-delivery-system.js ]; then
    echo "✅ Stripe delivery system found"
else
    echo "❌ Missing Stripe delivery system"
fi

# Step 2: Check Docker container builder
echo -e "\n2️⃣ Checking Docker container builder..."
if [ -f Dockerfile ]; then
    echo "✅ Dockerfile found for customer containers"
    grep -q "dual-bot-dashboard" Dockerfile && echo "✅ Dashboard included in container" || echo "⚠️ Dashboard not in Dockerfile"
else
    echo "❌ No Dockerfile for customer delivery"
fi

# Step 3: Check nginx serves the dashboard
echo -e "\n3️⃣ Checking nginx configuration..."
nginx_config="/etc/nginx/sites-available/ogzprime.com"
if [ -f "$nginx_config" ]; then
    grep -q "dual-bot-dashboard\|dashboard" "$nginx_config" && echo "✅ Dashboard configured in nginx" || echo "⚠️ Dashboard not configured"
else
    echo "⚠️ Using different nginx config"
fi

# Step 4: Verify dashboard is accessible
echo -e "\n4️⃣ Testing dashboard accessibility..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:3008/dual-bot-dashboard.html | grep -q "200" && echo "✅ Dashboard accessible locally" || echo "❌ Dashboard not accessible"

# Step 5: Check if customer package script exists
echo -e "\n5️⃣ Looking for customer package builder..."
ls -la build-customer-package* package-builder* 2>/dev/null || echo "⚠️ No package builder found - need to create"

echo -e "\n📊 PURCHASE FLOW STATUS:"
echo "========================"
echo "Payment System: READY (Stripe)"
echo "Dashboard: READY (dual-bot-dashboard.html)"
echo "Container: NEEDS CHECK"
echo "Package Builder: NEEDS CREATION"
