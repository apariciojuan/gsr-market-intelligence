import Shell from "../../components/Shell";
import { MarketDetailScreen } from "../../screens";
import { useRouter } from "next/router";

export default function Page() {
  const { query } = useRouter();
  return (
    <Shell>
      <MarketDetailScreen slug={query.slug} />
    </Shell>
  );
}
