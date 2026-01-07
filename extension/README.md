# GPT-2 Code Autocomplete (Local Copilot)

A local, privacy-focused AI code completion extension for VS Code. This tool mimics the "Ghost Text" experience of GitHub Copilot but runs entirely on your local machine using the `shibing624/code-autocomplete-gpt2-base` model.

## 🚀 Features

* **Ghost Text UI:** Renders suggestions inline (grey text) rather than a dropdown menu.
* **Privacy First:** No code leaves your machine. All inference happens locally.
* **Smart Caching:** Implements a "Prefix Cache" in the backend. If you type `imp` -> `impo` -> `impor`, the backend serves the cached prediction instantly without re-running the GPU.
* **Optimized Inference:** Uses `StoppingCriteria` to halt generation immediately at newlines, reducing GPU load by ~80% for single-line completions.
* **Debouncing & Cancellation:** Automatically cancels stale API requests when you type fast to prevent server overload.

---

## 🛠️ Architecture

The project consists of two parts:

1. **Python Backend (`server.py`):** A FastAPI server that loads the GPT-2 model and handles inference requests.
2. **VS Code Extension (`src/extension.ts`):** The client that captures your cursor position, sends text to the backend, and renders the result.

---

## 📦 Installation & Setup

### Part 1: The Python Backend

1. **Prerequisites:** Python 3.8+ installed.
2. **Install Dependencies:**
```bash
pip install fastapi uvicorn transformers torch
```

*(Note: If you have an NVIDIA GPU, ensure you install the CUDA version of PyTorch for faster inference.)*
3. **Run the Server:**
Save the provided backend code as `server.py` and run:
```bash
python server.py
```

*You should see: `Model loaded on cuda` (or cpu) and the server running on `http://127.0.0.1:8000`.*

### Part 2: The VS Code Extension

1. **Prerequisites:** Node.js and npm installed.
2. **Install Dependencies:**
Navigate to your extension folder (where `package.json` is) and run:
```bash
npm install
```

3. **Build & Run:**
* Open the project folder in VS Code.
* Press **F5**. This will open a new "Extension Development Host" window with your extension loaded.

### Part 3: Packaging for Distribution (Optional)

To create a distributable `.vsix` file:

1. **Install VSCE:**
```bash
npm install -g @vscode/vsce
```

2. **Update package.json:**
Add these required fields to your `extension/package.json`:
```json
{
  "publisher": "your-name",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/gpt2-local"
  }
}
```

3. **Package:**
```bash
cd extension
vsce package
```

4. **Install:**
In VS Code: Extensions → Install from VSIX... → Select the generated `.vsix` file

*Note: The packaged extension requires the Python server to be running separately.*

---

## 🎮 Usage

1. Ensure the Python server is running in a terminal.
2. In the VS Code Extension window (the one that opened after pressing F5), create a new file (e.g., `test.py`).
3. Start typing code. For example:
```python
def calculate_area(radius):
```

4. Wait a split second (300ms debounce). You will see **grey ghost text** appear.
5. Press **`Tab`** to accept the suggestion.

---

## ⚙️ Configuration (Advanced)

### GPU vs CPU

The `server.py` script automatically detects if CUDA is available.

* **GPU:** Response time ~50-100ms.
* **CPU:** Response time ~300ms-1s (depending on hardware).

### Adjusting Strictness

In `server.py`, modify the `temperature` parameter inside `predict()`:

* `0.1 - 0.2`: Very strict, deterministic code (Recommended).
* `0.5+`: More creative, but higher risk of syntax errors.

---

## 🐛 Troubleshooting

| Issue | Solution |
| --- | --- |
| **No suggestions appear** | Check if `server.py` is running. Check VS Code "Output" tab -> select "Log (Extension Host)" to see if there are connection errors. |
| **Server crashes with OOM** | Your GPU might be out of memory. Try forcing CPU mode by setting `device = "cpu"` in `server.py`. |
| **Suggestions are too long** | The `StoppingCriteria` logic handles this. Ensure `multiline` is set to `False` in the request (default). |

---

## 📜 License

MIT
