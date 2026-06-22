import { useQuery } from "@tanstack/react-query";
import { searchRepacks } from "@/lib/showcase";

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => searchRepacks(query),
    enabled: query.length >= 2,
  });
}
