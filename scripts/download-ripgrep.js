import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RIPGREP_VERSION = '14.1.0';

const RIPGREP_URLS = {
  'darwin-x64': `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-apple-darwin.tar.gz`,
  'darwin-arm64': `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-aarch64-apple-darwin.tar.gz`,
  'linux-x64': `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
  'win32-x64': `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc.zip`,
};

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  } else if (platform === 'linux') {
    return 'linux-x64';
  } else if (platform === 'win32') {
    return 'win32-x64';
  }
  
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

async function extractArchive(archivePath, destDir) {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Use PowerShell to extract zip on Windows
    execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`);
  } else {
    // Use tar for macOS and Linux
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`);
  }
}

async function downloadRipgrep() {
  try {
    const platformKey = getPlatformKey();
    const url = RIPGREP_URLS[platformKey];
    
    if (!url) {
      throw new Error(`No ripgrep binary available for platform: ${platformKey}`);
    }
    
    const vendorDir = path.join(__dirname, '..', 'vendor', 'ripgrep');
    const platformDir = path.join(vendorDir, platformKey);
    
    // Create platform-specific directory
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }
    
    // Check if already downloaded
    const rgBinary = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const binaryPath = path.join(platformDir, rgBinary);
    
    if (fs.existsSync(binaryPath)) {
    
      return;
    }
    
    // Download archive
    const archiveExt = process.platform === 'win32' ? '.zip' : '.tar.gz';
    const archivePath = path.join(platformDir, `ripgrep${archiveExt}`);
    
    await downloadFile(url, archivePath);
  
    
    // Extract archive
    await extractArchive(archivePath, platformDir);
    
    // Find the rg binary in the extracted files
    const extractedDir = fs.readdirSync(platformDir).find(name => 
      name.startsWith('ripgrep-') && fs.statSync(path.join(platformDir, name)).isDirectory()
    );
    
    if (extractedDir) {
      const extractedBinaryPath = path.join(platformDir, extractedDir, rgBinary);
      if (fs.existsSync(extractedBinaryPath)) {
        // Move binary to platform directory
        fs.renameSync(extractedBinaryPath, binaryPath);
        
        // Make binary executable on Unix-like systems
        if (process.platform !== 'win32') {
          fs.chmodSync(binaryPath, 0o755);
        }
        
        // Clean up extracted directory
        fs.rmSync(path.join(platformDir, extractedDir), { recursive: true });
      }
    }
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    
  
    
  } catch (error) {
    console.error('Failed to download ripgrep:', error);
    process.exit(1);
  }
}

// Run the download
downloadRipgrep();