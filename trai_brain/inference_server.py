#!/usr/bin/env python3
"""
TRAI Persistent Inference Server
Keeps model loaded in GPU memory for fast inference (<2s)
"""

import sys
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class TRAIPersistentServer:
    def __init__(self, model_path=None):
        if model_path is None:
            # Check for local model first, then fallback to HuggingFace
            import os
            local_model = "/opt/ogzprime/trai/model"
            if os.path.exists(local_model):
                model_path = local_model
            else:
                # Fallback to HuggingFace model
                model_path = "mistralai/Mistral-7B-Instruct-v0.3"

        print(f"🧠 Loading TRAI model (one-time load)...", file=sys.stderr)
        print(f"📦 Model: {model_path}", file=sys.stderr)

        # Check CUDA
        if not torch.cuda.is_available():
            print("⚠️ WARNING: CUDA not available, using CPU (SLOW!)", file=sys.stderr)
            self.device = "cpu"
        else:
            self.device = "cuda"
            print(f"⚡ GPU: {torch.cuda.get_device_name(0)}", file=sys.stderr)
            print(f"💾 GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB", file=sys.stderr)

        # Load tokenizer
        print("📝 Loading tokenizer...", file=sys.stderr)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Load model with optimizations
        print("🔥 Loading model into GPU memory...", file=sys.stderr)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16,  # Half precision for speed
            device_map="auto" if self.device == "cuda" else None,
            low_cpu_mem_usage=True
        )

        if self.device == "cpu":
            self.model.to(self.device)

        # Warm up the model (first inference is always slower)
        print("🔥 Warming up model...", file=sys.stderr)
        self._warmup()

        print("✅ TRAI Server Ready! Model loaded in GPU memory.", file=sys.stderr)
        print("📊 Waiting for inference requests on stdin...", file=sys.stderr)

    def _warmup(self):
        """Run a dummy inference to warm up CUDA kernels"""
        try:
            dummy_prompt = "Test"
            inputs = self.tokenizer(dummy_prompt, return_tensors="pt").to(self.device)
            with torch.no_grad():
                self.model.generate(**inputs, max_new_tokens=10)
            print("✅ Warmup complete", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Warmup failed: {e}", file=sys.stderr)

    def generate_response(self, prompt, max_tokens=300):
        """Generate response with model already in GPU memory (FAST!)"""
        try:
            # Add trading-specific system prompt
            system_prompt = """You are TRAI, a trading analysis AI. You analyze cryptocurrency trading signals.
RULES:
- Answer in ONE sentence (max 15 words)
- Focus on the KEY reason only
- Be direct and specific
- Use percentages and numbers when relevant
- Never output code or examples"""

            formatted_prompt = f"{system_prompt}\n\n{prompt}\n\nAnswer:"

            # Tokenize
            inputs = self.tokenizer(formatted_prompt, return_tensors="pt").to(self.device)

            # Generate (this is fast because model is already loaded!)
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=0.7,
                    top_p=0.95,
                    top_k=40,
                    repetition_penalty=1.1,
                    do_sample=True,
                    pad_token_id=self.tokenizer.eos_token_id
                )

            # Decode
            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

            # Remove prompt from response if included
            if response.startswith(prompt):
                response = response[len(prompt):].strip()

            return response

        except Exception as e:
            return f"Error: {str(e)}"

    def run_server(self):
        """
        Run persistent server loop
        Reads JSON from stdin: {"prompt": "...", "max_tokens": 300}
        Writes JSON to stdout: {"response": "...", "error": null}
        """
        print("🚀 Server running, ready for requests", file=sys.stderr)

        for line in sys.stdin:
            try:
                # Parse request
                request = json.loads(line.strip())
                prompt = request.get("prompt", "")
                max_tokens = request.get("max_tokens", 300)

                if not prompt:
                    result = {"response": None, "error": "No prompt provided"}
                else:
                    # Generate response (FAST - model already loaded!)
                    response = self.generate_response(prompt, max_tokens)
                    result = {"response": response, "error": None}

                # Send response
                print(json.dumps(result), flush=True)

            except json.JSONDecodeError as e:
                result = {"response": None, "error": f"Invalid JSON: {str(e)}"}
                print(json.dumps(result), flush=True)

            except Exception as e:
                result = {"response": None, "error": f"Server error: {str(e)}"}
                print(json.dumps(result), flush=True)


if __name__ == "__main__":
    # Start the persistent server
    server = TRAIPersistentServer()
    server.run_server()
