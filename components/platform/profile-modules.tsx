import { Fragment, type ReactNode } from "react";
import {
  profileModuleOrder,
  profileModuleSections,
  type ProfileModules
} from "@/lib/platform/profile-modules";

export function ProfileModuleContent({
  modules,
  photos
}: {
  modules: ProfileModules;
  photos?: ReactNode;
}) {
  const sections = profileModuleSections(modules);
  return profileModuleOrder(modules).map((kind) => {
    if (kind === "photos") return <Fragment key={kind}>{photos}</Fragment>;
    const section = sections.find((item) => item.kind === kind);
    if (!section) return null;
    return (
      <section
        key={section.kind}
        aria-labelledby={`profile-${section.kind}-heading`}
        className="space-y-3"
      >
        <h3 id={`profile-${section.kind}-heading`} className="text-xl">
          {section.kind === "testimony"
            ? "My testimony"
            : section.kind === "skills"
              ? "Skills"
              : "Links"}
        </h3>
        {section.kind === "testimony" ? (
          <p className="gc-profile-prose whitespace-pre-wrap">{section.text}</p>
        ) : section.kind === "skills" ? (
          <ul className="flex flex-wrap gap-2">
            {section.items.map((skill) => (
              <li className="gc-profile-interest" key={skill}>
                {skill}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {section.items.map((link, index) => (
              <li key={index}>
                <a
                  className="gc-profile-text-button break-all"
                  href={link.url}
                  rel="ugc nofollow noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  });
}
