"use client";
import { PrivateReadSnapshot } from "./private-read-snapshot";
import {
  TopicCatalogue,
  type TopicCatalogueResult,
  type TopicCatalogueQuery
} from "./topic-catalogue";

export function TopicPrivateCatalogue({
  owner,
  url,
  query,
  path
}: {
  owner: string;
  url: string;
  query: TopicCatalogueQuery;
  path: string;
}) {
  return (
    <PrivateReadSnapshot<TopicCatalogueResult>
      owner={owner}
      url={url}
      label="topic choices"
      changedNotice="Your topic choices or ownership changed. Reload to inspect the current list."
    >
      {(result) => <TopicCatalogue result={result} query={query} path={path} />}
    </PrivateReadSnapshot>
  );
}
