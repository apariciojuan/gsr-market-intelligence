/* /resolutions/[questionId] — Resolution detail (Fase 4 task 4.8).
 * Route is `[questionId]` to match API_CONTRACT.md (the example used `[slug]`). */
import { useRouter } from "next/router";
import ResolutionDetailScreen from "../../screens/ResolutionDetailScreen";

export default function ResolutionDetailPage() {
  const { questionId } = useRouter().query;
  return (
    <ResolutionDetailScreen
      questionId={questionId ? String(questionId) : undefined}
    />
  );
}
