# Extraction eval

Not run yet. It needs a Gemini API key:

```sh
# set LLM_API_KEY (and optionally LLM_MODEL) in .env
pnpm --filter api eval
```

The script extracts all 10 fixtures in `fixtures/invoices/` with the real model, scores every field against `manifest.json`, and overwrites this file with the results. Target: 90% field accuracy.
