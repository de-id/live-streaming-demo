interface CompleteResponse {
  content: string;
}

//@ts-ignore
export async function complete(body: any): Promise<CompleteResponse> {
  return {
    content: "Hello World!",
  };
}
