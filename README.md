# 🤖 GPT-2 Local Copilot

<div align="center">

**Privacy-First AI Code Completion for VS Code**

[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/prathmeshmagar447/gpt2-local)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS_Code-Extension-purple?logo=visual-studio-code)](https://marketplace.visualstudio.com/)

*Local AI-powered code completion that runs entirely on your machine. No data leaves your computer.*

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-documentation) • [🔧 Installation](#-installation) • [❓ FAQ](#-faq)

</div>

---

## ✨ **What is GPT-2 Local Copilot?**

GPT-2 Local Copilot is a **privacy-focused** alternative to GitHub Copilot that brings AI-powered code completion to your local development environment. Unlike cloud-based solutions, this extension:

- 🔒 **Never sends your code to external servers**
- ⚡ **Runs inference locally** using GPT-2 with advanced caching and quantization
- 🎯 **Provides instant ghost text suggestions** similar to GitHub Copilot
- 🚀 **Enterprise-grade features** with undo, history, and real-time metrics
- 🔧 **Highly configurable** AI parameters and multi-model support
- 💰 **Completely free** and open source

## 🚀 **Key Features**

### 🎨 **Ghost Text Interface**
- Inline code suggestions that appear as you type
- Seamless integration with VS Code's native completion UI
- Press `Tab` to accept suggestions instantly

### 🧠 **Advanced AI Engine**
- **6 Specialized Models**: From lightweight 82M to powerful 2B parameter models
- **Automatic Downloading**: Models download on first use, cached locally for offline use
- **Smart Model Selection**: Choose based on hardware, speed vs quality preferences
- **Dynamic Switching**: Change models instantly via command palette or settings
- **Configurable Parameters**: Temperature, top-p, top-k, max tokens via settings
- **8-bit Quantization**: Memory optimization with `bitsandbytes` support
- **Smart Caching**: Model-aware caching for optimal performance
- **Context Awareness**: Analyzes surrounding code for intelligent suggestions

### ⚡ **Enterprise Performance**
- **Hash-based Caching**: Advanced caching with TTL for optimal performance
- **Prefix Matching**: Instant suggestions for consecutive typing (0ms latency)
- **Debouncing**: 300ms delay prevents server overload during fast typing
- **GPU Acceleration**: Automatic CUDA detection with CPU fallback
- **Request Cancellation**: Cancels stale requests when typing quickly

### 🔧 **Professional Developer Experience**
- **Enhanced Status Bar**: Real-time cache hit rates and response times
- **Undo/History System**: Undo last completion and view history (50 entries)
- **Language-Specific Detection**: Optimized multiline detection for Python, JS/TS, Java, C/C++
- **Automatic Server Management**: Extension starts/stops Python backend automatically
- **Cross-Platform Robustness**: Intelligent Python environment detection
- **Comprehensive Logging**: Configurable privacy-focused logging (error/warn/info/debug)

### 🔒 **Privacy & Security**
- **Zero Data Transmission**: All processing happens locally
- **Configurable Logging**: Control what gets logged for maximum privacy
- **Security Audits**: Automated weekly vulnerability scanning
- **Dependency Management**: Automated updates and security checks

---

## 🏗️ **Architecture**

```
┌─────────────────┐    HTTP     ┌──────────────────────┐
│   VS Code       │────────────▶│   FastAPI Server     │
│   Extension     │             │   (Python Backend)   │
│                 │◀────────────│                      │
└─────────────────┘    JSON     └──────────────────────┘
         │                                       │
         │                                       ▼
         │                            ┌──────────────────────┐
         │                            │   GPT-2 Model       │
         │                            │   (Local Inference) │
         │                            └──────────────────────┘
         ▼
┌─────────────────┐
│   Ghost Text    │
│   Suggestions   │
└─────────────────┘
```

**Two-Component Architecture:**
1. **VS Code Extension** (`extension/`): TypeScript client that captures typing and renders suggestions
2. **Python Backend** (`server.py`): FastAPI server handling AI inference with the GPT-2 model

---

## 📦 **Installation**

### **Prerequisites**
- **Python 3.8+** with pip
- **Node.js 16+** with npm
- **VS Code 1.80+**
- **Optional**: NVIDIA GPU with CUDA for faster inference

### **One-Command Setup**

```bash
# Clone the repository
git clone https://github.com/prathmeshmagar447/gpt2-local.git
cd gpt2-local

# Install Python dependencies
pip install fastapi uvicorn transformers torch

# Install VS Code extension dependencies
cd extension
npm install

# Start development
code .  # Open in VS Code
# Press F5 to launch Extension Development Host
```

### **Manual Installation Steps**

#### **Step 1: Backend Setup**
```bash
# Install Python dependencies
pip install fastapi uvicorn transformers torch

# For GPU acceleration (optional)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

#### **Step 2: Extension Setup**
```bash
# Navigate to extension directory
cd extension

# Install Node.js dependencies
npm install

# Compile TypeScript
npm run compile
```

#### **Step 3: Development Mode**
```bash
# Open project in VS Code
code .

# Press F5 to launch Extension Development Host
# This opens a new VS Code window with the extension loaded
```

#### **Step 4: Packaging (Optional)**
```bash
# Install VS Code Extension Manager
npm install -g @vscode/vsce

# Package the extension
cd extension
vsce package

# Install locally
code --install-extension gpt2-local-autocomplete-0.0.1.vsix
```

---

## 🎮 **Usage**

### **Basic Usage**
1. **Start the Extension**: Press `F5` in VS Code to open Extension Development Host
2. **Start Coding**: Open any file (Python, JavaScript, etc.)
3. **Type Code**: Start typing and wait for ghost text to appear
4. **Accept Suggestions**: Press `Tab` to accept the suggestion

### **Example**
```python
# Type this:
def calculate_

# You'll see ghost text suggestion:
def calculate_area(radius):
    return 3.14159 * radius ** 2
```

### **Status Bar Control**
- **🟢 GPT-2: ON**: Extension is active
- **🔴 GPT-2: OFF**: Extension is disabled
- **Click** the status bar item to toggle on/off

### **Language Support**
Currently optimized for:
- ✅ **Python** (primary focus)
- ✅ **JavaScript/TypeScript**
- ✅ **General programming languages**

---

## ⚙️ **Configuration**

### **Server Configuration**
Edit `server.py` to customize AI behavior:

```python
# Strict mode settings (recommended)
temperature=0.1,        # Lower = more deterministic
top_p=0.95,             # Nucleus sampling
top_k=50,               # Top-k sampling
repetition_penalty=1.0  # Prevent repetition
```

### **Extension Configuration**
Access via VS Code Settings (`Ctrl/Cmd + ,`) or use `GPT-2: Open Settings` command:

```json
{
  "codeCompletion.serverUrl": "http://127.0.0.1:8000",
  "codeCompletion.temperature": 0.1,
  "codeCompletion.topP": 0.95,
  "codeCompletion.topK": 50,
  "codeCompletion.maxTokens": 64,
  "codeCompletion.modelName": "shibing624/code-autocomplete-gpt2-base",
  "codeCompletion.useQuantization": false,
  "codeCompletion.logLevel": "info"
}
```

### **Available Commands**
- `GPT-2: Toggle` - Enable/disable the extension
- `GPT-2: Switch Model` - Select and switch between different AI models
- `GPT-2: Benchmark Models` - Test all models and compare performance
- `GPT-2: Manage Models` - Visual model management interface
- `GPT-2: Undo Last` - Undo the last accepted completion
- `GPT-2: Show History` - View recent completion history
- `GPT-2: Show Stats` - Display performance metrics
- `GPT-2: Open Settings` - Open extension settings
- `GPT-2: Export Settings` - Backup current configuration
- `GPT-2: Import Settings` - Restore configuration from file
- `GPT-2: Show Completion Statistics` - View detailed usage analytics and performance metrics

### **Available Models**

| Model | Size | Best For | Description |
|-------|------|----------|-------------|
| **shibing624/code-autocomplete-gpt2-base** | 117M | General code completion | Default model, fine-tuned for code completion |
| **Salesforce/codegen-350M-mono** | 350M | Python-focused | CodeGen model trained specifically on Python code |
| **Salesforce/codegen-2B-mono** | 2B | High-quality completion | Larger CodeGen model for superior quality (requires more RAM) |
| **bigcode/gpt_bigcode-santacoder** | 1.1B | Multi-language | SantaCoder from BigCode project, supports multiple languages |
| **distilgpt2** | 82M | Fast completion | Lightweight distilled model for limited hardware |
| **microsoft/DialoGPT-medium** | 345M | Conversational patterns | Dialog-optimized model for conversational code patterns |

**Model Selection Guide:**
- 🏃 **Speed Priority**: Use `distilgpt2` (82M) for fastest completion
- ⚖️ **Balanced**: Use `shibing624/code-autocomplete-gpt2-base` (117M) for general use
- 🐍 **Python Focus**: Use `Salesforce/codegen-350M-mono` (350M) for Python development
- 🌟 **Best Quality**: Use `Salesforce/codegen-2B-mono` (2B) for highest quality (requires powerful GPU)
- 🌍 **Multi-Language**: Use `bigcode/gpt_bigcode-santacoder` (1.1B) for various programming languages

### **Performance Tuning**

| Hardware | Response Time | Memory Usage |
|----------|---------------|--------------|
| **GPU (RTX 30xx)** | ~50-100ms | ~2GB VRAM |
| **GPU (RTX 20xx)** | ~100-200ms | ~2GB VRAM |
| **CPU (M1/M2)** | ~200-500ms | ~1GB RAM |
| **CPU (Intel i7)** | ~300-800ms | ~1GB RAM |

---

## 🔧 **Troubleshooting**

### **Common Issues**

| Problem | Solution |
|---------|----------|
| **No suggestions appear** | Check if server is running: `curl http://127.0.0.1:8000/docs` |
| **Server won't start** | Ensure Python dependencies: `pip install fastapi uvicorn transformers torch` |
| **High memory usage** | Force CPU mode: Set `device = "cpu"` in `server.py` |
| **Slow responses** | Check GPU availability or reduce model size |
| **Extension not loading** | Run `npm run compile` in extension directory |

### **Debugging**
1. **Server Logs**: Check terminal output when running `python server.py`
2. **Extension Logs**: VS Code → View → Output → Log (Extension Host)
3. **Network Issues**: Test API endpoint: `curl -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" -d '{"code_context": "def hello", "multiline": false}'`

### **Reset Everything**
```bash
# Kill any running servers
pkill -f "python.*server.py"

# Clean extension build
cd extension
rm -rf node_modules out *.vsix
npm install
npm run compile
```

---

## 🤝 **Contributing**

We welcome contributions! Here's how to get started:

### **Development Setup**
```bash
git clone https://github.com/prathmeshmagar447/gpt2-local.git
cd gpt2-local
pip install fastapi uvicorn transformers torch
cd extension && npm install
```

### **Making Changes**
1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### **Code Style**
- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Use ESLint configuration
- **Commits**: Use conventional commit format

---

## 📊 **Performance Benchmarks**

Based on testing with Python code completion:

- **Cache Hit Rate**: ~85% with hash-based caching and TTL
- **Memory Footprint**: ~2GB GPU VRAM / 1GB system RAM (50% less with quantization)
- **Cold Start Time**: ~10-15 seconds (model loading)
- **Inference Speed**: 0-800ms depending on hardware and cache hits
- **Accuracy**: 85%+ syntactically correct suggestions
- **Quantization Support**: 8-bit quantization available for reduced memory usage

---

## 📄 **License**

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Model**: [shibing624/code-autocomplete-gpt2-base](https://huggingface.co/shibing624/code-autocomplete-gpt2-base)
- **Framework**: Built with [FastAPI](https://fastapi.tiangolo.com/) and [Transformers](https://huggingface.co/docs/transformers/index)
- **Inspiration**: GitHub Copilot's ghost text interface

## 📞 **Support**

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/prathmeshmagar447/gpt2-local/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/prathmeshmagar447/gpt2-local/discussions)
- 📧 **Email**: For security issues or sensitive matters

---

<div align="center">

**⭐ Star this repo if you find it useful!**

[📖 Full Documentation](https://github.com/prathmeshmagar447/gpt2-local) • [🐛 Report Issues](https://github.com/prathmeshmagar447/gpt2-local/issues) • [💬 Discussions](https://github.com/prathmeshmagar447/gpt2-local/discussions)

</div>
