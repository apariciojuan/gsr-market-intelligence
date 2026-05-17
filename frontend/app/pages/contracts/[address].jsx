/* /contracts/[address] — Contract detail (Fase 4, task 4.6). */
import { useRouter } from "next/router";
import Shell from "../../components/Shell";
import ContractDetailScreen from "../../screens/ContractDetailScreen";

export default function ContractDetailPage() {
  const { address } = useRouter().query;
  // `address` is undefined on the first render before the router hydrates;
  // the screen's hooks are gated on a truthy address, so this is safe.
  return (
    <Shell>
      <ContractDetailScreen address={address ? String(address) : undefined} />
    </Shell>
  );
}
