#!/usr/bin/env python3
"""
TRAI Persistent Inference Server - GGUF Version for Mistral
Keeps model loaded in GPU memory for fast inference (<2s)
"""

import sys
import json
import os

# Check if llama-cpp-python is installed
try:
    from llama_cpp import Llama
except ImportError:
    print("ERROR: llama-cpp-python not installed!", file=sys.stderr)
    print("Run: pip install llama-cpp-python", file=sys.stderr)
    sys.exit(1)

class TRAIPersistentServer:
    def __init__(self, model_path=None):
        if model_path is None:
            # Use the Mistral model specifically
            model_path = "/opt/ogzprime/trai/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf"
            if not os.path.exists(model_path):
                print(f"ERROR: Model not found at {model_path}", file=sys.stderr)
                sys.exit(1)

        print(f"🧠 Loading TRAI model (one-time load)...", file=sys.stderr)
        print(f"📦 Model path: {model_path}", file=sys.stderr)

        # Try GPU first, fall back to CPU if CUDA libraries unavailable
        try:
            print("🎯 Attempting GPU acceleration...", file=sys.stderr)
            self.model = Llama(
                model_path=model_path,
                n_gpu_layers=-1,  # Load all layers to GPU
                n_ctx=2048,       # Context window
                n_batch=512,      # Batch size
                verbose=False,
                seed=42           # For reproducibility
            )
            print("✅ TRAI Server Ready! Model loaded in GPU memory (A100).", file=sys.stderr)
        except Exception as gpu_error:
            print(f"⚠️  GPU loading failed: {gpu_error}", file=sys.stderr)
            print("🔄 Falling back to CPU inference...", file=sys.stderr)
            try:
                self.model = Llama(
                    model_path=model_path,
                    n_gpu_layers=0,   # CPU only
                    n_ctx=2048,
                    n_batch=512,
                    verbose=False,
                    seed=42
                )
                print("✅ TRAI Server Ready! Model loaded in CPU memory (slower but functional).", file=sys.stderr)
            except Exception as cpu_error:
                print(f"❌ ERROR: Failed to load model on CPU: {cpu_error}", file=sys.stderr)
                sys.exit(1)

        # System prompt for trading - STRICT AND CONCISE
        self.system_prompt = """You are TRAI, an expert cryptocurrency trading AI.
CRITICAL RULES:
1. ALWAYS respond in ONE sentence (maximum 15 words)
2. Focus on the SINGLE most important factor
3. Use specific numbers and percentages
4. Be decisive - say BUY, SELL, or HOLD clearly
5. NEVER output code, examples, or explanations
6. Only analyze the trading opportunity presented

Good responses:
- "BUY: RSI oversold at 25 with bullish divergence forming."
- "HOLD: Weak 45% confidence, wait for stronger setup."
- "SELL: Overbought RSI 78 with declining volume confirms reversal."
"""

    def run(self):
        """Main loop - read prompts from stdin, write responses to stdout"""
        print("📊 Waiting for inference requests on stdin...", file=sys.stderr)
        print("🚀 Server running, ready for requests", file=sys.stderr)

        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break

                request = json.loads(line)
                prompt = request.get('prompt', '')

                # Format with system prompt - Mistral format
                full_prompt = f"<s>[INST] {self.system_prompt}\n\n{prompt} [/INST]"

                # Generate response - VERY constrained for short answers
                response = self.model(
                    full_prompt,
                    max_tokens=30,        # Very short responses only
                    temperature=0.3,      # Lower temp for more focused answers
                    top_p=0.9,           # Slightly focused sampling
                    stop=["[INST]", "</s>", "\n\n", "User:", "Assistant:"],
                    echo=False           # Don't include prompt in response
                )

                # Extract just the text response
                response_text = response['choices'][0]['text'].strip()

                # Clean up any remaining formatting
                response_text = response_text.replace("</s>", "").strip()

                result = {
                    'response': response_text,
                    'status': 'success'
                }

                print(json.dumps(result))
                sys.stdout.flush()

            except json.JSONDecodeError as e:
                error_result = {
                    'response': "Invalid JSON input",
                    'status': 'error'
                }
                print(json.dumps(error_result))
                sys.stdout.flush()
            except Exception as e:
                error_result = {
                    'response': f"Error: {str(e)}",
                    'status': 'error'
                }
                print(json.dumps(error_result))
                sys.stdout.flush()

if __name__ == "__main__":
    server = TRAIPersistentServer()
    server.run()