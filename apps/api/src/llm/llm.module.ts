import { Global, Module } from '@nestjs/common';
import type { Env } from '../common/env';
import { ENV } from '../common/env.module';
import { GEMINI_DEFAULT_MODEL, GeminiProvider } from './gemini.provider';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider';
import { LlmGateway } from './llm-gateway.service';

function createProvider(env: Env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'gemini':
      return new GeminiProvider(env.LLM_API_KEY, env.LLM_MODEL || GEMINI_DEFAULT_MODEL);
    default:
      throw new Error(
        `LLM_PROVIDER=${env.LLM_PROVIDER} is not implemented yet. Supported: gemini.`,
      );
  }
}

@Global()
@Module({
  providers: [{ provide: LLM_PROVIDER, inject: [ENV], useFactory: createProvider }, LlmGateway],
  exports: [LlmGateway],
})
export class LlmModule {}
