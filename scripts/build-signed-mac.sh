#!/bin/bash

# Script to build and sign macOS app
# This script helps build, sign, and notarize the macOS app

echo "🔨 Building and Signing Clode Studio for macOS"
echo "=============================================="

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS"
    exit 1
fi

# Check for required environment variables
if [ -z "$APPLE_ID" ]; then
    echo "⚠️  APPLE_ID not set. Please export APPLE_ID='your-email@example.com'"
    read -p "Enter your Apple ID: " APPLE_ID
    export APPLE_ID
fi

if [ -z "$APPLE_APP_PASSWORD" ]; then
    echo "⚠️  APPLE_APP_PASSWORD not set. Please export APPLE_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx'"
    echo "   (Get this from appleid.apple.com -> App-Specific Passwords)"
    read -s -p "Enter your app-specific password: " APPLE_APP_PASSWORD
    echo
    export APPLE_APP_PASSWORD
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    echo "⚠️  APPLE_TEAM_ID not set. Please export APPLE_TEAM_ID='YOUR_TEAM_ID'"
    read -p "Enter your Team ID: " APPLE_TEAM_ID
    export APPLE_TEAM_ID
fi

# Check for Developer ID certificate
echo ""
echo "📜 Checking for Developer ID certificate..."
CERT_CHECK=$(security find-identity -v -p codesigning | grep "Developer ID Application")
if [ -z "$CERT_CHECK" ]; then
    echo "❌ No Developer ID Application certificate found!"
    echo "   Please install your certificate from developer.apple.com"
    exit 1
else
    echo "✅ Certificate found:"
    echo "   $CERT_CHECK"
fi

# Clean previous builds
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Build the app
echo ""
echo "🏗️  Building the app..."
npm run build

# Compile Electron files
echo ""
echo "⚙️  Compiling Electron files..."
npm run electron:compile

# Build and sign the app
echo ""
echo "📦 Building and signing macOS app..."
echo "   This will also notarize the app with Apple (may take 5-10 minutes)..."

# Use electron-builder with environment variables
npx electron-builder --mac --config electron-builder.yml \
    --config.mac.identity="$CERT_CHECK" \
    --config.mac.notarize.appleId="$APPLE_ID" \
    --config.mac.notarize.appleIdPassword="$APPLE_APP_PASSWORD" \
    --config.mac.notarize.teamId="$APPLE_TEAM_ID"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo ""
    echo "📁 Output files:"
    ls -lh dist/*.dmg 2>/dev/null
    ls -lh dist/*.zip 2>/dev/null
    echo ""
    echo "🎉 Your app is now signed and notarized!"
    echo "   Users can install it without security warnings."
else
    echo ""
    echo "❌ Build failed. Check the error messages above."
    exit 1
fi