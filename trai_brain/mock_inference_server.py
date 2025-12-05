#!/usr/bin/env python3
"""
MOCK TRAI Server - Returns bullish signals for testing
"""
import sys
import json
import time
import random

print("🧠 MOCK TRAI Server Starting (for paper mode testing)...", file=sys.stderr)
print("✅ Ready for inference requests", file=sys.stderr)
print("⚠️  WARNING: This is a MOCK server - always returns BULLISH for testing", file=sys.stderr)

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break

        request = json.loads(line.strip())

        # Simulate some processing time
        time.sleep(0.1)

        # Always return bullish signal for testing
        response = {
            "decision": "BUY",
            "confidence": 75 + random.randint(0, 20),  # 75-95% confidence
            "reasoning": "MOCK: Strong bullish indicators detected",
            "timestamp": time.time()
        }

        print(json.dumps(response))
        sys.stdout.flush()

    except json.JSONDecodeError:
        error_response = {"error": "Invalid JSON"}
        print(json.dumps(error_response))
        sys.stdout.flush()
    except Exception as e:
        error_response = {"error": str(e)}
        print(json.dumps(error_response))
        sys.stdout.flush()