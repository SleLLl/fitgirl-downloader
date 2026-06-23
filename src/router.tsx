import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { GameDetail } from "@/components/GameDetail";
import Browse from "@/pages/Browse";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";
import Library from "@/pages/Library";
import Settings from "@/pages/Settings";
import {
  gameUrlFromSlug,
  slugFromUrl,
  type Repack,
} from "@/lib/showcase";

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/browse" });
  },
});

function BrowseRoute() {
  const navigate = useNavigate();
  const onSelect = (repack: Repack) =>
    navigate({ to: "/game/$slug", params: { slug: slugFromUrl(repack.pageUrl) } });
  return <Browse onSelect={onSelect} />;
}

function GameRoute() {
  const { slug } = gameRoute.useParams();
  const navigate = useNavigate();
  const url = gameUrlFromSlug(slug);
  const onBack = () => navigate({ to: "/browse" });
  return <GameDetail pageUrl={url} onBack={onBack} />;
}

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse",
  component: BrowseRoute,
});
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$slug",
  component: GameRoute,
});
const extractRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/extract",
  component: Game,
});
const downloadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/downloads",
  component: Downloads,
});
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: Library,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  browseRoute,
  gameRoute,
  extractRoute,
  downloadsRoute,
  libraryRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/browse"] }),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
