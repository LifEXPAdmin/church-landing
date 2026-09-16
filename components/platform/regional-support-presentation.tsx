import { RegionalTime } from "./regional-presentation";
import {
  SupportTime as StaticSupportTime,
  SupportRows as StaticSupportRows,
  SupportConversation as StaticSupportConversation,
  supportTimeOptions
} from "./support-presentation";

// Live support views opt in here. The fictional demo retains the static owner.
export function SupportTime({ value }: { value: string }) {
  return (
    <StaticSupportTime value={value}>
      <RegionalTime value={value} options={supportTimeOptions} />
    </StaticSupportTime>
  );
}
const regionalTime = (value: string) => <SupportTime value={value} />;
export function SupportRows(
  props: Omit<React.ComponentProps<typeof StaticSupportRows>, "renderTime">
) {
  return <StaticSupportRows {...props} renderTime={regionalTime} />;
}
export function SupportConversation(
  props: Omit<React.ComponentProps<typeof StaticSupportConversation>, "renderTime">
) {
  return <StaticSupportConversation {...props} renderTime={regionalTime} />;
}
