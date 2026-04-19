#!/usr/bin/env bash
# Quick setup script for new machines cloning HackHelix
# Run this after `git clone` to generate training data and train the LSTM

set -e

echo "[setup] Installing backend dependencies..."
cd backend
python -m venv .venv
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
pip install -r requirements.txt --quiet

echo "[setup] Installing frontend dependencies..."
cd ../frontend
npm install

echo "[setup] Generating synthetic training data (43 signs × 50 sequences)..."
cd ../datasets
python generate_synthetic_poses.py

echo "[setup] Training LSTM (this takes ~5-10 minutes)..."
python train_lstm.py --epochs 60

echo "[setup] Done! Start the servers:"
echo "  Backend:  cd backend && .venv/Scripts/python -m uvicorn src.main:app --port 8000"
echo "  Frontend: cd frontend && npm run dev"
