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

# --- CACHE SETUP ---
class PredictionCache:
    def __init__(self):
        self.last_context = ""
        self.last_full_prediction = ""
        self.lock = threading.Lock()

    def check_cache(self, current_context):
        with self.lock:
            # Check if current_context is just the last_context + some new characters
            if current_context.startswith(self.last_context) and len(current_context) > len(self.last_context):

                # Identify what the user typed since the last request
                added_text = current_context[len(self.last_context):]

                # Check if what they typed matches the start of our previous prediction
                if self.last_full_prediction.startswith(added_text):
                    # HIT: The user is typing what we predicted.
                    # Return the remainder of the prediction without running the GPU.
                    remaining_prediction = self.last_full_prediction[len(added_text):]

                    # Update cache state so we can keep chaining this logic
                    self.last_context = current_context
                    self.last_full_prediction = remaining_prediction

                    return remaining_prediction
        return None

    def update(self, context, prediction):
        with self.lock:
            self.last_context = context
            self.last_full_prediction = prediction

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

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
