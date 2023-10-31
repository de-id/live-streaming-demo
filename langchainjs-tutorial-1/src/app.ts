 //Import the OpenAPI Large Language Model (you can import other models here eg. Cohere)
 import { OpenAI } from "langchain/llms/openai";

 //Import the PromptTemplate module
 import { PromptTemplate } from "langchain/prompts";

 //Import the Chains module
 import { LLMChain } from "langchain/chains";

 //Load environment variables (populate process.env from .env file)
 import * as dotenv from "dotenv";

 //dotenv.config();
 //console.log(process.env);
 const result = dotenv.config();

 if (result.error) {
   throw result.error
 }
 
 console.log(result.parsed);

 export const run = async () => {
     //Instantiante the OpenAI model 
     //Pass the "temperature" parameter which controls the RANDOMNESS of the model's output. A lower temperature will result in more predictable output, while a higher temperature will result in more random output. The temperature parameter is set between 0 and 1, with 0 being the most predictable and 1 being the most random
     const model = new OpenAI({ temperature: 0.0 });

     //Create the template. The template is actually a "parameterized prompt". A "parameterized prompt" is a prompt in which the input parameter names are used and the parameter values are supplied from external input 
     const template = "What is a good name for a company that makes {product}?";

     //Instantiate "PromptTemplate" passing the prompt template string initialized above and a list of variable names the final prompt template will expect
     const prompt = new PromptTemplate({ template, inputVariables: ["product"] });

     //Instantiate LLMChain, which consists of a PromptTemplate and an LLM. Pass the result from the PromptTemplate and the OpenAI LLM model
     const chain = new LLMChain({ llm: model, prompt });

     //Run the chain. Pass the value for the variable name that was sent in the "inputVariables" list passed to "PromptTemplate" initialization call
     const res = await chain.call({ product: "colorful socks" });
     console.log({ res });
 };

 run();