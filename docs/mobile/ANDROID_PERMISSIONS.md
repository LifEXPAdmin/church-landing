# Android media permission preparation

The shared app blocks broad external-storage, image/video/audio-library and
all-files permissions in both development and staging. Expo's
`android.blockedPermissions` writes `tools:node="remove"` entries for the Android
manifest merger. An empty `android.permissions` list alone would not remove
permissions declared by native libraries.

The inspected file-system dependency and generated template previously declared
`READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, limited to API 32. The current
fixture does not select, record or upload media. Keeping these declarations would
give future code a route to request unnecessary access on older supported devices.
The configuration also blocks `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`,
`READ_MEDIA_AUDIO` and `MANAGE_EXTERNAL_STORAGE` so adding a library cannot silently
introduce those broader declarations.

This is a native configuration change. Existing installed binaries need rebuilding
to receive it. Generated removal markers are not evidence of a final merged
manifest, installed permissions or a completed photo workflow. Inspect the actual
debug and eventual release merged manifests after dependencies are resolved.
Dev Client overlay/vibration and Internet declarations remain separately visible;
they are not approved production permission requirements.

## Photo workflow integration

Use the selected system Photo Picker and its scoped content URI grants when the
shared image workflow is ready. Follow the platform's document-picker fallback
on devices without Photo Picker. Do not convert a content URI into an assumed
filesystem path or request broad storage access to work around a read failure.

Selection, cancellation, grant loss and process death need actual device checks.
If a provider returns unavailable data, keep the original draft and offer another
selection. Bound any app-owned temporary copy to the canonical upload limit and
remove only that owned copy after cancellation or confirmed completion. Account
changes must prevent a delayed selection/upload from entering the new account.
The canonical server image contract retains account, operation-key, metadata and
exact-byte identity after an uncertain upload; this preparation adds no upload
queue, camera integration or alternative media service.

When implementing camera capture, inspect the selected library's real native
declarations and request only the access required by the chosen interaction.
Keep camera, microphone, notifications and media selection as separate user
actions. Do not activate a permission merely because a package declares it.

## Required acceptance

Verify generated removal markers now, then inspect both final merged manifests
and installed permission state after native builds become available. Test minimum
supported Android and representative current devices, including an unavailable
picker/provider, selected-only access, cancellation, background/process restart,
large files, lost URI access and low storage. Existing app-private files and
SecureStore must continue to work without broad external-storage permissions.
No SDK terms, production identity, store disclosure or device acceptance follows
from a configuration-only check.

References: [Expo permission configuration](https://docs.expo.dev/guides/permissions/)
and [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker).
