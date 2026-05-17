import Shell from "../../components/Shell";
import { ContractDetailScreen } from "../../screens";
import { useRouter } from "next/router";

export default function Page() {
  const { query } = useRouter();
  return (
    <Shell>
      <ContractDetailScreen address={query.address} />
    </Shell>
  );
}
