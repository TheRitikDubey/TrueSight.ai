import test from "node:test";
import assert from "node:assert/strict";
import axios, { AxiosError } from "axios";
import { searchWeb } from "../src/tools/search.js";

test("Tavily uses bearer auth, bounded requests and normalized evidence", async (t) => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previous; });
  t.mock.method(axios, "post", async (url: string, body: any, config: any) => {
    assert.equal(url, "https://api.tavily.com/search");
    assert.equal(config.headers.Authorization, "Bearer test-key");
    assert.equal(config.params, undefined);
    assert.equal(config.timeout, 15000);
    assert.ok(body.query.length <= 400);
    return { data: { results: [{ title: "Test", url: "https://example.com", content: "a".repeat(2000) }] } };
  });
  const result = await searchWeb("q".repeat(500));
  assert.equal(result[0].content.length, 1500);
});

test("missing credentials fail explicitly without calling the provider", async (t) => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  t.after(() => { if (previous !== undefined) process.env.TAVILY_API_KEY = previous; });
  const post = t.mock.method(axios, "post");
  await assert.rejects(searchWeb("test"), /set TAVILY_API_KEY/);
  assert.equal(post.mock.callCount(), 0);
});

test("authentication failures never expose credential-bearing Axios errors", async (t) => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "secret-for-test";
  t.after(() => { if (previous === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previous; });
  t.mock.method(axios, "post", async () => { throw new AxiosError("secret-for-test", "ERR_BAD_REQUEST", undefined, undefined, { status: 401 } as any); });
  await assert.rejects(searchWeb("test"), (err: Error) => {
    assert.match(err.message, /authentication failed/);
    assert.ok(!err.message.includes("secret-for-test"));
    return true;
  });
});

test("unsafe source URLs are rejected", async (t) => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previous; });
  t.mock.method(axios, "post", async () => ({ data: { results: [{ title: "Bad", url: "javascript:alert(1)", content: "bad" }] } }));
  await assert.rejects(searchWeb("test"), /invalid response/);
});
