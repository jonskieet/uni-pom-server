#!/bin/bash

# ============================================================
# setup.sh — Automated setup script for development
# ============================================================
# Usage: bash setup.sh

set -e  # Exit on error

echo "🚀 UNI-POM Server Setup"
echo "======================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔧 Setting up Prisma..."
npm run prisma:generate

echo ""
echo "📝 Creating .env file..."
if [ -f .env ]; then
    echo "   ⚠️  .env already exists, skipping..."
else
    cp .env.example .env
    echo "   ✅ .env created. Please edit it with your Supabase credentials"
fi

echo ""
echo "=========================================="
echo "✅ Setup completed!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env with your Supabase DATABASE_URL"
echo "2. Run: npm run prisma:push"
echo "3. Run: npm run dev"
echo ""
echo "API will be available at: http://localhost:5000"
