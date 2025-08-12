#!/bin/bash

# Script to build and sign macOS app using .env.build file
echo "🔨 Building and Signing Clode Studio for macOS"
echo "=============================================="

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS"
    exit 1
fi

# Load environment variables from .env.build
if [ -f .env.build ]; then
    echo "📄 Loading credentials from .env.build..."
    export $(cat .env.build | grep -v '^#' | xargs)
else
    echo "❌ .env.build file not found!"
    echo "   Please create .env.build with your Apple credentials"
    exit 1
fi

# Verify required variables are set
if [ -z "$APPLE_ID" ] || [ "$APPLE_ID" = "your-email@example.com" ]; then
    echo "❌ APPLE_ID not set in .env.build"
    echo "   Please edit .env.build and add your Apple ID"
    exit 1
fi

if [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ "$APPLE_APP_SPECIFIC_PASSWORD" = "xxxx-xxxx-xxxx-xxxx" ]; then
    echo "❌ APPLE_APP_SPECIFIC_PASSWORD not set in .env.build"
    echo "   Please edit .env.build and add your app-specific password"
    echo "   Get one from: https://appleid.apple.com"
    exit 1
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

if [ "$SKIP_NOTARIZE" = "true" ]; then
    echo "⚠️  Skipping notarization (SKIP_NOTARIZE=true)"
    npm run dist:mac
else
    echo "   This will also notarize the app with Apple (may take 5-10 minutes)..."
    npm run dist:mac
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo ""
    echo "📁 Output files:"
    ls -lh dist/*.dmg 2>/dev/null
    ls -lh dist/*.zip 2>/dev/null
    ls -lh dist/mac*/*.app 2>/dev/null
    echo ""
    if [ "$SKIP_NOTARIZE" != "true" ]; then
        echo "🎉 Your app is now signed and notarized!"
        echo "   Users can install it without security warnings."
    else
        echo "⚠️  App is signed but not notarized (testing mode)"
        echo "   Users may still see security warnings."
    fi
else
    echo ""
    echo "❌ Build failed. Check the error messages above."
    exit 1
fi