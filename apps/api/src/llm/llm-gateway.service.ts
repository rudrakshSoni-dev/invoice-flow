import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider';
import { type AgentRunLog, type StructuredLlm, generateStructured } from './structured-output';

/** Every LLM call in the app goes through here so it is recorded as an AgentRun. */
@Injectable()
export class LlmGateway {
  private readonly logger = new Logger(LlmGateway.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prisma: PrismaService,
  ) {}

  forInvoice(invoiceId: string): StructuredLlm {
    const logRun = async (run: AgentRunLog) => {
      this.logger.log(
        `llm ${run.status} prompt=${run.promptVersion} hash=${run.promptHash} model=${run.model} ` +
          `latency=${run.latencyMs}ms tokens=${run.tokensIn ?? '?'}/${run.tokensOut ?? '?'} invoice=${invoiceId}`,
      );
      await this.prisma.agentRun.create({ data: { invoiceId, ...run } });
    };
    return (request) => generateStructured(this.provider, logRun, request);
  }
}
