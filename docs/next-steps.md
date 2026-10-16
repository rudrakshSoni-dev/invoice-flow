# Next steps

Deferred work, tracked here instead of TODO comments.

- **Other LLM providers:** only `gemini` is implemented; `LLM_PROVIDER=anthropic|openai` fails at boot with a clear message. Add them behind `LlmProvider` if needed.
- **Extraction eval:** run `pnpm --filter api eval` with an API key and commit the generated `docs/eval.md`.
- **Line item editing:** reviewers can edit header fields and the vendor, not individual lines.
