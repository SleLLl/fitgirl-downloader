import { useQuery } from "@tanstack/react-query";
import { scrapePopular } from "@/lib/showcase";

export function usePopular() {
  return useQuery({ queryKey: ["popular"], queryFn: scrapePopular });
}
