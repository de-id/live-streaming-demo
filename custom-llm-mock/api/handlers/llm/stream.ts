const SENTENCES = [
  "This is the first sentence.",
  "This is the second sentence.",
  "This is the third sentence.",
];

interface StreamResponse {
  id: string;
  created: number;
  choices: { delta: { content: string } }[];
}

//@ts-ignore
export async function stream(
  body: any
): Promise<AsyncIterable<StreamResponse>> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const [index, sentence] of SENTENCES.entries()) {
        yield {
          id: `id${index + 1}`,
          created: Date.now(),
          choices: [{ delta: { content: `${sentence}\n` } }],
        };
      }
    },
  };
}
