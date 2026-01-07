from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import GPT2LMHeadModel, GPT2Tokenizer, StoppingCriteria, StoppingCriteriaList
import torch
import threading
from typing import Optional, Dict, Any

app = FastAPI()

# --- MULTI-MODEL MANAGER ---
class ModelManager:
    def __init__(self):
        self.models = {}
        self.tokenizers = {}
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def load_model(self, model_name: str, use_quantization: bool = False) -> tuple:
        if model_name in self.models:
            print(f"Using cached model: {model_name}")
            return self.models[model_name], self.tokenizers[model_name]

        print(f"Downloading and loading model: {model_name} on {self.device}...")

        try:
            # Load tokenizer
            tokenizer = GPT2Tokenizer.from_pretrained(model_name)

            # Load model with optional quantization
            if use_quantization and self.device == "cuda":
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
                    print(f"Model {model_name} loaded with 8-bit quantization.")
                except ImportError:
                    print("bitsandbytes not available. Loading standard model.")
                    model = GPT2LMHeadModel.from_pretrained(model_name).to(self.device)
            else:
                model = GPT2LMHeadModel.from_pretrained(model_name).to(self.device)
                print(f"Model {model_name} loaded (standard).")

            # Cache the model
            self.models[model_name] = model
            self.tokenizers[model_name] = tokenizer

            return model, tokenizer

        except Exception as e:
            print(f"Failed to load model {model_name}: {e}")
            raise

    def get_available_models(self) -> list:
        return [
            {
                "name": "shibing624/code-autocomplete-gpt2-base",
                "description": "GPT-2 fine-tuned for code completion (Recommended)",
                "size": "117M parameters",
                "best_for": "General code completion"
            },
            {
                "name": "Salesforce/codegen-350M-mono",
                "description": "CodeGen model trained on Python code",
                "size": "350M parameters",
                "best_for": "Python-focused completion"
            },
            {
                "name": "Salesforce/codegen-2B-mono",
                "description": "Larger CodeGen model for better quality",
                "size": "2B parameters",
                "best_for": "High-quality completion (requires more RAM)"
            },
            {
                "name": "bigcode/gpt_bigcode-santacoder",
                "description": "SantaCoder from BigCode project",
                "size": "1.1B parameters",
                "best_for": "Multi-language code completion"
            },
            {
                "name": "distilgpt2",
                "description": "Lightweight distilled GPT-2",
                "size": "82M parameters",
                "best_for": "Fast completion on limited hardware"
            },
            {
                "name": "microsoft/DialoGPT-medium",
                "description": "Dialog-optimized GPT-2",
                "size": "345M parameters",
                "best_for": "Conversational code patterns"
            }
        ]

# Initialize model manager
model_manager = ModelManager()

# Default model setup
default_model_name = "shibing624/code-autocomplete-gpt2-base"
current_model_name = default_model_name
model, tokenizer = model_manager.load_model(default_model_name, False)

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

@app.get("/models")
async def get_available_models() -> Dict[str, Any]:
    """Get list of available models"""
    return {
        "models": model_manager.get_available_models(),
        "current_default": default_model_name,
        "device": model_manager.device
    }

@app.post("/predict")
async def predict(req: CompletionRequest) -> Dict[str, Any]:
    global model, tokenizer, current_model_name  # Allow switching models

    try:
        # Determine which model to use
        requested_model = req.model_name or default_model_name

        # Load/switch model if different from current
        if requested_model != current_model_name:
            print(f"Switching to model: {requested_model}")
            model, tokenizer = model_manager.load_model(requested_model, False)
            current_model_name = requested_model
            # Update stopping criteria for new tokenizer
            newline_token_id = tokenizer.encode("\n")[0]
            stopping_criteria = StoppingCriteriaList([StopOnNewLine(newline_token_id)])

        # 1. CHECK CACHE FIRST (model-specific cache would be better but simplified for now)
        cached_result = cache.check_cache(req.code_context)
        if cached_result is not None:
            print("Cache Hit! ⚡")
            return {"completion": cached_result}

        # 2. RUN INFERENCE (If cache miss)
        print(f"Cache Miss - Running inference with {requested_model}...")
        input_ids = tokenizer.encode(req.code_context, return_tensors='pt').to(model_manager.device)

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
