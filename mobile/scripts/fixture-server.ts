import { createServer } from "node:http";
import { fixturePosts } from "../src/spike/fixture.ts";

const bytes = JSON.stringify({ kind: "fictional-spike", posts: fixturePosts });
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET" || request.url !== "/spike/feed" || request.headers.authorization || request.headers.cookie) {
    response.writeHead(404);
    response.end('{"error":"Fixture route unavailable."}');
    return;
  }
  response.writeHead(200);
  response.end(bytes);
});
server.listen(4084, "127.0.0.1", () => console.log("Fictional mobile feed fixture listening on loopback port 4084."));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close());
