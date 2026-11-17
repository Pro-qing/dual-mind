<div align="center">
  <strong>English</strong> | <a href="./README.zh.md">简体中文</a>
</div>

# 🧠 DualMind

**Two AI minds are better than one.**  
DualMind is a VS Code extension that runs two independent AI agents side-by-side—a **Worker** and a **Reviewer**—in an automated feedback loop to generate, critique, and refine your code.

---

### ✨ Why DualMind?
Single-shot LLM responses often miss edge cases or introduce subtle bugs. Inspired by real-world pair programming, DualMind splits the workflow into two specialized roles:
* **🛠️ The Worker:** Focuses on implementing features, writing clean code, and addressing feedback.
* **🔍 The Reviewer:** Acts as a strict tech lead—auditing logic, catching edge cases, and rejecting subpar outputs until standards are met.

### 🚀 Key Features
* **Split-Screen Dual Chat:** Watch both agents think, stream, and debate in real time inside a dedicated VS Code Webview panel.
* **Automated Iteration Loop:** Configurable max turns (`Worker → Reviewer → Fix → Approved`) with one-click pause/intervene controls.
* **Flexible Model Pairing:** Mix and match models (e.g., use a fast model as the Worker and a reasoning model as the Reviewer).
* **Editor Context Integration:** Pull selected code directly into the loop and apply approved changes back to your active file.