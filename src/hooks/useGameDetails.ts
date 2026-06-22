import { useQuery } from "@tanstack/react-query";
import { scrapeGame } from "@/lib/showcase";

export function useGameDetails(url: string) {
  return useQuery({
    queryKey: ["game", url],
    queryFn: () => scrapeGame(url),
    enabled: !!url,
  });
}
