# Clode Studio Release Guide

## 📦 Release Overview

Clode Studio offers three distribution channels to meet different user needs:

| Channel | Size | Features | Use Case |
|---------|------|----------|----------|
| **Desktop Full** | ~150-200MB | All features, bundled ripgrep, LSP support | Primary users, full IDE experience |
| **Desktop Lite** | ~80-100MB | Core features, no bundled tools | Limited bandwidth/storage |
| **Server/Headless** | ~40-50MB | CLI only, remote access | Server deployments, CI/CD |

## 🚀 Quick Start for Users

### Installing Released Versions

#### Option 1: Auto-installer (Recommended)
```bash
curl -sSL https://get.clode.studio | bash
```

#### Option 2: Download from GitHub Releases
1. Go to [Releases](https://github.com/haidar-ali/clode-studio/releases)
2. Download the appropriate file for your platform
3. Install using your system's package manager or run directly

### Running Different Modes

```bash
# Desktop mode (default)
clode-studio

# Hybrid mode (desktop + remote access)
clode-studio --hybrid

# Headless mode (server only, no GUI)
clode-studio --headless

# With custom configuration
RELAY_TYPE=CLOUDFLARE clode-studio --hybrid
```

## 🔧 Building Releases Locally

### Prerequisites

- Node.js 22+ (required)
- Git
- Platform-specific build tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools
  - **Linux**: build-essential, libgtk-3-dev

### Building for Your Platform

```bash
# Install dependencies
npm ci

# Build for your current platform
npm run dist

# Build specific variant
npm run dist:lite    # Lite version
npm run dist:server  # Server/headless version
```

### Cross-Platform Building

```bash
# Build for all platforms (requires appropriate OS or Docker)
npm run dist:all

# Build for specific platforms
npm run dist:mac    # macOS (requires macOS)
npm run dist:win    # Windows 
npm run dist:linux  # Linux
```

## 📋 Release Process for Maintainers

### 1. Prepare Release

```bash
# Update version in package.json
npm version patch  # or minor/major

# Commit changes
git add package.json package-lock.json
git commit -m "chore: bump version to x.y.z"

# Create and push tag
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

### 2. Automated Release via GitHub Actions

When you push a tag matching `v*.*.*`, GitHub Actions will:
1. Build for all platforms (macOS x64/arm64, Windows x64, Linux x64)
2. Build lite and server variants
3. Create draft release with artifacts
4. Generate release notes

### 3. Manual Release (if needed)

```bash
# Build all platforms locally (requires proper environment)
npm run release:draft

# Or build and publish immediately
npm run release
```

### 4. Finalize Release

1. Go to [GitHub Releases](https://github.com/haidar-ali/clode-studio/releases)
2. Review the draft release
3. Edit release notes if needed
4. Publish the release

## 🔐 Code Signing

### macOS
1. Obtain Apple Developer certificate
2. Add to GitHub Secrets:
   - `MAC_CERTS`: Base64 encoded .p12 certificate
   - `MAC_CERTS_PASSWORD`: Certificate password
   - `APPLE_ID`: Your Apple ID
   - `APPLE_ID_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your team ID

### Windows
1. Obtain code signing certificate
2. Add to GitHub Secrets:
   - `WINDOWS_CERTS`: Base64 encoded .pfx certificate
   - `WINDOWS_CERTS_PASSWORD`: Certificate password

## 🔄 Auto-Updates

Clode Studio includes automatic updates:

- **Check Interval**: Every 60 minutes
- **Update Channels**: stable, beta, alpha
- **User Control**: Can disable or change channel in settings
- **Differential Updates**: Only downloads changed files

### Configuring Update Channel

Users can switch update channels:
```javascript
// In app settings or via API
autoUpdater.setUpdateChannel('beta'); // or 'stable', 'alpha'
```

## 📊 Release Variants Configuration

### Desktop Full (Default)
- All modules included
- Bundled ripgrep for all platforms
- Full LSP support
- Complete UI components

### Desktop Lite
Excludes:
- Bundled ripgrep (uses system version)
- Advanced CodeMirror modes
- Chart.js visualizations
- Some UI components

### Server/Headless
Includes only:
- Core Electron shell
- Remote server
- CLI interface
- Essential services

## 🐳 Docker Support (Future)

```dockerfile
# Headless server image
FROM node:22-slim
WORKDIR /app
COPY dist/linux-unpacked ./
ENV CLODE_MODE=headless
CMD ["./clode-studio", "--headless"]
```

## 📝 Version Naming Convention

- **Stable**: `v1.0.0`
- **Beta**: `v1.0.0-beta.1`
- **Alpha**: `v1.0.0-alpha.1`
- **Nightly**: `v1.0.0-nightly.20250810`

## 🔍 Troubleshooting Releases

### Build Failures

```bash
# Clean and rebuild
rm -rf node_modules dist .output
npm ci
npm run dist

# Verbose build for debugging
DEBUG=electron-builder npm run dist
```

### Platform-Specific Issues

**macOS Notarization Failed**
- Ensure valid Apple Developer account
- Check certificate expiration
- Verify app-specific password

**Windows SmartScreen**
- Code signing required for reputation
- Submit to Microsoft for analysis

**Linux AppImage Won't Run**
```bash
chmod +x ClodeStudio-*.AppImage
./ClodeStudio-*.AppImage --no-sandbox
```

## 🎯 Release Checklist

- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] All tests passing
- [ ] Built and tested locally
- [ ] Tag created and pushed
- [ ] GitHub Actions completed successfully
- [ ] Release notes reviewed
- [ ] Binaries tested on each platform
- [ ] Auto-updater verified working
- [ ] Documentation updated

## 📡 Analytics & Telemetry

Clode Studio collects minimal, anonymous usage data:
- Version number
- Platform/OS
- Update success/failure
- Crash reports (opt-in)

Users can disable telemetry in settings or via:
```bash
CLODE_TELEMETRY=false clode-studio
```

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/haidar-ali/clode-studio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/haidar-ali/clode-studio/discussions)
- **Security**: Report to security@clode.studio

---

*Last updated: January 2025*