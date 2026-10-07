import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  nativeImageUpload,
  nativeImageListInput,
  nativeImageEnvelope
} from "../lib/platform/native-media-contracts";
import { WireContractError } from "../lib/platform/api-contracts";

const input = () => ({
  purpose: "PROFILE_AVATAR",
  targetId: "fictional-account",
  requestKey: randomUUID(),
  replacesId: null,
  expectedVersion: null,
  caption: "",
  alt: "Fixture",
  crop: null
});
test("native image commands reject unsupported destinations, hidden authority and incoherent replacement versions", () => {
  const base = input();
  assert.deepEqual(nativeImageUpload.parse(base), base);
  for (const change of [
    { purpose: "SUPPORT_ATTACHMENT" },
    { purpose: "PROFILE_PHOTO" },
    { uploaderId: "other" },
    { audience: "PUBLIC" },
    { storagePrefix: "hidden" },
    { replacesId: "old" },
    { expectedVersion: 1 },
    { requestKey: "not-a-request-id" },
    { requestKey: base.requestKey.toUpperCase() },
    { replacesId: "old", expectedVersion: -1 },
    { alt: "a".repeat(301) },
    { crop: { x: 0.5, y: 0.5, zoom: Infinity } },
    { purpose: "POST_PHOTO", crop: { x: 0.5, y: 0.5, zoom: 1 } }
  ])
    assert.throws(
      () => nativeImageUpload.parse({ ...base, ...change }),
      WireContractError
    );
  assert.equal(
    nativeImageUpload.parse({ ...base, replacesId: "old", expectedVersion: 2 })
      .expectedVersion,
    2
  );
  assert.throws(
    () =>
      nativeImageListInput.parse({
        purpose: "PROFILE_PHOTO",
        targetId: "owner"
      }),
    WireContractError
  );
});
test("native image descriptors permit only bounded canonical routes and fields", () => {
  const variant = {
    width: 80,
    height: 50,
    bytes: 123,
    path: "/api/platform/v1/images/fixture/thumb"
  };
  const image = {
    id: "fixture",
    version: 1,
    purpose: "POST_PHOTO",
    caption: "",
    alt: "Fixture",
    position: 0,
    crop: null,
    variants: {
      thumb: variant,
      medium: variant,
      large: variant,
      original: variant
    }
  };
  const data = { apiVersion: "1", viewerId: "owner", data: { image } };
  assert.deepEqual(nativeImageEnvelope("upload").parse(data), data);
  assert.equal(
    nativeImageEnvelope("list").parse({
      ...data,
      data: { images: [{ ...image, purpose: "PROFILE_PHOTO", position: 1001 }] }
    }).data.images[0].position,
    1001
  );
  for (const change of [
    { storagePrefix: "private" },
    { version: -1 },
    { purpose: "SUPPORT_ATTACHMENT" },
    {
      variants: {
        ...image.variants,
        thumb: { ...variant, path: "https://storage.example/private" }
      }
    },
    {
      variants: {
        ...image.variants,
        thumb: { ...variant, bytes: 4 * 1024 * 1024 + 1 }
      }
    }
  ])
    assert.throws(
      () =>
        nativeImageEnvelope("upload").parse({
          ...data,
          data: { image: { ...image, ...change } }
        }),
      WireContractError
    );
});
