/**
 * Space dashboard wrapper. Navigation (space switcher, members,
 * settings, public page) now lives in the app shell sidebar, so this only
 * keeps a consistent vertical rhythm for the page content.
 */
export function DashboardLayout(props: {
  spaceName: string;
  spaceSlug: string;
  children: React.ReactNode;
}) {
  return <div className="flex flex-col gap-6">{props.children}</div>;
}
