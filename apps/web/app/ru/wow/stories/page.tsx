import { StoryLibrary, storyLibraryMetadata } from "@/components/stories/StoryLibrary";

export const metadata = storyLibraryMetadata("ru");

export default function StoriesPage() {
  return <StoryLibrary lang="ru" />;
}
