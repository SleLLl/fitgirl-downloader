import { useQuery } from "@tanstack/react-query";
import { libraryGames } from "@/lib/library";

export function useLibrary() {
  return useQuery({ queryKey: ["library"], queryFn: libraryGames });
}
