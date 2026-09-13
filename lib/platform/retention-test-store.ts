import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  lstat
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { RetentionJournalStore } from "./retention-journal";
// Explicit fixture adapter only. Deployment and non-loopback databases cannot
// select local journal files, including production-mode browser previews.
export function retentionTestStore<Entry>(
  prefix: string
): RetentionJournalStore<Entry> | null {
  if (!process.env.RETENTION_TEST_DIR) return null;
  const db = new URL(process.env.DATABASE_URL ?? "invalid:"),
    root = resolve(process.env.RETENTION_TEST_DIR);
  if (
    process.env.ACCOUNT_TEST_ISOLATED !== "1" ||
    process.env.VERCEL ||
    db.hostname !== "127.0.0.1" ||
    !/^\/godschurches_security_test(?:_restore)?$/.test(db.pathname) ||
    !root.startsWith(resolve(".account-test") + sep) ||
    !/^retention-v1\/(purge|accounts|controls)\/$/.test(prefix)
  )
    throw Error("Isolated retention storage required");
  const folder = resolve(root, prefix);
  function file(path: string) {
    if (
      !path.startsWith(prefix) ||
      !/^[A-Za-z0-9_.-]+\.json$/.test(path.slice(prefix.length))
    )
      throw Error("Invalid fixture journal key");
    return resolve(root, path);
  }
  return {
    async read(path) {
      try {
        const stat = await lstat(file(path));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048)
          throw Error("Invalid fixture journal file");
        return JSON.parse(await readFile(file(path), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(path, entry) {
      const key = file(path);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(key, JSON.stringify(entry), { flag: "wx", mode: 0o600 });
    },
    async remove(path) {
      await rm(file(path), { force: true });
    },
    async page(cursor) {
      let names: string[];
      try {
        names = (await readdir(folder)).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") names = [];
        else throw error;
      }
      if (cursor && !/^[A-Za-z0-9_.-]+\.json$/.test(cursor))
        throw Error("Invalid fixture journal cursor");
      const next = names
        .filter((name) => !cursor || name > cursor)
        .slice(0, 101);
      return {
        paths: next.slice(0, 100).map((name) => {
          file(prefix + name);
          return prefix + name;
        }),
        cursor: next.length > 100 ? next[99] : undefined
      };
    }
  };
}
