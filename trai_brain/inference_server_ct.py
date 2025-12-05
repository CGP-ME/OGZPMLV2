#!/usr/bin/env python3
"""
TRAI Persistent Inference Server - CTransformers Version
"""
import sys
import json
import os
from ctransformers import AutoModelForCausalLM

model_path = "/opt/ogzprime/trai/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf"
print(f"🧠 Loading TRAI model with CTransformers...", file=sys.stderr)
print(f"📦 Model: {model_path}", file=sys.stderr)

model = AutoModelForCausalLM.from_pretrained(
    model_path,
    model_type="mistral",
    gpu_layers=0,  # CPU only for now
    context_length=2048,
    threads=8
)

print("✅ TRAI Server Ready! Model loaded in memory.", file=sys.stderr)
print("🎯 Waiting for inference requests...", file=sys.stderr)

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break

        request = json.loads(line.strip())
        market_data = request.get("market_data", {})

        # Build prompt for market decision
        prompt = f"""<s>[INST] You are a trading AI. Analyze this market data and give a trading decision.

Market Data:
- Price: ${market_data.get('price', 0)}
- RSI: {market_data.get('rsi', 50)}
- Trend: {market_data.get('trend', 'neutral')}
- Volume: {market_data.get('volume', 0)}
- Volatility: {market_data.get('volatility', 0)}

Respond with ONLY one word: BUY, SELL, or HOLD [/INST]"""

        # Get model response
        response_text = model(prompt, max_new_tokens=10, temperature=0.1)

        # Parse decision
        decision = "HOLD"
        confidence = 50

        if "BUY" in response_text.upper():
            decision = "BUY"
            confidence = 85
        elif "SELL" in response_text.upper():
            decision = "SELL"
            confidence = 85

        response = {
            "decision": decision,
            "confidence": confidence,
            "reasoning": response_text.strip(),
            "timestamp": request.get("timestamp", 0)
        }

        print(json.dumps(response))
        sys.stdout.flush()

    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error), file=sys.stderr)
        sys.stderr.flush()