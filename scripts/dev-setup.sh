#!/bin/bash

# SimplyCaster Development Setup Script

set -e

echo "🎙️ SimplyCaster Development Setup"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install Docker Compose."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.docker .env
    echo "✅ Created .env file"
else
    echo "📝 .env file already exists"
fi

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
timeout=60
counter=0

while ! docker-compose exec -T db pg_isready -U app -d appdb > /dev/null 2>&1; do
    if [ $counter -ge $timeout ]; then
        echo "❌ Database failed to start within $timeout seconds"
        docker-compose logs db
        exit 1
    fi
    
    echo "   Waiting for database... ($counter/$timeout)"
    sleep 2
    counter=$((counter + 2))
done

echo "✅ Database is ready!"

# Run database migrations
echo "🗄️ Running database migrations..."
if deno task db:migrate; then
    echo "✅ Database migrations completed"
else
    echo "⚠️ Database migrations failed, but continuing..."
fi

# Show service status
echo ""
echo "🚀 SimplyCaster is ready!"
echo "========================"
echo "📱 Application: http://localhost:8000"
echo "🗄️ Database Admin: http://localhost:8080"
echo "📊 Database: localhost:5432 (user: app, db: appdb)"
echo ""
echo "📋 Useful commands:"
echo "   deno task docker:logs    # View logs"
echo "   deno task docker:down    # Stop services"
echo "   deno task db:studio      # Open Drizzle Studio"
echo ""
echo "🎉 Happy coding!"