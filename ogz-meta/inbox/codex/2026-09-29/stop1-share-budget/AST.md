# Host AST routing receipt

Command: require("./tools/serena-symbol-scanner").getMethodCallers("_applyStockShareRange", {repoRoot:process.cwd(),limit:200})
Working-tree routing only, exact reviewed source is the candidate tree.

```json
{
  "source": "serena_tree_sitter_method_callers",
  "parser": "tree-sitter-javascript",
  "method": "_applyStockShareRange",
  "total": 1,
  "filesScanned": 390,
  "errors": [
    {
      "file": "ogz-meta/ogz-run.js",
      "error": "tree-sitter parse incomplete; Babel parse failed: 'return' outside of function. (198:2)"
    }
  ],
  "callers": [
    {
      "file": "core/OrderExecutor.js",
      "line": 2423,
      "column": 19,
      "method": "_applyStockShareRange",
      "receiver": "this",
      "receiverPath": "this",
      "op": "call",
      "context": "this._applyStockShareRange({ orderQuantity, price: budgetPrice, exitContract, entryBudgetUsd: sizeUsd, })",
      "enclosing": "_buildEntryPlan"
    }
  ],
  "truncated": false
}
```
