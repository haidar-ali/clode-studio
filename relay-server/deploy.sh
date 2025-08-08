#!/bin/bash

# Clode Relay Server Deployment Script
# Usage: ./deploy.sh [option]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${DOMAIN:-relay.clode.studio}
EMAIL=${EMAIL:-admin@clode.studio}

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Clode Relay Server Deployment${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check dependencies
check_deps() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    local deps_missing=false
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed${NC}"
        deps_missing=true
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Docker Compose is not installed${NC}"
        deps_missing=true
    fi
    
    if [ "$deps_missing" = true ]; then
        echo -e "${RED}Please install missing dependencies${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}All dependencies installed${NC}"
}

# Generate secrets
generate_secrets() {
    echo -e "${YELLOW}Generating secrets...${NC}"
    
    if [ ! -f .env ]; then
        JWT_SECRET=$(openssl rand -hex 32)
        cat > .env <<EOF
JWT_SECRET=$JWT_SECRET
DOMAIN=$DOMAIN
REDIS_URL=redis://redis:6379
PORT=3790
EOF
        echo -e "${GREEN}Created .env file with secrets${NC}"
    else
        echo -e "${YELLOW}.env file already exists, skipping${NC}"
    fi
}

# Setup SSL certificates
setup_ssl() {
    echo -e "${YELLOW}Setting up SSL certificates...${NC}"
    
    mkdir -p ssl
    
    if [ ! -f ssl/fullchain.pem ]; then
        echo "Choose SSL setup method:"
        echo "1. Let's Encrypt (recommended for production)"
        echo "2. Self-signed (for testing only)"
        echo "3. Skip (I'll add certificates manually)"
        read -p "Choice (1-3): " ssl_choice
        
        case $ssl_choice in
            1)
                # Let's Encrypt
                echo -e "${YELLOW}Setting up Let's Encrypt...${NC}"
                docker run -it --rm \
                    -v $(pwd)/ssl:/etc/letsencrypt \
                    -v $(pwd)/certbot/www:/var/www/certbot \
                    certbot/certbot certonly \
                    --webroot \
                    --webroot-path=/var/www/certbot \
                    --email $EMAIL \
                    --agree-tos \
                    --no-eff-email \
                    -d $DOMAIN
                
                # Link certificates
                ln -sf /etc/letsencrypt/live/$DOMAIN/fullchain.pem ssl/fullchain.pem
                ln -sf /etc/letsencrypt/live/$DOMAIN/privkey.pem ssl/privkey.pem
                ;;
            2)
                # Self-signed
                echo -e "${YELLOW}Generating self-signed certificate...${NC}"
                openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                    -keyout ssl/privkey.pem \
                    -out ssl/fullchain.pem \
                    -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
                ;;
            3)
                echo -e "${YELLOW}Skipping SSL setup${NC}"
                echo "Place your certificates in:"
                echo "  - ssl/fullchain.pem"
                echo "  - ssl/privkey.pem"
                ;;
        esac
    else
        echo -e "${GREEN}SSL certificates already exist${NC}"
    fi
}

# Deploy with Docker Compose
deploy_docker() {
    echo -e "${YELLOW}Deploying with Docker Compose...${NC}"
    
    # Build and start services
    docker-compose build
    docker-compose up -d
    
    # Wait for services to be ready
    echo -e "${YELLOW}Waiting for services to start...${NC}"
    sleep 5
    
    # Check health
    if curl -f http://localhost:3790/health > /dev/null 2>&1; then
        echo -e "${GREEN}Relay server is running!${NC}"
        echo -e "${GREEN}Access at: https://$DOMAIN${NC}"
    else
        echo -e "${RED}Failed to start relay server${NC}"
        docker-compose logs relay
        exit 1
    fi
}

# Deploy to cloud providers
deploy_cloud() {
    echo "Choose cloud provider:"
    echo "1. Fly.io (free tier available)"
    echo "2. Railway"
    echo "3. DigitalOcean App Platform"
    echo "4. AWS ECS"
    echo "5. Google Cloud Run"
    read -p "Choice (1-5): " cloud_choice
    
    case $cloud_choice in
        1)
            # Fly.io
            echo -e "${YELLOW}Deploying to Fly.io...${NC}"
            
            if ! command -v flyctl &> /dev/null; then
                echo "Installing Fly CLI..."
                curl -L https://fly.io/install.sh | sh
            fi
            
            flyctl launch --name clode-relay --region sjc
            flyctl secrets set JWT_SECRET=$(openssl rand -hex 32)
            flyctl deploy
            ;;
        2)
            # Railway
            echo -e "${YELLOW}Deploying to Railway...${NC}"
            
            if ! command -v railway &> /dev/null; then
                echo "Installing Railway CLI..."
                npm install -g @railway/cli
            fi
            
            railway login
            railway init
            railway up
            ;;
        3)
            # DigitalOcean
            echo -e "${YELLOW}Deploying to DigitalOcean...${NC}"
            
            if ! command -v doctl &> /dev/null; then
                echo -e "${RED}Please install doctl first${NC}"
                echo "Visit: https://docs.digitalocean.com/reference/doctl/how-to/install/"
                exit 1
            fi
            
            doctl apps create --spec app.yaml
            ;;
        4)
            # AWS ECS
            echo -e "${YELLOW}Deploying to AWS ECS...${NC}"
            echo "Please use AWS Copilot or ECS CLI"
            echo "Documentation: https://aws.github.io/copilot-cli/"
            ;;
        5)
            # Google Cloud Run
            echo -e "${YELLOW}Deploying to Google Cloud Run...${NC}"
            
            if ! command -v gcloud &> /dev/null; then
                echo -e "${RED}Please install gcloud CLI first${NC}"
                exit 1
            fi
            
            gcloud run deploy clode-relay \
                --source . \
                --platform managed \
                --region us-central1 \
                --allow-unauthenticated
            ;;
    esac
}

# Main menu
main() {
    echo "Deployment Options:"
    echo "1. Local Docker deployment"
    echo "2. Cloud deployment"
    echo "3. Development mode"
    echo "4. Stop services"
    echo "5. View logs"
    echo "6. Update and restart"
    read -p "Choose option (1-6): " choice
    
    case $choice in
        1)
            check_deps
            generate_secrets
            setup_ssl
            deploy_docker
            ;;
        2)
            deploy_cloud
            ;;
        3)
            echo -e "${YELLOW}Starting in development mode...${NC}"
            npm install
            npm run dev
            ;;
        4)
            echo -e "${YELLOW}Stopping services...${NC}"
            docker-compose down
            echo -e "${GREEN}Services stopped${NC}"
            ;;
        5)
            echo -e "${YELLOW}Showing logs...${NC}"
            docker-compose logs -f
            ;;
        6)
            echo -e "${YELLOW}Updating and restarting...${NC}"
            git pull
            docker-compose build
            docker-compose up -d
            echo -e "${GREEN}Services updated and restarted${NC}"
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            exit 1
            ;;
    esac
}

# Run main function
main

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}================================${NC}"