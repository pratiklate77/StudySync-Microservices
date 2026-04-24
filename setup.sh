#!/bin/bash
# Run this once after cloning the repo.
# Copies .env.example files and sets a shared JWT secret across all services.

set -e

echo "Copying .env files from examples..."
cp identity_service/.env.example identity_service/.env
cp session_service/.env.example session_service/.env
cp group_service/.env.example group_service/.env
cp chat_service/.env.example chat_service/.env

echo "Generating shared JWT secret..."
SECRET=$(openssl rand -hex 32)

sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$SECRET|g" identity_service/.env
sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$SECRET|g" session_service/.env
sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$SECRET|g" group_service/.env
sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$SECRET|g" chat_service/.env

echo ""
echo "Done. All .env files created with matching JWT_SECRET_KEY."
echo "Run: docker-compose up -d --build"
