import Shell from "../../components/Shell";
import { ResolutionDetailScreen } from "../../screens";
import { useRouter } from "next/router";

export default function Page() {
  const { query } = useRouter();
  return (
    <Shell>
      <ResolutionDetailScreen slug={query.slug} />
    </Shell>
  );
}
