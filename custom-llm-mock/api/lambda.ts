import * as llm from "./handlers/llm";

const logger = console;

type AwsWritableStream = NodeJS.WriteStream & {
  setContentType: (type: string) => void;
};
declare const awslambda: {
  streamifyResponse: Function;
  HttpResponseStream: { from: Function };
};

const VALID_API_KEY = "123";

function authorize(headers: Record<string, string | undefined>) {
  const apiKey = headers["x-api-key"];

  if (apiKey !== VALID_API_KEY) {
    throw new Error("Unauthorized: Invalid API key");
  }
}

export const handler = awslambda.streamifyResponse(
  async (event, responseStream: AwsWritableStream, _context) => {
    const headers = event.headers || {};

    try {
      authorize(headers);

      const body = JSON.parse(event.body || "{}");
      const isStream = !!body.stream;

      if (!isStream) {
        const response = await llm.complete(body);

        responseStream.setContentType("application/json");
        responseStream.write(JSON.stringify(response));
        responseStream.end();
        return;
      }

      responseStream.setContentType("text/event-stream");

      const stream = await llm.stream(body);

      for await (const chunk of stream) {
        logger.info("Sending chunk", { chunk, id: chunk.id });
        responseStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      responseStream.write(`data: [DONE]`);
      responseStream.end();
    } catch (error: any) {
      logger.error("LLM error", { error });

      responseStream.setContentType("application/json");
      responseStream.write(
        JSON.stringify(error.toJson?.() ?? { error: error.message })
      );
      responseStream.end();
    }
  }
);
