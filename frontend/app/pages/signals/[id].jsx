/* /signals/[id] — Signal detail (Fase 4, task 4.10). */
import { useRouter } from "next/router";
import Shell from "../../components/Shell";
import SignalDetailScreen from "../../screens/SignalDetailScreen";

export default function SignalDetailPage() {
  const { id } = useRouter().query;
  // `id` arrives as a string (or undefined during the first render / SSR).
  // The contract treats divergence ids as integers; pass a number to the hook
  // so `enabled` gates the query until the route is hydrated.
  const numericId =
    id != null && id !== "" && !Number.isNaN(Number(id))
      ? Number(id)
      : undefined;

  return (
    <Shell>
      <SignalDetailScreen id={numericId} />
    </Shell>
  );
}
