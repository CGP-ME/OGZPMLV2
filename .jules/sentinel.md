## 2025-02-19 - Path Traversal in Backtest API
**Vulnerability:** Path traversal in `GET /api/backtest/results/:id` allowing arbitrary JSON file read.
**Learning:** The application uses user input directly in `path.join` without validation. `path.join` resolves `..` segments, which allows traversing up the directory tree.
**Prevention:** Validate all user inputs used in file system operations. Use a regex whitelist (e.g., `^[a-zA-Z0-9_-]+$`) to ensure only safe filenames are used.
