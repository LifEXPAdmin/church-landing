export default function PlatformLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="platform-design" data-appearance="system">
      {children}
    </div>
  );
}
