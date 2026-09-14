import { Transform } from "node:stream";

// Test-only aggregate link model. Each stream has normal backpressure; pending
// chunks across clients share one byte budget rather than one budget per user.
export function sharedLink(megabitsPerSecond) {
  let nextAt = 0;
  let bytes = 0;
  return {
    stream() {
      let timer;
      return new Transform({
        transform(chunk, encoding, done) {
          bytes += chunk.length;
          nextAt =
            Math.max(performance.now(), nextAt) +
            (chunk.length * 8) / (megabitsPerSecond * 1000);
          timer = setTimeout(
            () => {
              timer = undefined;
              done(null, chunk);
            },
            Math.max(0, nextAt - performance.now())
          );
        },
        destroy(error, done) {
          clearTimeout(timer);
          done(error);
        }
      });
    },
    get bytes() {
      return bytes;
    }
  };
}
