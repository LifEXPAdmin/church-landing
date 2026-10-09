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
        decode: (value, original) => {
          const response = decodeApiResponse("feed", value, original.owner);
          if (response.data.mode !== query.mode || query.scope !== null && response.data.scope !== query.scope)
            throw new Error("Feed selection did not match the request.");
          return response;
        }
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async post(owner: string, postId: string, signal?: AbortSignal) {
      apiId.parse(owner);
      const id = apiId.parse(postId);
      const path = apiContracts.post.path.replace(":postId", encodeURIComponent(id));
      return (await prepareRequest(adapter, {
        path, method: "GET", expectedOwner: owner,
        decode: (value, original) => {
          const response = decodeApiResponse("post", value, original.owner);
          if (response.data.id !== id) throw new Error("Post identity did not match the request.");
          return response;
        }
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async like(owner: string, postId: string, interactionId: string, signal?: AbortSignal) {
      apiId.parse(owner);
      const id = apiId.parse(interactionId);
      const path = apiContracts.like.path.replace(":postId", encodeURIComponent(apiId.parse(postId)));
      return (await prepareRequest(adapter, {
        path, method: "GET", expectedOwner: owner,
        decode: (value, original) => {
          const result = decodeApiResponse("like", value, original.owner);
          if (result.data.id !== id) throw new Error("Like identity did not match the current post.");
          return result;
        }
      }).run({ cancellation: cancellation(signal) })).data;
    },
    async reactionPreferences(owner: string, signal?: AbortSignal) {
      apiId.parse(owner);
      return (await prepareRequest(adapter, {
        path: apiContracts.reactionPreferences.path, method: "GET", expectedOwner: owner,
        decode: (value, original) => decodeApiResponse("reactionPreferences", value, original.owner)
      }).run({ cancellation: cancellation(signal) })).data;
    },
    prepareReactionPreferences(owner: string, input: WireValue<typeof apiContracts.setReactionPreferences.body>) {
      apiId.parse(owner);
      const parsed = apiContracts.setReactionPreferences.body.parse(input), expectedVersion = parsed.expectedVersion;
      const body = JSON.stringify(parsed);
      return prepareRequest(adapter, {
        path: apiContracts.setReactionPreferences.path, method: "POST", expectedOwner: owner, body, idempotent: true,
        decode: (value, original) => {
          const result = decodeApiResponse("setReactionPreferences", value, original.owner);
          if (result.data.version !== expectedVersion + 1) throw new Error("Preference receipt version did not match the choice.");
          return result;
        }
      });
    },
    prepareLike(owner: string, postId: string, interactionId: string,
      input: WireValue<typeof apiContracts.setLike.body>) {
      apiId.parse(owner);
      const id = apiId.parse(interactionId);
      const body = JSON.stringify(apiContracts.setLike.body.parse(input));
      const path = apiContracts.setLike.path.replace(":postId", encodeURIComponent(apiId.parse(postId)));
      return prepareRequest(adapter, {
        path, method: "POST", expectedOwner: owner, body, idempotent: true,
        decode: (value, original) => {
          const result = decodeApiResponse("setLike", value, original.owner);
          if (result.data.id !== id) throw new Error("Like receipt did not match the current post.");
          return result;
        }
      });
    }
  };
}
export type NativeClient = ReturnType<typeof createNativeClient>;
