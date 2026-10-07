import {
  apiContracts, apiId, decodeApiResponse, decodeNativeResponse, issueNativePasswordCredential,
  nativeActivityInput, nativeEmptyInput, prepareRequest,
  type RequestAdapter, type RequestCancellation, type RequestIdentity, type WireValue,
  type nativePasswordInput
} from "@godschurches/shared-core";

function cancellation(signal?: AbortSignal): RequestCancellation | undefined {
  return signal && {
    get cancelled() { return signal.aborted; },
    subscribe(listener) {
      signal.addEventListener("abort", listener, { once: true });
      return () => signal.removeEventListener("abort", listener);
    }
  };
}

/** Typed native consumers of the canonical client. No HTTP or retry logic here. */
export function createNativeClient(adapter: RequestAdapter) {
  return {
    signIn(credentials: WireValue<typeof nativePasswordInput>, guest: RequestIdentity, signal?: AbortSignal) {
      return issueNativePasswordCredential(adapter, credentials, guest, { cancellation: cancellation(signal) });
    },
    async session(owner: string, signal?: AbortSignal) {
      apiId.parse(owner);
      return (await prepareRequest(adapter, {
        path: apiContracts.session.path, method: "GET", expectedOwner: owner,
        decode: (value, identity) => decodeApiResponse("session", value, identity.owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async activity(owner: string, renewForeground: boolean, signal?: AbortSignal) {
      apiId.parse(owner);
      return (await prepareRequest(adapter, {
        path: "/api/platform/v1/session/activity", method: renewForeground ? "POST" : "GET", expectedOwner: owner,
        ...(renewForeground ? { body: JSON.stringify(nativeActivityInput.parse({ activity: "foreground" })) } : {}),
        decode: value => decodeNativeResponse("activity", value, owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async logout(owner: string, signal?: AbortSignal) {
      apiId.parse(owner);
      return (await prepareRequest(adapter, {
        path: "/api/platform/v1/session/logout", method: "POST", expectedOwner: owner,
        body: JSON.stringify(nativeEmptyInput.parse({})),
        decode: value => decodeNativeResponse("logout", value, owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async capabilities(owner: string | null, signal?: AbortSignal) {
      if (owner !== null) apiId.parse(owner);
      return (await prepareRequest(adapter, {
        path: apiContracts.capabilities.path, method: "GET", expectedOwner: owner,
        decode: (value, original) => decodeApiResponse("capabilities", value, original.owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async feed(owner: string, input: WireValue<typeof apiContracts.feed.query>, signal?: AbortSignal) {
      apiId.parse(owner);
      const query = apiContracts.feed.query.parse(input);
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== null) parameters.set(key, value);
      return (await prepareRequest(adapter, {
        path: apiContracts.feed.path + "?" + parameters.toString(), method: "GET", expectedOwner: owner,
        decode: (value, original) => decodeApiResponse("feed", value, original.owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async post(owner: string, postId: string, signal?: AbortSignal) {
      apiId.parse(owner);
      const path = apiContracts.post.path.replace(":postId", encodeURIComponent(apiId.parse(postId)));
      return (await prepareRequest(adapter, {
        path, method: "GET", expectedOwner: owner,
        decode: (value, original) => decodeApiResponse("post", value, original.owner)
      }).run({ cancellation: cancellation(signal) })).data;
    }
  };
}
export type NativeClient = ReturnType<typeof createNativeClient>;
