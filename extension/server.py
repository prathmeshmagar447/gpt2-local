from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import GPT2LMHeadModel, GPT2Tokenizer, StoppingCriteria, StoppingCriteriaList
import torch
import threading
from typing import Optional, Dict, Any

app = FastAPI()

# --- MODEL SETUP ---
model_name = "shibing624/code-autocomplete-gpt2-base"
device = "cuda" if torch.cuda.is_available() else "cpu"
use_quantization = False  # Set to True for 8-bit quantization (requires bitsandbytes)

print(f"Loading model on {device} with quantization={use_quantization}...")
tokenizer = GPT2Tokenizer.from_pretrained(model_name)

if use_quantization and device == "cuda":
    try:
        from transformers import BitsAndBytesConfig
        quantization_config = BitsAndBytesConfig(
            load_in_8bit=True,
            llm_int8_enable_fp32_cpu_offload=True
        )
        model = GPT2LMHeadModel.from_pretrained(
            model_name,
            quantization_config=quantization_config,
            device_map="auto"
        )
        print("Model loaded with 8-bit quantization.")
    except ImportError:
        print("bitsandbytes not installed. Falling back to standard loading.")
        model = GPT2LMHeadModel.from_pretrained(model_name).to(device)
        print("Model loaded (standard).")
else:
    model = GPT2LMHeadModel.from_pretrained(model_name).to(device)
    print("Model loaded (standard).")

# --- CACHE SETUP ---
import hashlib
from time import time

class CacheEntry:
    def __init__(self, context: str, prediction: str) -> None:
        self.context_hash: str = hashlib.md5(context.encode()).hexdigest()
        self.context: str = context
        self.prediction: str = prediction
        self.timestamp: float = time()

class PredictionCache:
    def __init__(self, ttl_seconds: int = 300) -> None:  # 5 minutes TTL
        self.cache: Dict[str, CacheEntry] = {}
        self.lock: threading.Lock = threading.Lock()
        self.ttl: int = ttl_seconds

    def check_cache(self, current_context: str) -> Optional[str]:
        with self.lock:
            current_hash: str = hashlib.md5(current_context.encode()).hexdigest()

            # Check for exact match
            if current_hash in self.cache:
                entry = self.cache[current_hash]
                if time() - entry.timestamp < self.ttl:
                    print("Cache Hit! Exact match ⚡")
                    return entry.prediction

            # Check for prefix match (user typing continuation)
            for entry in self.cache.values():
                if time() - entry.timestamp >= self.ttl:
                    continue  # Expired

                if current_context.startswith(entry.context) and len(current_context) > len(entry.context):
                    added_text: str = current_context[len(entry.context):]
                    if entry.prediction.startswith(added_text):
                        remaining_prediction: str = entry.prediction[len(added_text):]
                        # Create new cache entry for current state
                        new_entry = CacheEntry(current_context, remaining_prediction)
                        self.cache[new_entry.context_hash] = new_entry
                        print("Cache Hit! Prefix match ⚡")
                        return remaining_prediction

        return None

    def update(self, context: str, prediction: str) -> None:
        with self.lock:
            entry = CacheEntry(context, prediction)
            self.cache[entry.context_hash] = entry

            # Clean up expired entries
            current_time = time()
            expired_keys = [k for k, v in self.cache.items() if current_time - v.timestamp >= self.ttl]
            for k in expired_keys:
                del self.cache[k]

cache = PredictionCache()

# --- STOPPING CRITERIA ---
newline_token_id: int = tokenizer.encode("\n")[0]
class StopOnNewLine(StoppingCriteria):
    def __init__(self, stop_token_id: int) -> None:
        self.stop_token_id: int = stop_token_id
    def __call__(self, input_ids: torch.Tensor, scores: torch.Tensor, **kwargs: Any) -> bool:
        return input_ids[0, -1] == self.stop_token_id

stopping_criteria = StoppingCriteriaList([StopOnNewLine(newline_token_id)])

class CompletionRequest(BaseModel):
    code_context: str
    multiline: bool = False
    model_name: Optional[str] = None  # Allow dynamic model switching

@app.post("/predict")
async def predict(req: CompletionRequest) -> Dict[str, Any]:
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
        max_tokens = 64 if req.multiline else 20

        with torch.no_grad():
            outputs = model.generate(
                input_ids,
                max_new_tokens=max_tokens,

                # --- STRICT SETTINGS ---
                temperature=0.1,        # <--- LOWER THIS (Default 1.0). 0.1 makes it very strict.
                top_p=0.95,             # <--- Cut off low-probability nonsense.
                top_k=50,               # <--- Only consider the top 50 likely words.
                repetition_penalty=1.0, # <--- KEEP 1.0. High penalty ruins code (prevents repeating 'self', 'def', etc)
                do_sample=True,

                pad_token_id=tokenizer.eos_token_id,
                stopping_criteria=criteria
            )

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        completion = generated_text[len(req.code_context):]

        if not req.multiline:
            completion = completion.split('\n')[0]

        # 3. UPDATE CACHE
        cache.update(req.code_context, completion)

        return {"completion": completion}

    except torch.cuda.OutOfMemoryError:
        print("Error: GPU out of memory. Consider using CPU or a smaller model.")
        raise HTTPException(status_code=507, detail="GPU out of memory. Try switching to CPU mode.")
    except ValueError as e:
        print(f"Value error during inference: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        print(f"Unexpected error during prediction: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during prediction.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
