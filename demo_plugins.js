const { executePlugin } = require('./backend/src/services/pluginRuntime.js');

async function runDemo() {
  console.log("=== 1. TEXT_TRANSFORM ===");
  try {
    const textResult = await executePlugin('TEXT_TRANSFORM', { text: "hello world" }, { shift: 3 }, {});
    console.log("Input: { text: 'hello world', shift: 3 }");
    console.log("Output:", textResult);
  } catch(e) { console.error(e) }

  console.log("\n=== 2. API_PROXY ===");
  try {
    const apiResult = await executePlugin('API_PROXY', { url: "https://jsonplaceholder.typicode.com/todos/1", method: "GET" }, { useCache: false }, { cache: new Map() });
    console.log("Input: Fetching from https://jsonplaceholder.typicode.com/todos/1");
    // Only print status and a snippet of the body to keep output clean
    console.log("Output Status:", apiResult.status);
    console.log("Output Body:", apiResult.body);
  } catch(e) { console.error(e) }

  console.log("\n=== 3. DELAY ===");
  try {
    const start = Date.now();
    const delayResult = await executePlugin('DELAY', { ms: 50 }, { blocking: true }, {});
    const duration = Date.now() - start;
    console.log(`Input: { ms: 50, blocking: true }`);
    console.log("Output:", delayResult);
    console.log(`Actually waited ~${duration}ms`);
  } catch(e) { console.error(e) }

  console.log("\n=== 4. IF ===");
  try {
    const ifResult = await executePlugin('IF', {}, { sourceStepId: 'step1', path: 'status', equals: 200 }, { stepOutputs: { step1: { status: 200 } } });
    console.log("Input: Checking if step1.status === 200");
    console.log("Output:", ifResult);
  } catch(e) { console.error(e) }

  console.log("\n=== 5. DATA_AGGREGATOR ===");
  try {
    const aggResult = await executePlugin('DATA_AGGREGATOR', {}, { includeStepIds: ['stepA', 'stepB'] }, { stepOutputs: { stepA: { result: "foo" }, stepB: { result: "bar" } } });
    console.log("Input: Aggregating stepA and stepB");
    console.log("Output:", aggResult);
  } catch(e) { console.error(e) }
}

runDemo();
