import sys
import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class TRAIInference:
    def __init__(self, model_path=None):
        if model_path is None:
            # Use HuggingFace model path
            model_path = "deepseek-ai/deepseek-coder-6.7b-instruct"

        print(f"🧠 Loading TRAI brain from {model_path}...", file=sys.stderr)
        print(f"🎮 Model: {model_path}", file=sys.stderr)

        # Check for CUDA availability
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"⚡ Using device: {device}", file=sys.stderr)

        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16,
            device_map="auto" if device == "cuda" else None
        )
        if device == "cpu":
            self.model.to(device)

        print("✅ TRAI brain loaded and ready!", file=sys.stderr)

    def generate_response(self, prompt):
        try:
            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=300,
                temperature=0.7,
                top_p=0.95,
                top_k=40,
                repetition_penalty=1.1,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id
            )

            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            # Remove the prompt from response if it's included
            if response.startswith(prompt):
                response = response[len(prompt):].strip()

            return response
        except Exception as e:
            return f"Error generating response: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inference.py 'prompt'")
        sys.exit(1)

    prompt = sys.argv[1]
    inference = TRAIInference()
    response = inference.generate_response(prompt)
    print(response)
