import { StoryLibrary, storyLibraryMetadata } from "@/components/stories/StoryLibrary";

export const metadata = storyLibraryMetadata("en");

export default function StoriesPage() {
  return <StoryLibrary lang="en" />;
}
