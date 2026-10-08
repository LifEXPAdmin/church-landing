"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { currentSocialOwner } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";
import { Button } from "@/components/ui/button";
import { accountInputClass } from "./account-form";
import type { ProfileEditorView } from "@/lib/platform/profiles";
import { ParticipationChoice } from "./participation-choice";
import { ProfileFeaturedPicker } from "./profile-featured";
import type { ProfileFeaturedReference } from "@/lib/platform/profile-featured-input";
import { ProfileEventPicker } from "./profile-events";
import { ProfilePhotoPicker } from "./profile-photo-picker";
import { roleLabels } from "@/lib/platform/format";
import {
  profileModuleOrder,
  profileModuleLabels,
  type ProfileModuleKind
} from "@/lib/platform/profile-modules";
import {
  PROFILE_BACKGROUNDS,
  PROFILE_ORDERS,
  PROFILE_PALETTES
} from "@/lib/platform/profile-style";
export function ProfileForm({
  profile,
  imagesPending,
  onDirty,
  onBusy,
  onSaved
}: {
  profile: ProfileEditorView;
  imagesPending: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const owner = useRef(profile.id).current;
  const readVisible = useReadVisibility();
  const [locallyVisible, setLocallyVisible] = useState(readVisible);
  const visible = readVisible && locallyVisible;
  const visibleNow = useRef(visible);
  visibleNow.current = visible;
  const mounted = useRef(true),
    generation = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  // This snapshot belongs to the mounted editor. It never enters Web Storage.
  // Read controls directly: FormData omits fields inside a disabled fieldset.
  const draft = useRef<Record<string, string>>({
    name: profile.name,
    role: profile.role,
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    locationAudience: profile.canShareLocation
      ? profile.locationAudience
      : "ONLY_ME",
    website: profile.website ?? "",
    interests: profile.interests.join(", "),
    introduction: profile.presentation.introduction,
    sectionOrder: profile.presentation.sectionOrder,
    moduleTestimony: profile.presentation.modules.testimony,
    moduleSkills: profile.presentation.modules.skills.join("\n"),
    ...Object.fromEntries(
      [0, 1, 2].flatMap((index) => [
        [
          `moduleLinkLabel${index}`,
          profile.presentation.modules.links[index]?.label ?? ""
        ],
        [
          `moduleLinkUrl${index}`,
          profile.presentation.modules.links[index]?.url ?? ""
        ]
      ])
    )
  });
  const captureDraft = useCallback(() => {
    for (const field of Array.from(form.current?.elements ?? [])) {
      if (
        (field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement) &&
        field.name &&
        field.type !== "file"
      )
        draft.current[field.name] = field.value;
    }
  }, []);
  const [message, setMessage] = useState("");
  const [calendarOccurrenceId, setCalendarOccurrenceId] = useState(
    profile.presentation.modules.calendarOccurrenceId
  );
  const [featuredResources, setFeaturedResources] = useState<
    ProfileFeaturedReference[]
  >(profile.presentation.modules.featuredResources ?? []);
  const [featuredPending, setFeaturedPending] = useState(false);
  const [eventPending, setEventPending] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>(
    profile.presentation.modules.photoIds ?? []
  );
  const [photosPending, setPhotosPending] = useState(false);
  const [moduleOrder, setModuleOrder] = useState<ProfileModuleKind[]>(() =>
    profileModuleOrder(profile.presentation.modules)
  );
  const [orderMessage, setOrderMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const postAttempts = useRef(0);
  const [acceptedRedirect, setAcceptedRedirect] = useState<string | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const latestHeading = useRef<HTMLHeadingElement>(null);
  const [version, setVersion] = useState(profile.presentation.version);
  const [locationVersion, setLocationVersion] = useState(
    profile.locationVersion
  );
  const [palette, setPalette] = useState(profile.presentation.palette),
    [background, setBackground] = useState(profile.presentation.background);
  const [appearanceEdited, setAppearanceEdited] = useState(false);
  const [reviewedPresentation, setReviewedPresentation] = useState<
    ProfileEditorView["presentation"] | null
  >(null);
  const confirmedPresentation = reviewedPresentation ?? profile.presentation;
  const savedAppearance = `${PROFILE_PALETTES.find((p) => p.value === confirmedPresentation.palette)?.label}, ${PROFILE_BACKGROUNDS.find((p) => p.value === confirmedPresentation.background)?.label}`;
  const [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<ProfileEditorView | null>(null);
  const conceal = useCallback(() => {
    captureDraft();
    visibleNow.current = false;
    generation.current++;
    setLocallyVisible(false);
    setLatest(null);
    setReviewedPresentation(null);
  }, [captureDraft]);
  useLayoutEffect(() => {
    if (readVisible) setLocallyVisible(true);
    else conceal();
  }, [readVisible, conceal]);
  useEffect(() => {
    mounted.current = true;
    const counter = generation;
    const visibility = () => {
      if (document.visibilityState === "hidden") conceal();
    };
    window.addEventListener("blur", conceal);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("offline", conceal);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      counter.current++;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("offline", conceal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [conceal]);
  const current = (seq: number) =>
    mounted.current &&
    visibleNow.current &&
    seq === generation.current &&
    document.visibilityState !== "hidden";
  async function sameOwner(seq: number) {
    if (!current(seq)) return false;
    let actual: string | null;
    try {
      actual = await currentSocialOwner();
    } catch (error) {
      if (current(seq)) {
        conceal();
        window.dispatchEvent(new Event("blur"));
      }
      throw error;
    }
    if (!current(seq)) return false;
    if (actual !== owner) {
      conceal();
      window.dispatchEvent(new Event("blur"));
      return false;
    }
    return true;
  }
  function begin() {
    busy.current = true;
    setPending(true);
    onBusy(true);
  }
  function finish(focusFeedback = false) {
    busy.current = false;
    if (!mounted.current) return;
    setPending(false);
    onBusy(false);
    if (focusFeedback && visibleNow.current)
      requestAnimationFrame(() => feedback.current?.focus());
  }
  function navigateSaved(redirect: string) {
    onSaved();
    onDirty(false);
    window.location.replace(redirect);
  }
  function moveModule(
    kind: ProfileModuleKind,
    offset: number,
    control: HTMLButtonElement
  ) {
    if (!visibleNow.current || pendingBody) return;
    const from = moduleOrder.indexOf(kind),
      to = from + offset;
    if (to < 0 || to >= moduleOrder.length) return;
    const next = [...moduleOrder];
    [next[from], next[to]] = [next[to], next[from]];
    setModuleOrder(next);
    setOrderMessage(
      `${profileModuleLabels[kind]} moved to position ${to + 1} of ${next.length}.`
    );
    onDirty(true);
    requestAnimationFrame(() => {
      if (visibleNow.current) control.focus();
    });
  }
  async function reviewSaved() {
    if (busy.current || !visibleNow.current) return;
    const seq = generation.current;
    begin();
    setLatest(null);
    try {
      if (!(await sameOwner(seq))) return;
      const response = await fetch("/api/platform/profile", {
        cache: "no-store",
        headers: { "X-Expected-Account": owner }
      });
      const result = await response.json();
      if (!(await sameOwner(seq))) return;
      if (!response.ok || result.id !== owner)
        throw new Error(
          "The saved profile could not be loaded. Your entries and original request are unchanged."
        );
      setLatest(result);
      setReviewedPresentation(result.presentation);
      requestAnimationFrame(() => {
        if (current(seq)) latestHeading.current?.focus();
      });
    } catch {
      if (current(seq))
        setMessage(
          "The saved profile could not be loaded. Your entries and original request are unchanged."
        );
    } finally {
      finish();
    }
  }
  async function sendOriginal(body: string) {
    if (
      busy.current ||
      !visibleNow.current ||
      imagesPending ||
      eventPending ||
      photosPending ||
      featuredPending
    )
      return;
    const seq = generation.current;
    begin();
    setMessage("");
    setLatest(null);
    let accepted = false;
    try {
      if (!(await sameOwner(seq))) return;
      const attempt = ++postAttempts.current;
      const response = await fetch("/api/platform/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Expected-Account": owner
        },
        body
      });
      const result = await response.json();
      if (!mounted.current) return;
      if (
        response.ok &&
        response.status === 200 &&
        result.redirect ===
          `/platform/profile/${encodeURIComponent(profile.username)}`
      ) {
        // Acceptance can survive concealment, but it cannot navigate the new
        // account or erase retained work. Continuing later is a deliberate read.
        accepted = true;
        setAcceptedRedirect(result.redirect);
        if (await sameOwner(seq)) navigateSaved(result.redirect);
        else
          setMessage(
            "The server confirmed this save. Recheck this original account before continuing to the saved profile."
          );
        return;
      }
      setConflict(response.status === 409 || response.status === 202);
      if (!(await sameOwner(seq))) return;
      // Only an explicitly classified first rejection proves this request did
      // not commit. A later rejection cannot settle an earlier uncertain save.
      if (
        attempt === 1 &&
        response.status === 400 &&
        result.code === "ACCOUNT_PROFILE_VALIDATION"
      ) {
        setPendingBody(null);
        setMessage(
          typeof result.message === "string"
            ? result.message
            : "Check your profile entries before saving again."
        );
        return;
      }
      setMessage(
        response.status === 409 || response.status === 202
          ? "Your profile may already have changed. Your entries and original request are retained. Review the saved profile before choosing a new version."
          : "This save was not confirmed. Your entries and original request are retained. Retry that request or review the saved profile."
      );
    } catch {
      if (mounted.current)
        setMessage(
          accepted
            ? "The server confirmed this save. Your original sign-in could not be checked. Your entries and saved confirmation are retained."
            : "We could not confirm the save. Your entries and original request are retained. Retry that request or review the saved profile."
        );
    } finally {
      finish(true);
    }
  }
  async function continueSaved() {
    if (!acceptedRedirect || busy.current || !visibleNow.current) return;
    const seq = generation.current;
    begin();
    try {
      if (await sameOwner(seq)) navigateSaved(acceptedRedirect);
    } catch {
      if (current(seq))
        setMessage(
          "Your original sign-in could not be checked. Your entries and saved confirmation are retained."
        );
    } finally {
      finish();
    }
  }
  async function adoptReviewedVersion() {
    if (!latest || busy.current || !visibleNow.current) return;
    const reviewed = latest,
      seq = generation.current;
    begin();
    try {
      if (!(await sameOwner(seq))) return;
      setVersion(reviewed.presentation.version);
      setLocationVersion(reviewed.locationVersion);
      setPendingBody(null);
      setAcceptedRedirect(null);
      setLatest(null);
      setConflict(false);
      setMessage(
        "Your entries are retained. Save profile to apply them over the version you just reviewed."
      );
    } catch {
      if (current(seq))
        setMessage(
          "Your original sign-in could not be checked. Your entries and original request are unchanged."
        );
    } finally {
      finish(true);
    }
  }
  async function stopRetrying() {
    if (busy.current || !pendingBody || !visibleNow.current) return;
    if (
      !window.confirm(
        "Stop retrying this original save? It may already be saved. Your draft stays here, and stopping does not undo any saved change. Review the current profile before choosing a new version."
      )
    )
      return;
    const seq = generation.current;
    begin();
    try {
      if (!(await sameOwner(seq))) return;
      setPendingBody(null);
      setAcceptedRedirect(null);
      setLatest(null);
      setConflict(true);
      setMessage(
        "The original request was discarded from this tab. Your draft is retained. Review the saved profile before applying your edits."
      );
    } catch {
      if (current(seq))
        setMessage(
          "Your original sign-in could not be checked. Your entries and original request are unchanged."
        );
    } finally {
      finish(true);
    }
  }
  return (
    <form
      id="account-profile-form"
      method="post"
      action="/api/platform/account"
      className="mx-auto max-w-3xl space-y-5 rounded-xl border border-gc-divider bg-gc-surface p-5 text-gc-text sm:p-8"
      aria-busy={pending}
      ref={form}
      // Run after child handlers so the first controlled edit survives the
      // parent's transition to dirty. Capture-phase updates restore old values.
      onInput={() => {
        captureDraft();
        onDirty(true);
      }}
      onChange={() => {
        captureDraft();
        onDirty(true);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          busy.current ||
          !visibleNow.current ||
          pendingBody ||
          conflict ||
          imagesPending ||
          eventPending ||
          photosPending ||
          featuredPending
        )
          return;
        captureDraft();
        const fields: Record<string, string> = {
          ...draft.current,
          palette,
          background
        };
        const profileModules = {
          featuredResources,
          photoIds,
          ...(calendarOccurrenceId !== undefined
            ? { calendarOccurrenceId }
            : {}),
          order: moduleOrder,
          testimony: fields.moduleTestimony ?? "",
          skills: (fields.moduleSkills ?? "")
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          links: [0, 1, 2]
            .map((index) => ({
              label: (fields[`moduleLinkLabel${index}`] ?? "").trim(),
              url: (fields[`moduleLinkUrl${index}`] ?? "").trim()
            }))
            .filter((link) => link.label || link.url)
        };
        for (const key of Object.keys(fields))
          if (key.startsWith("module")) delete fields[key];
        const body = JSON.stringify({
          ...fields,
          profileModules,
          expectedVersion: version,
          expectedLocationVersion: locationVersion,
          operation: "update-profile"
        });
        setPendingBody(body);
        postAttempts.current = 0;
        setAcceptedRedirect(null);
        setConflict(false);
        onDirty(true);
        void sendOriginal(body);
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {visible && (
          <fieldset disabled={!!pendingBody} className="min-w-0 space-y-5">
            <legend className="sr-only">Profile details and appearance</legend>
            <div>
              <h2 className="text-3xl text-gc-text">
                Profile details and appearance
              </h2>
              <p className="mt-3 text-gc-muted">
                Share only what you want other members to see. Your name and
                username identify public posts and comments; viewing your other
                profile details requires sign-in. Your account email and church
                directory choices are separate.
              </p>
            </div>
            <input type="hidden" name="expectedVersion" value={version} />
            <ParticipationChoice
              id="profile-role"
              initialValue={draft.current.role as ProfileEditorView["role"]}
            />
            <fieldset className="min-w-0 space-y-4">
              <legend className="text-2xl">Identity</legend>
              <p className="text-sm text-gc-muted">
                Name is the only required profile field. Use 2 to 100
                characters. Your username is @{profile.username}; it cannot be
                changed here.
              </p>
              <div>
                <label htmlFor="profile-name">Name (required)</label>
                <input
                  id="profile-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  defaultValue={draft.current.name}
                  className={accountInputClass}
                />
              </div>
            </fieldset>
            <fieldset className="min-w-0 space-y-4">
              <legend
                id="profile-sections-heading"
                tabIndex={-1}
                className="scroll-mt-24 text-2xl"
              >
                Optional profile sections
              </legend>
              <p className="text-sm text-gc-muted">
                Filled sections appear in About for permitted signed-in members.
                Leave a section empty to remove it. These fields do not copy
                your private account or church-directory contact details.
              </p>
              <p className="text-sm text-gc-muted">
                Last confirmed saved layout:{" "}
                {
                  PROFILE_ORDERS.find(
                    (p) => p.value === confirmedPresentation.sectionOrder
                  )?.label
                }
                .
                {confirmedPresentation.introduction
                  ? " An introduction appears above these sections."
                  : " No introduction is saved."}
                {confirmedPresentation.modules.calendarOccurrenceId
                  ? " An event is selected; its details are shown only while each reader has access."
                  : " No event is selected."}{" "}
                Removing an event selection leaves the original event and
                responses intact.
              </p>
              <fieldset
                className="min-w-0 space-y-3"
                aria-describedby="profile-module-order-help"
              >
                <legend className="text-lg">Optional section order</legend>
                <p
                  id="profile-module-order-help"
                  className="text-sm text-gc-muted"
                >
                  Choose the order within About. Empty sections stay hidden and
                  keep their position for when you add content. Save your
                  profile to apply this order, then use Preview to check the
                  saved view.
                </p>
                <ol className="space-y-3">
                  {moduleOrder.map((kind, index) => (
                    <li
                      key={kind}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gc-divider p-3"
                    >
                      <span>
                        {index + 1}. {profileModuleLabels[kind]}
                      </span>
                      <span className="flex min-w-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="gc-profile-text-button min-h-11 shrink-0 whitespace-nowrap px-2 aria-disabled:opacity-40"
                          aria-disabled={index === 0}
                          aria-label={`Move ${profileModuleLabels[kind]} up`}
                          onClick={(event) =>
                            moveModule(kind, -1, event.currentTarget)
                          }
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="gc-profile-text-button min-h-11 shrink-0 whitespace-nowrap px-2 aria-disabled:opacity-40"
                          aria-disabled={index === moduleOrder.length - 1}
                          aria-label={`Move ${profileModuleLabels[kind]} down`}
                          onClick={(event) =>
                            moveModule(kind, 1, event.currentTarget)
                          }
                        >
                          Down
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="sr-only" role="status">
                  {orderMessage}
                </p>
              </fieldset>
              <label className="block" htmlFor="profile-testimony">
                My testimony (optional)
              </label>
              <textarea
                id="profile-testimony"
                name="moduleTestimony"
                rows={6}
                maxLength={2000}
                className={accountInputClass}
                defaultValue={draft.current.moduleTestimony}
                aria-describedby="profile-testimony-help"
              />
              <p id="profile-testimony-help" className="text-sm text-gc-muted">
                Your story in plain text, up to 2,000 characters.
              </p>
              <label className="block" htmlFor="profile-skills">
                Skills (optional)
              </label>
              <textarea
                id="profile-skills"
                name="moduleSkills"
                rows={4}
                maxLength={609}
                className={accountInputClass}
                defaultValue={draft.current.moduleSkills}
                aria-describedby="profile-skills-help"
              />
              <p id="profile-skills-help" className="text-sm text-gc-muted">
                One skill per line, up to 10 skills of 60 characters each. A
                skill does not grant a church role or permission.
              </p>
              {[0, 1, 2].map((index) => (
                <fieldset key={index} className="min-w-0 space-y-3">
                  <legend className="text-lg">
                    Link {index + 1} (optional)
                  </legend>
                  <label
                    className="block"
                    htmlFor={`profile-link-label-${index}`}
                  >
                    Link {index + 1} label
                    <input
                      id={`profile-link-label-${index}`}
                      name={`moduleLinkLabel${index}`}
                      maxLength={80}
                      className={accountInputClass}
                      defaultValue={draft.current[`moduleLinkLabel${index}`]}
                    />
                  </label>
                  <label
                    className="block"
                    htmlFor={`profile-link-url-${index}`}
                  >
                    Link {index + 1} address
                    <input
                      id={`profile-link-url-${index}`}
                      name={`moduleLinkUrl${index}`}
                      type="url"
                      maxLength={500}
                      className={accountInputClass}
                      defaultValue={draft.current[`moduleLinkUrl${index}`]}
                    />
                  </label>
                </fieldset>
              ))}
              <p className="text-sm text-gc-muted">
                Use a readable label and an http or https address for each link.
                Links are not embedded or loaded in your profile.
              </p>
            </fieldset>
          </fieldset>
        )}
        <ProfileFeaturedPicker
          owner={owner}
          selected={featuredResources}
          visible={visible}
          disabled={
            pending ||
            !!pendingBody ||
            imagesPending ||
            eventPending ||
            photosPending ||
            !visible
          }
          onSelect={(references) => {
            if (!visibleNow.current || pendingBody) return;
            setFeaturedResources(references);
            onDirty(true);
          }}
          onBusy={(value) => {
            setFeaturedPending(value);
            onBusy(value || busy.current || eventPending || photosPending);
          }}
        />
        <ProfileEventPicker
          owner={owner}
          selected={calendarOccurrenceId}
          disabled={
            pending ||
            !!pendingBody ||
            imagesPending ||
            featuredPending ||
            photosPending ||
            !visible
          }
          onSelect={(id) => {
            if (!visibleNow.current || pendingBody) return;
            setCalendarOccurrenceId(id);
            onDirty(true);
          }}
          onBusy={(value) => {
            setEventPending(value);
            onBusy(value || busy.current || featuredPending || photosPending);
          }}
        />
        {profile.photoLibraryEnabled && (
          <ProfilePhotoPicker
            owner={owner}
            username={profile.username}
            selected={photoIds}
            visible={visible}
            disabled={
              pending ||
              !!pendingBody ||
              imagesPending ||
              eventPending ||
              featuredPending ||
              !visible
            }
            onSelect={(ids) => {
              if (!visibleNow.current || pendingBody) return;
              setPhotoIds(ids);
              onDirty(true);
            }}
            onBusy={(value) => {
              setPhotosPending(value);
              onBusy(value || busy.current || eventPending || featuredPending);
            }}
          />
        )}
        {visible && (
          <>
            <fieldset disabled={!!pendingBody} className="min-w-0 space-y-5">
              <fieldset className="min-w-0 space-y-4">
                <legend className="text-2xl">Introduction and about you</legend>
                <p className="text-sm text-gc-muted">
                  Everything in this section is optional. Your location has its
                  own audience choice; other fields are visible to permitted
                  signed-in members. Leave any field empty if you prefer.
                </p>
                <div>
                  <label htmlFor="profile-bio">Bio (optional)</label>
                  <textarea
                    id="profile-bio"
                    name="bio"
                    rows={5}
                    maxLength={500}
                    defaultValue={draft.current.bio}
                    className={accountInputClass}
                  />
                  <p className="mt-2 text-sm text-gc-muted">
                    Up to 500 characters. A little about you, in your own words.
                  </p>
                </div>
                <label className="block" htmlFor="profile-introduction">
                  Pinned introduction (optional)
                  <textarea
                    id="profile-introduction"
                    name="introduction"
                    rows={4}
                    maxLength={1000}
                    className={accountInputClass}
                    defaultValue={draft.current.introduction}
                    aria-describedby="profile-introduction-help"
                  />
                </label>
                <p
                  id="profile-introduction-help"
                  className="text-sm text-gc-muted"
                >
                  A welcome above your About and Posts sections. Up to 1,000
                  characters.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="profile-location">
                      Location (optional)
                    </label>
                    <input
                      id="profile-location"
                      name="location"
                      maxLength={80}
                      defaultValue={draft.current.location}
                      aria-describedby="profile-location-help"
                      className={accountInputClass}
                    />
                    <p
                      id="profile-location-help"
                      className="mt-2 text-sm text-gc-muted"
                    >
                      A general place, such as your city. Up to 80 characters.
                      Avoid sharing your home address here.
                    </p>
                    <label
                      className="mt-3 block"
                      htmlFor="profile-location-audience"
                    >
                      Who can see your location?
                    </label>
                    <select
                      id="profile-location-audience"
                      name="locationAudience"
                      className={accountInputClass}
                      defaultValue={draft.current.locationAudience}
                    >
                      <option value="ONLY_ME">Only me</option>
                      <option
                        value="MEMBERS"
                        disabled={!profile.canShareLocation}
                      >
                        Permitted signed-in members
                      </option>
                    </select>
                    <p className="mt-2 text-sm text-gc-muted">
                      This does not change your private discovery area or church
                      directory contacts.
                    </p>
                    {!profile.canShareLocation && (
                      <p className="mt-2 text-sm text-gc-muted">
                        Member sharing requires a verified email and confirmed
                        adult eligibility.
                      </p>
                    )}
                    {profile.locationRecoveryRequired && (
                      <p role="status">
                        Your location was cleared during recovery to protect a
                        newer privacy choice. Review the text and audience
                        before saving again.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="profile-website">Website (optional)</label>
                    <input
                      id="profile-website"
                      name="website"
                      type="url"
                      maxLength={120}
                      placeholder="https://"
                      defaultValue={draft.current.website}
                      aria-describedby="profile-website-help"
                      className={accountInputClass}
                    />
                    <p
                      id="profile-website-help"
                      className="mt-2 text-sm text-gc-muted"
                    >
                      A full http:// or https:// link, up to 120 characters.
                    </p>
                  </div>
                </div>
                <div>
                  <label htmlFor="profile-interests">
                    Interests (optional)
                  </label>
                  <input
                    id="profile-interests"
                    name="interests"
                    maxLength={334}
                    defaultValue={draft.current.interests}
                    aria-describedby="profile-interests-help"
                    className={accountInputClass}
                  />
                  <p
                    id="profile-interests-help"
                    className="mt-2 text-sm text-gc-muted"
                  >
                    Separate up to 8 interests with commas. Up to 40 characters
                    each.
                  </p>
                </div>
              </fieldset>
              <p
                ref={feedback}
                tabIndex={-1}
                role="alert"
                className="break-words text-sm text-gc-error"
              >
                {message}
              </p>
              <fieldset className="min-w-0 space-y-4" disabled={pending}>
                <legend
                  id="profile-appearance-heading"
                  tabIndex={-1}
                  className="scroll-mt-24 text-2xl"
                >
                  Make it yours
                </legend>
                <p className="text-sm text-gc-muted">
                  These presets keep text readable and respect each reader’s
                  light or dark appearance.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="profile-palette">
                    Accent palette
                    <select
                      id="profile-palette"
                      name="palette"
                      className={accountInputClass}
                      value={palette}
                      onChange={(e) => {
                        setPalette(e.target.value);
                        setAppearanceEdited(true);
                      }}
                    >
                      {PROFILE_PALETTES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="profile-background">
                    Cover background
                    <select
                      id="profile-background"
                      name="background"
                      className={accountInputClass}
                      value={background}
                      onChange={(e) => {
                        setBackground(e.target.value);
                        setAppearanceEdited(true);
                      }}
                    >
                      {PROFILE_BACKGROUNDS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p
                  id="profile-appearance-status"
                  role="status"
                  className="text-sm"
                >
                  {appearanceEdited
                    ? "Unsaved appearance preview. Save profile to apply these choices."
                    : "Preview of your last confirmed saved appearance."}
                </p>
                <div
                  className="gc-profile-style-swatch"
                  aria-describedby="profile-appearance-status"
                  data-profile-background={background}
                  data-profile-palette={palette}
                >
                  A welcoming place for your story
                </div>
                <p className="text-sm text-gc-muted">
                  Last confirmed saved appearance: {savedAppearance}. The member
                  and visitor previews show your saved profile, not these
                  unsaved choices.
                </p>
                <button
                  type="button"
                  className="gc-profile-text-button min-h-11"
                  onClick={() => {
                    setPalette("sage");
                    setBackground("plain");
                    setAppearanceEdited(true);
                    onDirty(true);
                  }}
                >
                  Restore appearance defaults
                </button>
                <p className="text-sm text-gc-muted">
                  Restore changes only the draft palette and cover background.
                  Your text, section order, selected event and photos stay as
                  they are. Save profile when you are ready to apply your edits.
                </p>
                <label className="block" htmlFor="profile-order">
                  Section order
                  <select
                    id="profile-order"
                    name="sectionOrder"
                    className={accountInputClass}
                    defaultValue={draft.current.sectionOrder}
                  >
                    {PROFILE_ORDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </fieldset>
            {(conflict || pendingBody) && (
              <div className="gc-profile-confirm">
                <p>
                  Your entries have been preserved. An earlier save may already
                  be stored. Retrying sends the original values and versions; it
                  never adopts a newer version automatically.
                </p>
                {acceptedRedirect ? (
                  <button
                    type="button"
                    className="gc-profile-text-button"
                    disabled={pending}
                    onClick={() => void continueSaved()}
                  >
                    Continue to saved profile
                  </button>
                ) : pendingBody && !conflict ? (
                  <button
                    type="button"
                    className="gc-profile-text-button"
                    disabled={
                      pending ||
                      imagesPending ||
                      eventPending ||
                      photosPending ||
                      featuredPending
                    }
                    onClick={() => void sendOriginal(pendingBody)}
                  >
                    Retry original save
                  </button>
                ) : null}
                <button
                  type="button"
                  className="gc-profile-text-button"
                  disabled={pending}
                  onClick={() => void reviewSaved()}
                >
                  Review latest saved profile
                </button>
                {pendingBody && (
                  <button
                    type="button"
                    className="gc-profile-text-button"
                    disabled={pending}
                    onClick={() => void stopRetrying()}
                  >
                    Stop retrying and review
                  </button>
                )}
              </div>
            )}
            {latest && (
              <section
                className="gc-profile-confirm"
                aria-labelledby="latest-profile-heading"
              >
                <h3
                  id="latest-profile-heading"
                  ref={latestHeading}
                  tabIndex={-1}
                  className="text-xl"
                >
                  Latest saved version
                </h3>
                <dl className="space-y-2 break-words">
                  <div>
                    <dt>Name</dt>
                    <dd>{latest.name}</dd>
                  </div>
                  <div>
                    <dt>Bio</dt>
                    <dd>{latest.bio || "Empty"}</dd>
                  </div>
                  <div>
                    <dt>Participation choice</dt>
                    <dd>{roleLabels[latest.role]}</dd>
                  </div>
                  <div>
                    <dt>Location / website</dt>
                    <dd>
                      {latest.location || "Empty"} · {latest.website || "Empty"}
                    </dd>
                  </div>
                  <div>
                    <dt>Location audience</dt>
                    <dd>
                      {latest.locationAudience === "MEMBERS"
                        ? "Permitted signed-in members"
                        : "Only me"}
                    </dd>
                  </div>
                  <div>
                    <dt>Interests</dt>
                    <dd>{latest.interests.join(", ") || "Empty"}</dd>
                  </div>
                  <div>
                    <dt>Appearance / order</dt>
                    <dd>
                      {latest.presentation.palette},{" "}
                      {latest.presentation.background},{" "}
                      {latest.presentation.sectionOrder}
                    </dd>
                  </div>
                  <div>
                    <dt>Introduction</dt>
                    <dd>{latest.presentation.introduction || "Empty"}</dd>
                  </div>
                  <div>
                    <dt>Testimony</dt>
                    <dd className="whitespace-pre-wrap">
                      {latest.presentation.modules.testimony || "Empty"}
                    </dd>
                  </div>
                  <div>
                    <dt>Optional section order</dt>
                    <dd>
                      {profileModuleOrder(latest.presentation.modules)
                        .map((kind) => profileModuleLabels[kind])
                        .join(", ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Selected profile photos</dt>
                    <dd>
                      {latest.presentation.modules.photoIds?.length ? (
                        <ol>
                          {latest.presentation.modules.photoIds.map(
                            (id, index) => (
                              <li key={id} className="break-all">
                                {index + 1}. {id}
                              </li>
                            )
                          )}
                        </ol>
                      ) : (
                        "None"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Featured resource selections</dt>
                    <dd>
                      {latest.presentation.modules.featuredResources?.length ? (
                        <ol>
                          {latest.presentation.modules.featuredResources.map(
                            (reference, index) => (
                              <li
                                key={`${reference.kind}:${reference.id}`}
                                className="break-all"
                              >
                                {index + 1}. {reference.kind}: {reference.id}
                              </li>
                            )
                          )}
                        </ol>
                      ) : (
                        "None"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Selected event</dt>
                    <dd>
                      {latest.presentation.modules.calendarOccurrenceId ? (
                        <a
                          className="gc-profile-text-button"
                          href={`/platform/events/${encodeURIComponent(latest.presentation.modules.calendarOccurrenceId)}`}
                        >
                          Open saved event selection
                        </a>
                      ) : (
                        "None"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Skills</dt>
                    <dd>
                      {latest.presentation.modules.skills.join(", ") || "Empty"}
                    </dd>
                  </div>
                  <div>
                    <dt>Links</dt>
                    <dd>
                      {latest.presentation.modules.links.length
                        ? latest.presentation.modules.links.map((link) => (
                            <p key={link.url}>
                              {link.label}: {link.url}
                            </p>
                          ))
                        : "Empty"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="gc-profile-text-button"
                  disabled={pending}
                  onClick={() => void adoptReviewedVersion()}
                >
                  Keep my edits and use this version
                </button>
              </section>
            )}
            {imagesPending && (
              <p role="status" className="text-sm">
                Save or discard your selected photos before saving the profile
                details.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                pending ||
                !!pendingBody ||
                conflict ||
                imagesPending ||
                eventPending ||
                photosPending ||
                featuredPending
              }
              className="min-h-12 w-full rounded-full sm:w-auto"
            >
              {pending ? "Saving..." : "Save profile"}
            </Button>
          </>
        )}
      </fieldset>
    </form>
  );
}
