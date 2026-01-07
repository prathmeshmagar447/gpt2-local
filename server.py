from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import GPT2LMHeadModel, GPT2Tokenizer, StoppingCriteria, StoppingCriteriaList
import torch
import threading

app = FastAPI()

# --- MODEL SETUP ---
model_name = "shibing624/code-autocomplete-gpt2-base"
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading model on {device}...")
tokenizer = GPT2Tokenizer.from_pretrained(model_name)
model = GPT2LMHeadModel.from_pretrained(model_name).to(device)
print("Model loaded.")

# --- ENHANCED CACHE SETUP ---
class PredictionCache:
    def __init__(self):
        self.cache = {}  # context -> prediction
        self.lock = threading.Lock()
        self.max_cache_size = 100  # Limit cache size

    def check_cache(self, current_context):
        with self.lock:
            # Direct match
            if current_context in self.cache:
                print("Cache Hit! Direct match ⚡")
                return self.cache[current_context]

            # Prefix match - find the longest prefix that matches
            for cached_context in sorted(self.cache.keys(), key=len, reverse=True):
                if current_context.startswith(cached_context):
                    prediction = self.cache[cached_context]
                    # Check if the prediction continues with what the user typed
                    added_text = current_context[len(cached_context):]
                    if prediction.startswith(added_text):
                        remaining = prediction[len(added_text):]
                        print(f"Cache Hit! Prefix match ({len(cached_context)} chars) ⚡")
                        return remaining

            return None

    def update(self, context, prediction):
        with self.lock:
            # Clean up old entries if cache is too large
            if len(self.cache) >= self.max_cache_size:
                # Remove oldest entries (simple FIFO)
                oldest_keys = list(self.cache.keys())[:20]  # Remove 20 oldest
                for key in oldest_keys:
                    del self.cache[key]

            self.cache[context] = prediction

cache = PredictionCache()

# --- STOPPING CRITERIA ---
newline_token_id = tokenizer.encode("\n")[0]
class StopOnNewLine(StoppingCriteria):
    def __init__(self, stop_token_id):
        self.stop_token_id = stop_token_id
    def __call__(self, input_ids, scores, **kwargs):
        return input_ids[0, -1] == self.stop_token_id

stopping_criteria = StoppingCriteriaList([StopOnNewLine(newline_token_id)])

class CompletionRequest(BaseModel):
    code_context: str
    multiline: bool = False
    model_name: str = "shibing624/code-autocomplete-gpt2-base"

class ChatRequest(BaseModel):
    message: str
    context: str = ""

@app.post("/predict")
async def predict(req: CompletionRequest):
    try:
        # 1. CHECK CACHE FIRST
        cached_result = cache.check_cache(req.code_context)
        if cached_result is not None:
            print("Cache Hit! ⚡")
            return {"completion": cached_result}

        # 2. RUN INFERENCE (If cache miss)
        print("Cache Miss - Running GPU...")
        input_ids = tokenizer.encode(req.code_context, return_tensors='pt').to(device)

        criteria = stopping_criteria if not req.multiline else None
        max_tokens = 64 if req.multiline else 15  # Reduced from 20 to 15 for faster single-line completions

        with torch.no_grad():
            outputs = model.generate(
                input_ids,
                max_new_tokens=max_tokens,

                # --- OPTIMIZED SETTINGS FOR SPEED ---
                temperature=0.05,       # <--- Even lower for faster, more deterministic completions
                top_p=0.9,              # <--- Slightly lower for faster convergence
                top_k=40,               # <--- Reduced from 50 for faster processing
                repetition_penalty=1.0, # <--- KEEP 1.0. High penalty ruins code (prevents repeating 'self', 'def', etc)
                do_sample=True,

                pad_token_id=tokenizer.eos_token_id,
                stopping_criteria=criteria,
                # --- PERFORMANCE OPTIMIZATIONS ---
                use_cache=True,         # Enable KV cache for faster generation
                num_beams=1,            # Greedy decoding (no beam search for speed)
            )

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        completion = generated_text[len(req.code_context):]

        if not req.multiline:
            completion = completion.split('\n')[0]

        # 3. UPDATE CACHE
        cache.update(req.code_context, completion)

        return {"completion": completion}

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def get_models():
    """Return available models with metadata"""
    return {
        "models": [
            {
                "name": "shibing624/code-autocomplete-gpt2-base",
                "size": "~493MB",
                "description": "Fine-tuned GPT-2 model optimized for code completion",
                "best_for": "General code completion",
                "performance": "Fast",
                "quality": "Good"
            },
            {
                "name": "microsoft/DialoGPT-small",
                "size": "~117MB",
                "description": "Lightweight conversational model",
                "best_for": "Simple completions",
                "performance": "Very Fast",
                "quality": "Basic"
            },
            {
                "name": "distilgpt2",
                "size": "~353MB",
                "description": "Distilled GPT-2 model for faster inference",
                "best_for": "Balanced performance",
                "performance": "Fast",
                "quality": "Good"
            }
        ]
    }

@app.post("/warmup")
async def warmup():
    """Warm up the model with a test inference"""
    try:
        test_input = "def hello"
        input_ids = tokenizer.encode(test_input, return_tensors='pt').to(device)

        with torch.no_grad():
            _ = model.generate(
                input_ids,
                max_new_tokens=5,
                temperature=0.1,
                top_p=0.9,
                top_k=40,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
                use_cache=True
            )

        return {"status": "warmed_up", "message": "Model warmed up successfully"}

    except Exception as e:
        print(f"Warmup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(req: ChatRequest):
    """Handle chat messages with conversational AI"""
    try:
        # Create a conversational prompt
        system_prompt = "You are a helpful AI coding assistant. Provide clear, concise answers about programming, code explanation, debugging, and software development. Be friendly and professional."

        # Include code context if available
        context_part = ""
        if req.context.strip():
            context_part = f"\n\nCode context:\n{req.context}\n\n"

        full_prompt = f"{system_prompt}{context_part}\nUser: {req.message}\nAssistant:"

        input_ids = tokenizer.encode(full_prompt, return_tensors='pt').to(device)

        with torch.no_grad():
            outputs = model.generate(
                input_ids,
                max_new_tokens=150,  # Longer responses for chat
                temperature=0.7,     # More creative for conversational responses
                top_p=0.95,
                top_k=50,
                repetition_penalty=1.1,  # Slight penalty to avoid repetition
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
                use_cache=True,
                num_beams=1,
                # Stop on common conversation endings
                stopping_criteria=StoppingCriteriaList([
                    StopOnTokens(tokenizer, ["\nUser:", "\n\n", "###"])
                ])
            )

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        response = generated_text[len(full_prompt):].strip()

        # Clean up the response
        response = response.split('\nUser:')[0].split('\n\n')[0].strip()

        if not response:
            response = "I understand your question. Could you please provide more details or clarify what you'd like help with?"

        return {"response": response}

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class StopOnTokens(StoppingCriteria):
    def __init__(self, tokenizer, stop_tokens):
        self.tokenizer = tokenizer
        self.stop_tokens = stop_tokens

    def __call__(self, input_ids, scores, **kwargs):
        decoded = self.tokenizer.decode(input_ids[0], skip_special_tokens=True)
        for stop_token in self.stop_tokens:
            if stop_token in decoded:
                return True
        return False

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
